const dotenv = require("dotenv");
dotenv.config();
const path = require("path");
const { spawn } = require("child_process");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { jsonrepair } = require("jsonrepair");
const axios = require("axios");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const apiKey = process.env.GEMINI_API_KEY;

// New multi-stage prompt builders
const buildApproachMiningPrompt = require("../LLMPromptBuilder/buildApproachMiningPrompt.js");
const {
  buildEdgeReasoningPrompt,
  buildLargeReasoningPrompt,
  buildGenericReasoningPrompt,
  buildAdversarialReasoningPrompt,
  buildSampleEntry,
} = require("../LLMPromptBuilder/buildFocusedReasoningPrompts.js");

// Existing prompt builders (unchanged)
const buildInputCodePrompt = require("../LLMPromptBuilder/buildInputCodePrompt.js");
const buildOutputCodePrompt = require("../LLMPromptBuilder/buildOutputCodePrompt.js");
const buildSolutionGuidance = require("../metadata/buildSolutionGuidance.js");

const Anthropic = require("@anthropic-ai/sdk");
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function callClaude(prompt, useThinking = true) {
  const config = {
    model: "claude-opus-4-6",
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
  };
  if (useThinking) {
    config.thinking = { type: "enabled", budget_tokens: 10000 };
  }
  const response = await anthropic.messages.create(config);
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.text || "";
}

function extractJSON(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in response");
  const rawText = text.slice(start, end + 1);
  try {
    return JSON.parse(rawText);
  } catch (err) {
    let cleanedText = rawText.replace(/\\bullet/g, "\\\\bullet");
    cleanedText = cleanedText.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
    return JSON.parse(cleanedText);
  }
}

