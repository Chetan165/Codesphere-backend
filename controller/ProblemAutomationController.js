const dotenv = require("dotenv");
dotenv.config();
const path = require("path");
const { spawn } = require("child_process");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const fs = require("fs");
const { diff } = require("util");
const { v4: uuidv4 } = require("uuid");
const apiKey = process.env.GEMINI_API_KEY;
const buildReasoningPrompt = require("../LLMPromptBuilder/buildReasoningPrompt.js");
const buildInputCodePrompt = require("../LLMPromptBuilder/buildInputCodePrompt.js");
const buildOutputCodePrompt = require("../LLMPromptBuilder/buildOutputCodePrompt.js");
const buildSolutionGuidance = require("../metadata/buildSolutionGuidance.js");

// function buildKnowledgeInjection(tags, complexity, selectedTypes, knowledge) {
//   if (!tags || tags.length === 0) return { matched: false };

//   // Try each tag against knowledge keys
//   for (const tag of tags) {
//     const normalized = tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase();
//     const entry = knowledge[normalized];
//     if (!entry) continue;

//     return {
//       matched: true,
//       tag: normalized,
//       suboptimal_algorithms: entry.suboptimal_algorithms,
//       constraints: entry.constraint_budget?.[complexity] || null,
//       patterns: {
//         large: selectedTypes.includes("large")
//           ? entry.large_adversarial
//           : undefined,
//         edge: selectedTypes.includes("edge") ? entry.edge_cases : undefined,
//       },
//     };
//   }

//   return { matched: false };
// }

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

module.exports = {
  // prob generation using LLM

  genAIProblem: async (req, res) => {
    const { tags, difficulty, questionStyle } = req.body;
    const expectedComplexity = req.body.expectedComplexity || null;

    // create session folder for this generation request
    const sessionId = uuidv4();
    const tempDir = path.join(__dirname, "../uploads", sessionId);
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "input.json"),
      JSON.stringify({ tags, difficulty, expectedComplexity }, null, 2),
    );

    const knowledge = require("../metadata/adversarial_patterns.json");

    // Find best matching tag and pull everything about it
    const primaryTag =
      tagPriority.find((t) => tags.includes(t) && knowledge[t]) ??
      tags.find((t) => knowledge[t]);
    const tagKnowledge = primaryTag ? knowledge[primaryTag] : null;

    const problemPrompt = `
You are an expert competitive programming problem setter.

Generate a ${difficulty} problem in ${questionStyle || "General"} style.
Tags: ${tags.join(", ")}

${
  expectedComplexity
    ? `COMPLEXITY: The solution must be ${expectedComplexity}.`
    : `COMPLEXITY: Choose the most appropriate complexity for this specific problem.
       It does not have to follow a fixed rule — a 1D DP can be O(n), a 2D DP O(n²), etc.
       Base it on what the problem actually requires.`
}

${
  tagKnowledge
    ? `
REFERENCE KNOWLEDGE FOR THIS PROBLEM TYPE (${primaryTag}):
CRITICAL:dont use this as it is, decide the appropriate subcategory of the problem from this, use suboptimal algorithms and pitfalls as they are along with recommendations for T,n sum_n etc for each testcase type.

Common suboptimal approaches students will submit:
${tagKnowledge.suboptimal_algorithms?.map((a) => `- ${a.name}: ${a.complexity} — ${a.how_common}`).join("\n")}

Constraint budget:
${JSON.stringify(tagKnowledge.constraint_budget, null, 2)}

Known pitfall for this topic: ${tagKnowledge.pitfall || "See suboptimal algorithms above"}
`
    : ""
}

CONSTRAINT REQUIREMENTS:
- Use Codeforces style: T on first line, then per-testcase data
- Calibrate T and N so that:
  ${
    difficulty === "Easy"
      ? "- Constraints are relaxed. A simple brute force O(n²) may pass if the problem is straightforward. Use smaller N."
      : difficulty === "Hard"
        ? "- Constraints are tight. Only the optimal solution passes. Brute force must TLE by a large margin."
        : "- Moderate. The optimal solution passes comfortably. A naive O(n²) should TLE for large inputs."
  }
- The sum of all N across all T testcases in one file must be bounded
  (reference the constraint budget above and adapt to your problem)
- Always state explicit constraints: ranges for T, N, and value limits

Return JSON with exactly:
{
  "problemStatement": "...",
  "inputFormat": "...",
  "outputFormat": "...",
  "constraints": "...",
  "sampleInput": "...",
  "sampleOutput": "...",
  "inferredComplexity": "exact Big-O of your intended optimal solution e.g. O(n), O(n log n), O(n²)"
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
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const jsonModel = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: { responseMimeType: "application/json" },
      });
      const textModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const problemResult = await jsonModel.generateContent(problemPrompt);
      const problemData = JSON.parse(problemResult.response.text());

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
        // Always saved — either user provided or LLM inferred
        // Step 2 reads this to know which adversarial patterns to use
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

  // generate Code for testcase generation
  genAITestcases: async (req, res) => {
    const { sessionId, testcaseTypes } = req.body;

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
      tags, // saved in Step 1
      expectedComplexity, // inferredComplexity saved as this in Step 1
    } = problemData;

    const knowledge = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../metadata/adversarial_patterns.json"),
        "utf-8",
      ),
    );

    const primaryTag =
      tagPriority.find((t) => tags.includes(t) && knowledge[t]) ??
      tags.find((t) => knowledge[t]);
    const entry = primaryTag ? knowledge[primaryTag] : null;

    // Exact budget if complexity matches, otherwise first available as reference
    const constraintBudget = entry?.constraint_budget
      ? (entry.constraint_budget[expectedComplexity] ??
        Object.values(entry.constraint_budget)[0])
      : null;

    const injection = {
      matched: !!entry,
      tag: primaryTag,
      suboptimal_algorithms: entry?.suboptimal_algorithms,
      constraints: constraintBudget, // reference — LLM adapts
      patterns: {
        large: testcaseTypes.includes("large")
          ? entry?.large_adversarial
          : undefined,
        edge: testcaseTypes.includes("edge") ? entry?.edge_cases : undefined,
      },
    };

    const fileList = testcaseTypes.map((type, i) => ({
      index: String(i).padStart(2, "0"),
      type: type,
      filename: `input/input${String(i).padStart(2, "0")}.txt`,
    }));

    const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });

    const reasoningRaw = await model.generateContent(
      buildReasoningPrompt(
        {
          problemStatement,
          inputFormat,
          outputFormat,
          constraints,
          sampleInput,
          sampleOutput,
        },
        expectedComplexity,
        tags,
        fileList,
        injection,
      ),
    );
    const reasoning = extractJSON(reasoningRaw.response.text());

    const inputCodeRaw = await model.generateContent(
      buildInputCodePrompt(
        { problemStatement, inputFormat, constraints, sampleInput },
        reasoning,
        fileList,
        injection,
      ),
    );
    const inputGenCode = extractPython(inputCodeRaw.response.text());

    const outputCodeRaw = await model.generateContent(
      buildOutputCodePrompt({ inputFormat, outputFormat, solution }, fileList),
    );
    const outputGenCode = extractPython(outputCodeRaw.response.text());

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
