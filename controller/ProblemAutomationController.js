const dotenv = require("dotenv");
dotenv.config();
const path = require("path");
const { spawn } = require("child_process");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const { diff } = require("util");
const apiKey = process.env.GEMINI_API_KEY;
const buildReasoningPrompt = require("../LLMPromptBuilder/buildReasoningPrompt.js");
const buildInputCodePrompt = require("../LLMPromptBuilder/buildInputCodePrompt.js");
const buildOutputCodePrompt = require("../LLMPromptBuilder/buildOutputCodePrompt.js");

function buildKnowledgeInjection(tags, complexity, selectedTypes, knowledge) {
  if (!tags || tags.length === 0) return { matched: false };

  // Try each tag against knowledge keys
  for (const tag of tags) {
    const normalized = tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase();
    const entry = knowledge[normalized];
    if (!entry) continue;

    return {
      matched: true,
      tag: normalized,
      suboptimal_algorithms: entry.suboptimal_algorithms,
      constraints: entry.constraint_budget?.[complexity] || null,
      patterns: {
        large: selectedTypes.includes("large")
          ? entry.large_adversarial
          : undefined,
        edge: selectedTypes.includes("edge") ? entry.edge_cases : undefined,
      },
    };
  }

  return { matched: false };
}

function extractJSON(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in response");
  return JSON.parse(text.slice(start, end + 1));
}