function extractPython(text) {
  const fenceMatch = text.match(/```python\n([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const genericFence = text.match(/```\n([\s\S]*?)```/);
  if (genericFence) return genericFence[1].trim();
  return text.trim();
}

function extractJsonPayload(text) {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("No JSON object found in response");
  }
  return text.slice(firstBrace, lastBrace + 1);
}

function repairJsonEscapes(text) {
  let repaired = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (!inString) {
      repaired += char;
      if (char === '"') inString = true;
      continue;
    }

    if (escaped) {
      repaired += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      const nextChar = text[i + 1];
      if (nextChar && !'"\\/bfnrtu'.includes(nextChar)) {
        repaired += "\\\\";
      } else {
        repaired += char;
      }
      escaped = nextChar && '"\\/bfnrtu'.includes(nextChar);
      continue;
    }

    if (char === "\n") {
      repaired += "\\n";
      continue;
    }

    if (char === "\r") {
      repaired += "\\r";
      continue;
    }

    if (char === "\t") {
      repaired += "\\t";
      continue;
    }

    repaired += char;
    if (char === '"') inString = false;
  }

  return repaired;
}

function extractJsonStringField(text, key) {
  const pattern = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "s");
  const match = text.match(pattern);
  if (!match) return null;

  const rawValue = match[1]
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");

  return rawValue;
}

function safeParseProblemJSON(text) {
  const payload = extractJsonPayload(text);
  const repaired = repairJsonEscapes(payload);

  try {
    return JSON.parse(jsonrepair(repaired));
  } catch (error) {
    const fallback = {
      title: extractJsonStringField(payload, "title") || "Untitled Problem",
      problemStatement:
        extractJsonStringField(payload, "problemStatement") || "",
      inputFormat: extractJsonStringField(payload, "inputFormat") || "",
      outputFormat: extractJsonStringField(payload, "outputFormat") || "",
      constraints: extractJsonStringField(payload, "constraints") || "",
      sampleInput: extractJsonStringField(payload, "sampleInput") || "",
      sampleOutput: extractJsonStringField(payload, "sampleOutput") || "",
      explanation: extractJsonStringField(payload, "explanation") || "",
      inferredComplexity:
        extractJsonStringField(payload, "inferredComplexity") ||
        (text.includes("O(n^2)") ? "O(n^2)" : "unknown"),
    };

    if (!fallback.problemStatement && !fallback.inputFormat) {
      throw error;
    }

    return fallback;
  }
}

// Safe JSON parse with JSON-string escape repair
function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const payload = extractJsonPayload(text);
    const repairAttempts = [
      payload,
      repairJsonEscapes(payload),
      jsonrepair(payload),
      jsonrepair(repairJsonEscapes(payload)),
    ];

    let lastError = e;
    for (const attempt of repairAttempts) {
      try {
        return JSON.parse(attempt);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }
}

const tagPriority = [
  "Sorting",
  "Dynamic Programming",
  "Graph",
  "Backtracking",
  "Union Find",
  "Topological Sort",
  "Monotonic Stack",
  "Sliding Window",
  "Divide and Conquer",
  "Two Pointers",
  "Prefix Sum",
  "Heap",
  "Hash Table",
  "String",
  "Stack",
  "Queue",
  "Searching",
  "Bit Manipulation",
  "Game Theory",
  "Simulation",
  "Matrix",
  "Greedy",
  "Math",
  "Recursion",
  "Array",
];

// Fixed 5-file topology — always the same, no user selection
const FIXED_TOPOLOGY = ["sample", "edge", "generic", "large", "adversarial"];

// ─────────────────────────────────────────────────────────────────────────────
// mergeReasoningResults
// Combines four focused reasoning JSONs into one object matching
// the schema that buildInputCodePrompt expects
// ─────────────────────────────────────────────────────────────────────────────
function mergeReasoningResults(reasoningByType, fileList, approaches) {
  const testcases = [];

  // Sample — no LLM needed
  const sampleFiles = fileList.filter((f) => f.type === "sample");
  for (const f of sampleFiles) {
    testcases.push({
      file: f.filename,
      type: "sample",
      purpose: "Verify basic functionality against provided sample",
      instruction: "use exact sample provided",
    });
  }

  // Edge
  const edgeResult = reasoningByType.edge;
  if (edgeResult?.files) {
    for (const file of edgeResult.files) testcases.push(file);
  } else if (edgeResult?.cases) {
    // flat structure fallback
    const edgeFile = fileList.find((f) => f.type === "edge");
    if (edgeFile)
      testcases.push({ ...edgeResult, file: edgeFile.filename, type: "edge" });
  }

  // Generic
  const genericResult = reasoningByType.generic;
  if (genericResult?.files) {
    for (const file of genericResult.files) testcases.push(file);
  } else if (genericResult) {
    const genericFile = fileList.find((f) => f.type === "generic");
    if (genericFile)
      testcases.push({
        ...genericResult,
        file: genericFile.filename,
        type: "generic",
      });
  }

  // Large
  const largeResult = reasoningByType.large;
  if (largeResult?.files) {
    for (const file of largeResult.files) testcases.push(file);
  } else if (largeResult) {
    const largeFile = fileList.find((f) => f.type === "large");
    if (largeFile)
      testcases.push({
        ...largeResult,
        file: largeFile.filename,
        type: "large",
      });
  }

  // Adversarial
  const advResult = reasoningByType.adversarial;
  if (advResult?.files) {
    for (const file of advResult.files) testcases.push(file);
  } else if (advResult) {
    const advFile = fileList.find((f) => f.type === "adversarial");
    if (advFile)
      testcases.push({
        ...advResult,
        file: advFile.filename,
        type: "adversarial",
      });
  }

  return {
    problem_analysis: {
      broad_tag: approaches.correct_algorithm?.name || "unknown",
      exact_optimal_complexity:
        approaches.correct_algorithm?.complexity || "unknown",
      max_allowed_sum_of_n_over_T:
        largeResult?.max_allowed_sum_of_n ||
        largeResult?.files?.[0]?.sum_n ||
        200000,
      identified_common_pitfalls:
        approaches.wrong_approaches?.slice(0, 3).map((a) => a.name) || [],
    },
    testcases,
  };
}

module.exports = {
  // ─────────────────────────────────────────────────────────────────────────
  // genAIProblem — unchanged from original
  // ─────────────────────────────────────────────────────────────────────────
  genAIProblem: async (req, res) => {
    const { tags, difficulty, questionStyle, additionalContext } = req.body;
    const expectedComplexity = req.body.expectedComplexity || null;

    const sessionId = uuidv4();
    const tempDir = path.join(__dirname, "../uploads", sessionId);
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "input.json"),
      JSON.stringify(
        { tags, difficulty, expectedComplexity, additionalContext },
        null,
        2,
      ),
    );

    const knowledge = require("../metadata/adversarial_patterns.json");
    const primaryTag =
      tagPriority.find((t) => tags.includes(t) && knowledge[t]) ??
      tags.find((t) => knowledge[t]);
    const tagKnowledge = primaryTag ? knowledge[primaryTag] : null;

    const problemPrompt = `
You are an expert competitive programming problem setter.

${additionalContext ? `User Context(use this info to build the problem): ${additionalContext}\n\n` : ""}

STRICT RESKINNING DIRECTIVE:
CRITICAL: DO NOT INVENT NOVEL ALGORITHMIC LOGIC OR MATH FROM SCRATCH. 
You must select a well-known, mathematically verified problem from LeetCode, Codeforces, or CSES based on the tags: ${tags.join(", ")}.
Your task is to RE-SKIN this problem. Keep the exact underlying mathematical logic, constraints, edge cases, and optimal solution structure of the original problem.
Only change the "flavor text" (the story context, character names, object names) to make the presentation original (Style: ${questionStyle || "General"}). 
Ensuring absolute algorithmic correctness and avoiding ambiguity is your highest priority.

Difficulty: ${difficulty}
${
  expectedComplexity
    ? `COMPLEXITY: The solution must be ${expectedComplexity}.`
    : `COMPLEXITY: Choose the exact complexity of the original verified problem you are re-skinning.`
}

${
  tagKnowledge
    ? `
REFERENCE KNOWLEDGE FOR THIS PROBLEM TYPE (${primaryTag}):
Common suboptimal approaches students will submit:
${tagKnowledge.suboptimal_algorithms?.map((a) => `- ${a.name}: ${a.complexity} — ${a.how_common}`).join("\n")}
Constraint budget reference:
${JSON.stringify(tagKnowledge.constraint_budget, null, 2)}
`
    : ""
}

CONSTRAINT REQUIREMENTS:
- Use Codeforces style: T on first line, then per-testcase data
- Calibrate T and N so that:
  ${
    difficulty === "Easy"
      ? "Constraints can be relaxed(depends on question). A simple brute force O(n²) may pass."
      : difficulty === "Hard"
        ? "Constraints are tight. Only the optimal solution passes."
        : "Moderate. The optimal solution passes. A naive O(n²) should TLE."
  }
- Always state explicit constraints: ranges for T, N, and value limits.

FORMATTING REQUIREMENTS:
- Use Markdown for structure. DO NOT use * or - bullets — use $\\\\bullet$ instead.
- Use LaTeX for math. Double-escape backslashes in JSON (e.g. $\\\\le$).
- IMPORTANT: Leave a blank line after each $\\\\bullet$ sentence.
- use -> for plain ASCII arrow if needed for explanation or wherever dont use simple arrow it doesnt render.

Return ONLY valid JSON:
{
  "title": "string",
  "problemStatement": "string",
  "inputFormat": "string",
  "outputFormat": "string",
  "constraints": "string",
  "sampleInput": "string",
  "sampleOutput": "string",
  "explanation": "string",
  "inferredComplexity": "string"
}`;

    const buildSolutionPrompt = (problemData) => `
You are writing a correct Python solution for a competitive programming problem.

PROBLEM: ${problemData.problemStatement}
INPUT FORMAT: ${problemData.inputFormat}
OUTPUT FORMAT: ${problemData.outputFormat}
CONSTRAINTS: ${problemData.constraints}
SAMPLE INPUT: ${problemData.sampleInput}
SAMPLE OUTPUT: ${problemData.sampleOutput}

${buildSolutionGuidance(tags, problemData.inferredComplexity)}

REQUIREMENTS:
- Expected complexity: ${expectedComplexity || problemData.inferredComplexity}
- Standard libraries only
- Use solve() called T times:
    T = int(input())
    for _ in range(T):
        solve()
- Trace through sample input manually. Output must match exactly.

Return ONLY Python code. No markdown fences.`;

    try {
      const gemini = new GoogleGenerativeAI(apiKey);
      const jsonModel = gemini.getGenerativeModel({
        model: "gemini-3-flash-preview",
        generationConfig: { responseMimeType: "application/json" },
      });
      const textModel = gemini.getGenerativeModel({
        model: "gemini-3-flash-preview",
      });

      const problemResult = await jsonModel.generateContent(problemPrompt);
      const problemData = safeParseProblemJSON(problemResult.response.text());

      console.log(
        "[genAIProblem] Problem:",
        problemData.problemStatement?.slice(0, 80),
      );
      console.log("[genAIProblem] Complexity:", problemData.inferredComplexity);

      const solutionResult = await textModel.generateContent(
        buildSolutionPrompt(problemData),
      );
      const solutionCode = solutionResult.response
        .text()
        .replace(/```python|```/g, "")
        .trim();

      const genaiResponse = {
        ...problemData,
        solution: solutionCode,
        tags,
        difficulty,
        expectedComplexity:
          expectedComplexity || problemData.inferredComplexity,
      };

      fs.writeFileSync(
        path.join(tempDir, "genai_response.json"),
        JSON.stringify(genaiResponse, null, 2),
      );

      res.json({ ok: true, sessionId, genaiResponse });
    } catch (err) {
      console.error("[genAIProblem] Error:", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // genAITestcases — new multi-stage pipeline
  // Fixed 5-file topology: sample, edge, generic, large, adversarial
  // ─────────────────────────────────────────────────────────────────────────
  genAITestcases: async (req, res) => {
    const { sessionId } = req.body;

    const tempDir = path.join(__dirname, "../uploads", sessionId);
    const genaiPath = path.join(tempDir, "genai_response.json");
    if (!fs.existsSync(genaiPath))
      return res.status(400).json({ ok: false, error: "Session not found" });

    const problemData = JSON.parse(fs.readFileSync(genaiPath, "utf-8"));
    const { tags, expectedComplexity, difficulty } = problemData;

    // Fixed topology — always these 5 files in this order
    const fileList = FIXED_TOPOLOGY.map((type, i) => ({
      index: String(i).padStart(2, "0"),
      type,
      filename: `input/input${String(i).padStart(2, "0")}.txt`,
    }));

    const filesByType = {
      sample: fileList.filter((f) => f.type === "sample"),
      edge: fileList.filter((f) => f.type === "edge"),
      generic: fileList.filter((f) => f.type === "generic"),
      large: fileList.filter((f) => f.type === "large"),
      adversarial: fileList.filter((f) => f.type === "adversarial"),
    };

    const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Model factory helpers
    const flashLiteJSON = () =>
      gemini.getGenerativeModel({
        model: "gemini-3.1-flash-lite",
        generationConfig: { responseMimeType: "application/json" },
      });
    const flashJSON = () =>
      gemini.getGenerativeModel({
        model: "gemini-3.5-flash",
        generationConfig: { responseMimeType: "application/json" },
      });
    const flashText = () =>
      gemini.getGenerativeModel({
        model: "gemini-3.5-flash",
      });
    const flashText3_0 = () =>
      gemini.getGenerativeModel({
        model: "gemini-3-flash-preview",
      });

    try {
      // ── STAGE 1: Approach Mining ─────────────────────────────────────────
      // One call dedicated to enumerating every wrong approach and killing structure
      // Flash Lite — pure reasoning, cheap, runs fast
      console.log("[genAITestcases] Stage 1: approach mining...");
      const miningRaw = await flashJSON().generateContent(
        buildApproachMiningPrompt(problemData),
      );
      const approaches = safeParseJSON(miningRaw.response.text());
      fs.writeFileSync(
        path.join(tempDir, "approaches.json"),
        JSON.stringify(approaches, null, 2),
      );
      console.log(
        `[genAITestcases] Mined ${approaches.wrong_approaches?.length || 0} wrong approaches`,
      );

      // ── STAGE 2: Parallel Focused Reasoning ──────────────────────────────
      // Four concurrent calls, each focused on exactly one file type
      // Flash Lite for edge/generic/large, full Flash for adversarial
      console.log("[genAITestcases] Stage 2: parallel focused reasoning...");

      const [edgeRaw, genericRaw, largeRaw, adversarialRaw] = await Promise.all(
        [
          flashLiteJSON().generateContent(
            buildEdgeReasoningPrompt(
              problemData,
              expectedComplexity,
              approaches,
              filesByType.edge,
              difficulty,
            ),
          ),
          flashLiteJSON().generateContent(
            buildGenericReasoningPrompt(
              problemData,
              expectedComplexity,
              approaches,
              filesByType.generic,
              difficulty,
            ),
          ),
          flashLiteJSON().generateContent(
            buildLargeReasoningPrompt(
              problemData,
              expectedComplexity,
              approaches,
              filesByType.large,
              difficulty,
            ),
          ),
          flashJSON().generateContent(
            buildAdversarialReasoningPrompt(
              problemData,
              expectedComplexity,
              approaches,
              filesByType.adversarial,
              difficulty,
            ),
          ),
        ],
      );

      const reasoningByType = {
        edge: safeParseJSON(edgeRaw.response.text()),
        generic: safeParseJSON(genericRaw.response.text()),
        large: safeParseJSON(largeRaw.response.text()),
        adversarial: safeParseJSON(adversarialRaw.response.text()),
      };

      // Merge into single reasoning object for buildInputCodePrompt
      const reasoning = mergeReasoningResults(
        reasoningByType,
        fileList,
        approaches,
      );
      fs.writeFileSync(
        path.join(tempDir, "reasoning.json"),
        JSON.stringify(reasoning, null, 2),
      );
      console.log("[genAITestcases] Stage 2 complete");

      // ── STAGE 3: Code Generation ──────────────────────────────────────────
      // Input and output code generated in parallel
      // Full Flash — code quality matters
      console.log("[genAITestcases] Stage 3: code generation...");

      const inputCodePrompt = buildInputCodePrompt(
        { ...problemData, approaches },
        reasoning,
        fileList,
        {},
      );
      const outputCodePrompt = buildOutputCodePrompt(
        {
          inputFormat: problemData.inputFormat,
          outputFormat: problemData.outputFormat,
          solution: problemData.solution,
        },
        fileList,
      );

      const inputCodeRaw = await flashText().generateContent(inputCodePrompt);
      const outputCodeRaw =
        await flashText3_0().generateContent(outputCodePrompt);

      const inputGenCode = extractPython(inputCodeRaw.response.text());
      const outputGenCode = extractPython(outputCodeRaw.response.text());

      fs.writeFileSync(path.join(tempDir, "inputGenCode.py"), inputGenCode);
      fs.writeFileSync(path.join(tempDir, "outputGenCode.py"), outputGenCode);

      console.log("[genAITestcases] Done");
      return res.json({ ok: true, sessionId, reasoning });
    } catch (err) {
      console.error("[genAITestcases] Error:", err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // runPipeline — unchanged
  // ─────────────────────────────────────────────────────────────────────────
  runPipeline: async (req, res) => {
    const data = req.body;
    const sessionId = data.jobid;
    const dir = path.join(__dirname, "../uploads", sessionId);

    const inputCode = fs.readFileSync(
      path.join(dir, "inputGenCode.py"),
      "utf-8",
    );
    const outputCode = fs.readFileSync(
      path.join(dir, "outputGenCode.py"),
      "utf-8",
    );
    const metaData = JSON.parse(
      fs.readFileSync(path.join(dir, "genai_response.json"), "utf-8"),
    );

    const jobData = {
      jobid: sessionId,
      inputCode,
      outputCode,
      MetaData: metaData,
    };

    const APP_CONFIG = require("../config/appConfig");
    try {
      const response = await fetch(`${APP_CONFIG.CE_ENGINE_BASE}/CEPipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobData),
      });
      const result = await response.json();
      res.json({ ok: true, result });
    } catch (err) {
      console.error("Error in runPipeline:", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // downloadTestcases — unchanged
  // ─────────────────────────────────────────────────────────────────────────
  downloadTestcases: async (req, res) => {
    const id = req.params.id;
    console.log("Sending Download req to CE engine");
    const APP_CONFIG = require("../config/appConfig");
    const getFile = await axios(`${APP_CONFIG.CE_ENGINE_BASE}/download/${id}`, {
      method: "GET",
      responseType: "stream",
    });
    res.set({
      "Content-Disposition": `attachment; filename="testcases_${id}.zip"`,
      "Content-Type": "application/zip",
    });
    getFile.data.pipe(res);
  },
};
