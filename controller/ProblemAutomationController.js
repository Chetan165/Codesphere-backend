const dotenv = require("dotenv");
dotenv.config();
const path = require("path");
const { spawn } = require("child_process");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const { diff } = require("util");
const apiKey = process.env.GEMINI_API_KEY;

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
- Input format (the input should be suitable for multiple testcases per file, i.e., the first line contains T, the number of testcases, and for each testcase, the length/size and data are provided as described; see Codeforces/AtCoder style)
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
    const { sessionId, numTestcases, testcaseTypes, expectedComplexity } =
      req.body;
    const fs = require("fs");
    const path = require("path");
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const apiKey = process.env.GEMINI_API_KEY;

    const tempDir = path.join(__dirname, "../uploads", sessionId);
    const genaiPath = path.join(tempDir, "genai_response.json");
    if (!fs.existsSync(genaiPath)) {
      return res
        .status(400)
        .json({ ok: false, error: "Session or problem context not found" });
    }
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

    // Build prompt for Gemini
    const prompt = `
Given the following competitive programming problem:

Problem Statement:
${problemStatement}

Input Format:
${inputFormat}

Output Format:
${outputFormat}

Constraints:
${constraints}

You are to generate code for test case generation and output generation as follows:

here is the definition/expectation of different testcase types that can be generated, DO NOT MAKE ALL ONLY WRITE LOGIC FOR THOSE WHICH ARE ASKED AFTER THIS DEFINITION:

For "sample", generate a simple, clear, and illustrative test case suitable for display to users as an example, use the sample testcase as given in ${sampleInput} & ${sampleOutput}.
For "edge", generate a test case that targets the boundaries or special conditions of the problem (e.g., minimum/maximum values, empty or single-element cases, or other tricky scenarios), but do not make it unnecessarily large—focus on what would best test edge behavior.
For "large", generate a test case that is as big and complex as allowed by the constraints, designed to test performance and efficiency, but always within the problem's limits. For "generic", generate a typical, average-case test case that is neither trivial nor extreme, representing normal expected input.
For "generic", generate a test case with random values within the allowed constraints, ensuring it is valid and diverse.
Each function should be tailored to its specific type, not just randomly generated. The logic and data should be chosen to best represent the intent of each testcase type in the context of the problem and its constraints.

1. inputGenCode: A single Python script that defines ${numTestcases} functions to generate each of the types as specified by [${testcaseTypes.join(", ")}], 
For each testcase type specified in ${testcaseTypes.join(", ")}, write a separate function named generate_inputXX (e.g., generate_input00 for "sample", generate_input01 for "edge", etc.). For each function, carefully consider what makes a high-quality test case of that type for the given problem and constraints:


each named generate_inputXX (e.g., generate_input00, generate_input01, ...),. Each function must:
- Generate a valid test case strictly within the problem's constraints (never exceeding them).
- Save the test case to a file named input/inputXX.txt (e.g., input00.txt, input01.txt, ...).
- The input format for every generated file must follow the problem's input format, add parameters as per the requirements of the question inputformat (This should match the input format described in the problem statement.)
- The values of T and the length/size of each testcase should never exceed the maximum input length expected for the given expected time complexity e.g (for O(n) i can have T=100 and if array is there for every t of T then max len of arr=10^5-6 (JUST FOR EXAMPLE, THINK AND DECIDE THESE BASED ON PROBLEM))(${expectedComplexity || "of the solution"}).
- Ensure the testcases include well thought-out edge cases, such as minimum/maximum values, sorted/unsorted data, all equal elements, and any other relevant edge scenarios for the problem.
- ensure that if asked for , the first i.e input00.txt and output00.tx is a sample testcase which is provided : ${sampleInput} and ${sampleOutput}

2. outputGenCode: A Python script that, given the provided solution code and the generated input files, reads each input/inputXX.txt, runs the solution, and writes the output to output/outputXX.txt. The script must:
- Use the provided solution code (below) as a function or module.
- Ensure outputs are correct and correspond to the generated inputs.

Provided solution code:
"""
${solution}
"""

IMPORTANT: Return ONLY a valid JSON object. Do NOT include any explanatory text before or after the JSON.
- Ensure all strings are properly escaped with \\n for newlines
- Do NOT use literal line breaks inside JSON string values
- The response must start with { and end with }

Return your response as a JSON object with these fields:
{
  "inputGenCode": "...python code...",
  "outputGenCode": "...python code..."
}
`;

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      console.log("Gemini TestcaseGen Prompt:", prompt);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const result = await model.generateContent(prompt);
      let responseText = result.response.text();
      console.log("Gemini TestcaseGen Response:", responseText);
      responseText = responseText.replace(/```json|```/g, "").trim();

      // Additional JSON sanitization for testcase generation
      try {
        // Extract JSON object from response (may have explanatory text before/after)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          responseText = jsonMatch[0];
        }

        // Remove any trailing commas before closing braces/brackets
        responseText = responseText.replace(/,(\s*[}\]])/g, "$1");
      } catch (cleanErr) {
        console.warn("[TestcaseGen]Cleaning warning:", cleanErr);
      }

      console.log("Cleaned TestcaseGen Response:", responseText);
      let codeResponse;
      try {
        codeResponse = JSON.parse(responseText);
      } catch (jsonErr) {
        console.error("JSON parse error (testcaseGen):", jsonErr);
        console.error("[TestcaseGen]Failed at position:", jsonErr.message);

        // Try to provide more helpful debugging info
        if (jsonErr.message.includes("position")) {
          const posMatch = jsonErr.message.match(/position (\d+)/);
          if (posMatch) {
            const pos = parseInt(posMatch[1]);
            const context = responseText.substring(
              Math.max(0, pos - 50),
              Math.min(responseText.length, pos + 50),
            );
            console.error("[TestcaseGen]Error context:", context);
          }
        }

        res.status(500).json({
          ok: false,
          error: "JSON parse error: " + jsonErr.message,
          raw: responseText,
        });
        return;
      }
      fs.writeFileSync(
        path.join(tempDir, "inputGenCode.py"),
        codeResponse.inputGenCode,
      );
      fs.writeFileSync(
        path.join(tempDir, "outputGenCode.py"),
        codeResponse.outputGenCode,
      );
      res.json({
        ok: true,
        inputGenCode: codeResponse.inputGenCode,
        outputGenCode: codeResponse.outputGenCode,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  },

  //CE logic to run

  runPipeline: async (req, res) => {
    const data = req.body;
    try {
      const response = await fetch("http://localhost:5000/CEPipeline", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
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