function extractPython(text) {
  // Strip markdown fences if present
  const fenceMatch = text.match(/```python\n([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const genericFence = text.match(/```\n([\s\S]*?)```/);
  if (genericFence) return genericFence[1].trim();
  return text.trim();
}

module.exports = {
  // prob generation using LLM

  genAIProblem: async (req, res) => {
    console.log("[ProblemAutomation]GenAI Problem Generation API Called");
    const { tags, difficulty, expectedComplexity, solution, questionStyle } =
      req.body;
    const { v4: uuidv4 } = require("uuid");
    const fs = require("fs");
    const path = require("path");

    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const sessionId = uuidv4();
    const tempDir = path.join(__dirname, "../uploads", sessionId);
    fs.mkdirSync(tempDir, { recursive: true });

    const initialData = { tags, difficulty, expectedComplexity, solution };
    fs.writeFileSync(
      path.join(tempDir, "input.json"),
      JSON.stringify(initialData, null, 2),
    );

    const prompt = `
You are an expert coding problem setter. Given the following details:
- Tags: ${tags.join(", ")}
- Difficulty: ${difficulty}
- Expected time/space complexity: ${expectedComplexity || "not specified"}
- Reference solution: ${solution || "none"}
- Question style: ${questionStyle || "General"}

Generate a ${difficulty}, ${questionStyle || "General"} Style problem (but do not use exact statements) with:
- A clear and concise problem statement
- Input format (the input should be suitable for multiple testcases per file, i.e., the first line contains T, the number of testcases, and for each testcase, the length/size and data are provided as described; see Codeforces/AtCoder style, also enusre the Constraints are tight and the product of T and length/size of each testcase is sufficient to test the expected time complexity of the solution provided, e.g., if expected complexity is O(n log n) then T can be 100 and length of each testcase can be up to 10^5, but if expected complexity is O(n^2) then T can be 10 and length of each testcase can be up to 10^3, these are just examples, you should decide appropriate values based on the problem and solution provided),
- Output format
- Constraints
- At least one sample input/output
- A correct reference solution in Python
- DONT USE ANY EXTERNAL LIBRARIES IN THE SOLUTION, ONLY STANDARD LIBRARIES that come with Python by default

IMPORTANT: Return ONLY a valid JSON object. Ensure all strings are properly escaped.
- Use \\n for newlines within strings (e.g., in the solution code)
- Do NOT include any text before or after the JSON
- Do NOT use literal line breaks inside JSON string values
- Ensure the "solution" field contains the full Python code as a single string with \\n for line breaks

Return the result as a JSON object with these fields:
{
  "problemStatement": "...",
  "inputFormat": "...",
  "outputFormat": "...",
  "constraints": "...",
  "sampleInput": "...",
  "sampleOutput": "...",
  "solution": "..."
}
`;

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const result = await model.generateContent(prompt);
      let responseText = await result.response.text();
      console.log("[ProblemAutomation]GenAI Response:", responseText);
      // Remove code block markers if present and trim
      responseText = responseText.replace(/```json|```/g, "").trim();

      // Additional JSON sanitization
      // Fix common JSON issues from AI responses
      try {
        // Try to extract JSON from the response if it's embedded in other text
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          responseText = jsonMatch[0];
        }

        // Remove any trailing commas before closing braces/brackets
        responseText = responseText.replace(/,(\s*[}\]])/g, "$1");
      } catch (cleanErr) {
        console.warn("[ProblemAutomation]Cleaning warning:", cleanErr);
      }

      console.log("[ProblemAutomation]Cleaned GenAI Response:", responseText);
      let genaiResponse;
      try {
        genaiResponse = JSON.parse(responseText);
        console.log("[ProblemAutomation]Parsed GenAI Response:", genaiResponse);
      } catch (jsonErr) {
        console.error("[ProblemAutomation]Initial JSON parse error:", jsonErr);

        // Attempt to repair JSON with literal newlines in string values
        // This is a common issue with AI-generated JSON containing code
        try {
          console.log("[ProblemAutomation]Attempting JSON repair...");

          // Strategy: Parse field by field and reconstruct valid JSON
          // Match each field more carefully
          const repaired = {};

          // Extract each field manually with regex
          const fieldPattern = /"(\w+)":\s*"([\s\S]*?)(?=",?\s*"|\s*}$)/g;
          let match;

          // Reset lastIndex
          fieldPattern.lastIndex = 0;

          // Try a different approach: split by top-level quotes more carefully
          const fields = [
            "problemStatement",
            "inputFormat",
            "outputFormat",
            "constraints",
            "sampleInput",
            "sampleOutput",
            "solution",
          ];

          for (const field of fields) {
            const fieldRegex = new RegExp(
              `"${field}"\\s*:\\s*"([\\s\\S]*?)"(?=\\s*,\\s*"|\\s*})`,
            );
            const fieldMatch = responseText.match(fieldRegex);
            if (fieldMatch) {
              // Escape any literal newlines, tabs, and backslashes
              let value = fieldMatch[1];
              // Don't double-escape already escaped characters
              value = value.replace(/\\/g, "\\\\");
              value = value.replace(/\n/g, "\\n");
              value = value.replace(/\r/g, "\\r");
              value = value.replace(/\t/g, "\\t");
              value = value.replace(/"/g, '\\"');
              // Unescape our own escaping of backslashes
              value = value.replace(/\\\\\\\\/g, "\\\\");
              value = value.replace(/\\\\"/g, '\\"');
              value = value.replace(/\\\\n/g, "\\n");
              value = value.replace(/\\\\r/g, "\\r");
              value = value.replace(/\\\\t/g, "\\t");

              repaired[field] = value;
            }
          }

          if (Object.keys(repaired).length === fields.length) {
            console.log("[ProblemAutomation]Successfully repaired JSON");
            genaiResponse = repaired;
          } else {
            throw new Error("JSON repair failed: Could not extract all fields");
          }
        } catch (repairErr) {
          console.error("[ProblemAutomation]JSON repair failed:", repairErr);
          console.error(
            "[ProblemAutomation]Failed at position:",
            jsonErr.message,
          );

          // Try to provide more helpful debugging info
          if (jsonErr.message.includes("position")) {
            const posMatch = jsonErr.message.match(/position (\d+)/);
            if (posMatch) {
              const pos = parseInt(posMatch[1]);
              const context = responseText.substring(
                Math.max(0, pos - 50),
                Math.min(responseText.length, pos + 50),
              );
              console.error("[ProblemAutomation]Error context:", context);
            }
          }

          res.status(500).json({
            ok: false,
            error: "JSON parse error: " + jsonErr.message,
            raw: responseText,
          });
          return;
        }
      }
      fs.writeFileSync(
        path.join(tempDir, "genai_response.json"),
        JSON.stringify(genaiResponse, null, 2),
      );
      res.json({ ok: true, sessionId, genaiResponse });
    } catch (err) {
      console.error("[ProblemAutomation]Error in genAIProblem:", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  },

  // generate Code for testcase generation
  genAITestcases: async (req, res) => {
    const { sessionId, numTestcases, testcaseTypes, expectedComplexity, tags } =
      req.body;
    const fs = require("fs");
    const path = require("path");
    const { GoogleGenerativeAI } = require("@google/generative-ai");

    // ── Load problem context ──────────────────────────────────────────
    const tempDir = path.join(__dirname, "../uploads", sessionId);
    const genaiPath = path.join(tempDir, "genai_response.json");
    if (!fs.existsSync(genaiPath))
      return res.status(400).json({ ok: false, error: "Session not found" });

    const problemData = JSON.parse(fs.readFileSync(genaiPath, "utf-8"));
    const {
      problemStatement,
      inputFormat,
      outputFormat,
      constraints,
      solution,
      sampleInput,
      sampleOutput,
    } = problemData;

    const complexity = expectedComplexity || "infer from solution";

    // ── Load knowledge base and build injection ───────────────────────
    const knowledgePath = path.join(
      __dirname,
      "../metadata/adversarial_patterns.json",
    );
    const knowledge = JSON.parse(fs.readFileSync(knowledgePath, "utf-8"));
    const injection = buildKnowledgeInjection(
      tags,
      complexity,
      testcaseTypes,
      knowledge,
    );

    // ── Build the file list the LLM must generate ─────────────────────
    const fileList = testcaseTypes.map((type, i) => ({
      index: String(i).padStart(2, "0"),
      type: type,
      filename: `input/input${String(i).padStart(2, "0")}.txt`,
    }));

    const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });

    // ── CALL 1: Reasoning (returns JSON analysis, no code) ───────────
    const reasoningPrompt = buildReasoningPrompt(
      {
        problemStatement,
        inputFormat,
        outputFormat,
        constraints,
        sampleInput,
        sampleOutput,
      },
      complexity,
      tags,
      fileList,
      injection,
    );
    const reasoningRaw = await model.generateContent(reasoningPrompt);
    const reasoningText = reasoningRaw.response.text();
    const reasoning = extractJSON(reasoningText);

    // ── CALL 2: inputGenCode (raw Python, no JSON wrapper) ───────────
    const inputCodePrompt = buildInputCodePrompt(
      { problemStatement, inputFormat, constraints, sampleInput },
      reasoning,
      fileList,
      injection,
    );
    const inputCodeRaw = await model.generateContent(inputCodePrompt);
    const inputGenCode = extractPython(inputCodeRaw.response.text());

    // ── CALL 3: outputGenCode (raw Python, no JSON wrapper) ──────────
    const outputCodePrompt = buildOutputCodePrompt(
      { inputFormat, outputFormat, solution },
      fileList,
    );
    const outputCodeRaw = await model.generateContent(outputCodePrompt);
    const outputGenCode = extractPython(outputCodeRaw.response.text());

    // ── Save both scripts ─────────────────────────────────────────────
    fs.writeFileSync(path.join(tempDir, "inputGenCode.py"), inputGenCode);
    fs.writeFileSync(path.join(tempDir, "outputGenCode.py"), outputGenCode);
    fs.writeFileSync(
      path.join(tempDir, "reasoning.json"),
      JSON.stringify(reasoning, null, 2),
    );

    return res.json({ ok: true, sessionId, reasoning });
  },

  //CE logic to run

  runPipeline: async (req, res) => {
    const fs = require("fs");
    const path = require("path");
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

    try {
      const response = await fetch("http://localhost:5000/CEPipeline", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(jobData),
      });
      const result = await response.json();
      res.json({ ok: true, result });
    } catch (err) {
      console.error("Error in runPipeline:", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  },
  downloadTestcases: async (req, res) => {
    const id = req.params.id;
    console.log("Sending Download req to CE engine");
    const getFile = await axios(`http://localhost:5000/download/${id}`, {
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
