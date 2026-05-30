const dotenv = require("dotenv");
dotenv.config();
const path = require("path");
const { spawn } = require("child_process");
const axios = require("axios");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const {
  extractJSON,
  extractJsonPayload,
  repairJsonEscapes,
  extractJsonStringField,
  safeParseProblemJSON,
  safeParseJSON,
} = require("../utils/json");
const {
  callClaude,
  createGemini,
  createGeminiFactories,
} = require("../utils/ai");
const { extractPython } = require("../utils/parsing");
const APP_CONFIG = require("../config/appConfig");
const { mergeInputGenScripts } = require("../utils/mergeScripts");
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  // Pull buggy python functions from adversarial reasoning into merged output
  // so buildInputCodePrompt can access them directly
  const advBuggyFunctions =
    advResult?.files?.[0]?.buggy_implementations ||
    advResult?.buggy_implementations ||
    [];

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
    input_signature: approaches.input_signature || null,
    adversarial_buggy_functions: advBuggyFunctions,
    testcases,
  };
}
module.exports = {
  // ─────────────────────────────────────────────────────────────────────────
  // genAIProblem — unchanged from original
  // ─────────────────────────────────────────────────────────────────────────
  genAIProblem: async (req, res) => {
    const { tags, difficulty, additionalContext, API_KEY, ValidSolution } =
      req.body;
    const expectedComplexity = req.body.expectedComplexity || null;
    const geminiApiKey = API_KEY || APP_CONFIG.GEMINI_API_KEY;

    if (!geminiApiKey) {
      return res.status(400).json({ ok: false, error: "API_KEY is required" });
    }

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

${additionalContext ? `User Context(CRITICAL : use this exact info to build the problem): ${additionalContext}\n\n` : ""}

STRICT RESKINNING DIRECTIVE:
CRITICAL: DO NOT INVENT NOVEL ALGORITHMIC LOGIC OR MATH FROM SCRATCH. 
You must select a well-known, mathematically verified problem from LeetCode, Codeforces, or CSES based on the tags: ${tags.join(", ")}.
Your task is to RE-SKIN this problem. Keep the exact underlying mathematical logic, constraints, edge cases, and optimal solution structure of the original problem.
Only change the "flavor text" (the story context, character names, object names) to make the presentation original(Style : LeetCode). 
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
        ? "(USE OPTIMAL CONSTRAINTS)Only the optimal solution passes."
        : "(USE OPTIMAL CONSTRAINTS)Only the optimal solution passes."
  }
- Always state explicit constraints: ranges for T, N, and value limits.
- Do not print memory or time limits in constraints section,

FORMATTING REQUIREMENTS:
- Use Markdown for structure. DO NOT use * or - bullets — use $\\\\bullet$ instead.
- Use LaTeX for math. Double-escape backslashes in JSON (e.g. $\\\\le$).
- IMPORTANT: Leave a blank line after each $\\\\bullet$ sentence.
- use $\\\\to$ for arrow if needed for explanation or wherever.

- CRITICAL: sampleInput & sampleOutput must be absolutely correct dry run/execute it to verify the output then write valid explanation for each test case using proper formatting.

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

- IMPORTANT: Reference Valid Solution of UnSkinned Problem : ${ValidSolution ? ValidSolution : "Construct valid solution based on problem statement and constraints"}

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
      const gemini = createGemini(geminiApiKey);
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
    const { sessionId, API_KEY } = req.body;
    const force = req.body.force || false;
    const geminiApiKey = API_KEY || APP_CONFIG.GEMINI_API_KEY;

    if (!geminiApiKey) {
      return res.status(400).json({ ok: false, error: "API_KEY is required" });
    }

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

    const gemini = createGemini(geminiApiKey);
    const { flashLiteJSON, flashJSON, flashText, flashText3_0 } =
      createGeminiFactories(gemini);

    try {
      // ── STAGE 1: Approach Mining ─────────────────────────────────────────
      // One call dedicated to enumerating every wrong approach and killing structure
      // Flash Lite — pure reasoning, cheap, runs fast
      const approachesPath = path.join(tempDir, "approaches.json");
      let approaches;
      if (!force && fs.existsSync(approachesPath)) {
        try {
          const raw = fs.readFileSync(approachesPath, "utf-8").trim();
          if (raw) {
            approaches = JSON.parse(raw);
            console.log(
              "[genAITestcases] Stage 1: approaches.json exists — skipping mining",
            );
          }
        } catch (e) {
          console.log(
            "[genAITestcases] Stage 1: existing approaches.json is invalid, re-running mining",
          );
          approaches = null;
        }
      }

      if (!approaches) {
        console.log("[genAITestcases] Stage 1: approach mining...");
        const miningRaw = await flashJSON().generateContent(
          buildApproachMiningPrompt(problemData),
        );
        approaches = safeParseJSON(miningRaw.response.text());
        fs.writeFileSync(approachesPath, JSON.stringify(approaches, null, 2));
        console.log(
          `[genAITestcases] Mined ${approaches.wrong_approaches?.length || 0} wrong approaches`,
        );
      }

      // ── STAGE 2: Focused Reasoning (staggered) ───────────────────────────
      // Four calls, staggered to reduce burst rate. Skip if valid reasoning.json exists.
      console.log("[genAITestcases] Stage 2: focused reasoning...");
      const reasoningPath = path.join(tempDir, "reasoning.json");
      let reasoning;
      if (!force && fs.existsSync(reasoningPath)) {
        try {
          const raw = fs.readFileSync(reasoningPath, "utf-8").trim();
          if (raw) {
            reasoning = JSON.parse(raw);
            console.log(
              "[genAITestcases] Stage 2: reasoning.json exists — skipping focused reasoning",
            );
          }
        } catch (e) {
          console.log(
            "[genAITestcases] Stage 2: existing reasoning.json is invalid, re-running focused reasoning",
          );
          reasoning = null;
        }
      }

      if (!reasoning) {
        console.log(
          "[genAITestcases] Stage 2: running focused reasoning (staggered)...",
        );
        const tasks = [
          {
            key: "edge",
            factory: flashLiteJSON,
            prompt: buildEdgeReasoningPrompt(
              problemData,
              expectedComplexity,
              approaches,
              filesByType.edge,
              difficulty,
            ),
          },
          {
            key: "generic",
            factory: flashLiteJSON,
            prompt: buildGenericReasoningPrompt(
              problemData,
              expectedComplexity,
              approaches,
              filesByType.generic,
              difficulty,
            ),
          },
          {
            key: "large",
            factory: flashLiteJSON,
            prompt: buildLargeReasoningPrompt(
              problemData,
              expectedComplexity,
              approaches,
              filesByType.large,
              difficulty,
            ),
          },
          {
            key: "adversarial",
            factory: flashJSON,
            // For adversarial reasoning prefer only the top-2 ranked wrong approaches
            // (controller-side filter). This keeps other prompts unchanged.
            prompt: buildAdversarialReasoningPrompt(
              problemData,
              expectedComplexity,
              {
                ...approaches,
                wrong_approaches: (approaches.wrong_approaches || [])
                  .slice()
                  .sort((a, b) => (a.rank || 999) - (b.rank || 999))
                  .slice(0, 2),
              },
              filesByType.adversarial,
              difficulty,
            ),
          },
        ];

        const rawResponses = {};

        for (let i = 0; i < tasks.length; i += 1) {
          const t = tasks[i];
          // stagger starts by 2000-3000ms
          const delayMs = 2000 + i * 500;
          await sleep(delayMs);
          console.log(
            `[genAITestcases] Starting reasoning for ${t.key} after ${delayMs}ms delay`,
          );
          try {
            const resp = await t.factory().generateContent(t.prompt);
            rawResponses[t.key] = resp;
          } catch (err) {
            console.error(
              `[genAITestcases] Error during ${t.key} reasoning:`,
              err,
            );
            throw err;
          }
        }

        const reasoningByType = {
          edge: safeParseJSON(rawResponses.edge.response.text()),
          generic: safeParseJSON(rawResponses.generic.response.text()),
          large: safeParseJSON(rawResponses.large.response.text()),
          adversarial: safeParseJSON(rawResponses.adversarial.response.text()),
        };

        // Merge into single reasoning object for buildInputCodePrompt
        reasoning = mergeReasoningResults(
          reasoningByType,
          fileList,
          approaches,
        );
        fs.writeFileSync(reasoningPath, JSON.stringify(reasoning, null, 2));
        console.log("[genAITestcases] Stage 2 complete");
      }

      // reasoning is available (either loaded from file or just computed above)

      // ── STAGE 3: Code Generation (SPLIT INTO TWO CALLS) ──────────────────

      const inputCodePath = path.join(tempDir, "inputGenCode.py");
      const outputCodePath = path.join(tempDir, "outputGenCode.py");
      const fileNonEmpty = (p) => fs.existsSync(p) && fs.statSync(p).size > 0;

      if (
        !force &&
        fileNonEmpty(inputCodePath) &&
        fileNonEmpty(outputCodePath)
      ) {
        console.log(
          "[genAITestcases] Stage 3: code files exist — skipping code generation",
        );
        return res.json({ ok: true, sessionId, reasoning });
      }

      console.log("[genAITestcases] Stage 3: code generation (split calls)...");

      // Merge buggy functions from adversarial reasoning into approaches
      const advBuggyFromReasoning = reasoning.adversarial_buggy_functions || [];

      const enrichedApproaches = {
        ...approaches,
        wrong_approaches: (approaches.wrong_approaches || []).map((wa) => {
          if (wa.buggy_python_function) return wa;
          const advMatch = advBuggyFromReasoning.find(
            (b) => b.name === wa.name || b.name?.includes(wa.name),
          );
          if (advMatch?.python_function) {
            return { ...wa, buggy_python_function: advMatch.python_function };
          }
          return wa;
        }),
      };

      const problemWithApproaches = {
        ...problemData,
        approaches: enrichedApproaches,
      };

      // Split file list
      const nonAdvFileList = fileList.filter((f) => f.type !== "adversarial");
      const advFileList = fileList.filter((f) => f.type === "adversarial");

      // ── CALL 1: sample + edge + generic + large ──────────────────────────
      const inputCodePrompt1 = buildInputCodePrompt(
        problemWithApproaches,
        reasoning,
        nonAdvFileList, // only non-adversarial files
        { excludeAdversarial: true },
      );

      // ── CALL 2: adversarial only ─────────────────────────────────────────
      // Create a problem-with-approaches variant that contains only the top-2
      // ranked wrong_approaches for the adversarial generator.
      const filteredWrongApproaches = (
        enrichedApproaches.wrong_approaches || []
      )
        .slice()
        .sort((a, b) => (a.rank || 999) - (b.rank || 999))
        .slice(0, 2);
      const enrichedApproachesAdv = {
        ...enrichedApproaches,
        wrong_approaches: filteredWrongApproaches,
      };
      const problemWithApproachesAdv = {
        ...problemData,
        approaches: enrichedApproachesAdv,
      };

      const inputCodePrompt2 = buildInputCodePrompt(
        problemWithApproachesAdv,
        reasoning,
        advFileList, // only adversarial file
        { adversarialOnly: true },
      );

      // ── CALL 3: output code (unchanged) ─────────────────────────────────
      const outputCodePrompt = buildOutputCodePrompt(
        {
          inputFormat: problemData.inputFormat,
          outputFormat: problemData.outputFormat,
          solution: problemData.solution,
        },
        fileList,
      );

      console.log(
        "[genAITestcases] Stage 3: launching staggered code gen calls...",
      );

      let inputCodeRaw1, inputCodeRaw2, outputCodeRaw;

      try {
        const inputCodePromise1 = flashText().generateContent(inputCodePrompt1);
        await sleep(1500);
        const inputCodePromise2 = flashText().generateContent(inputCodePrompt2);
        await sleep(1500);
        const outputCodePromise =
          flashText3_0().generateContent(outputCodePrompt);

        [inputCodeRaw1, inputCodeRaw2, outputCodeRaw] = await Promise.all([
          inputCodePromise1,
          inputCodePromise2,
          outputCodePromise,
        ]);
      } catch (err) {
        console.error(
          "[genAITestcases] Stage 3: one or more code gen calls failed:",
          err.message,
        );

        // Fallback: try single combined call
        console.log(
          "[genAITestcases] Stage 3: falling back to single combined call...",
        );
        const combinedPrompt = buildInputCodePrompt(
          problemWithApproaches,
          reasoning,
          fileList,
          {},
        );
        const combinedRaw = await flashText().generateContent(combinedPrompt);
        const combinedCode = extractPython(combinedRaw.response.text());

        fs.writeFileSync(path.join(tempDir, "inputGenCode.py"), combinedCode);

        // Output code still needed
        const outputCodeRawFallback =
          await flashText3_0().generateContent(outputCodePrompt);
        const outputGenCode = extractPython(
          outputCodeRawFallback.response.text(),
        );
        fs.writeFileSync(path.join(tempDir, "outputGenCode.py"), outputGenCode);

        console.log("[genAITestcases] Stage 3: done (fallback mode)");
        return res.json({ ok: true, sessionId, reasoning, mode: "fallback" });
      }

      const inputGenCode1 = extractPython(inputCodeRaw1.response.text());
      const inputGenCode2 = extractPython(inputCodeRaw2.response.text());
      const outputGenCode = extractPython(outputCodeRaw.response.text());

      const mergedInputGenCode = mergeInputGenScripts(
        inputGenCode1,
        inputGenCode2,
      );

      fs.writeFileSync(
        path.join(tempDir, "inputGenCode.py"),
        mergedInputGenCode,
      );
      fs.writeFileSync(path.join(tempDir, "outputGenCode.py"), outputGenCode);

      // Save individual scripts for debugging
      fs.writeFileSync(
        path.join(tempDir, "inputGenCode_main.py"),
        inputGenCode1,
      );
      fs.writeFileSync(
        path.join(tempDir, "inputGenCode_adv.py"),
        inputGenCode2,
      );

      console.log("[genAITestcases] Stage 3: done (split mode)");
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
