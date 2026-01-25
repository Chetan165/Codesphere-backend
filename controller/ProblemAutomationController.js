const dotenv = require("dotenv");
dotenv.config();
const path = require("path");
const { spawn } = require("child_process");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const apiKey = process.env.GEMINI_API_KEY;

module.exports = {
  // prob generation using LLM

  genAIProblem: async (req, res) => {
    console.log("[ProblemAutomation]GenAI Problem Generation API Called");
    const { tags, difficulty, expectedComplexity, solution } = req.body;
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

Generate a CP/DSA problem (Inspired by LeetCode, but do not use exact statements) with:
- A clear and concise problem statement
- Input format (the input should be suitable for multiple testcases per file, i.e., the first line contains T, the number of testcases, and for each testcase, the length/size and data are provided as described; see Codeforces/AtCoder style)
- Output format
- Constraints
- At least one sample input/output
- A correct reference solution in Python

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
      console.log("[ProblemAutomation]Sending prompt to GenAI:", prompt);
      const result = await model.generateContent(prompt);
      let responseText = await result.response.text();
      console.log("[ProblemAutomation]GenAI Response:", responseText);
      // Remove code block markers if present and trim
      responseText = responseText.replace(/```json|```/g, "").trim();
      console.log("[ProblemAutomation]Cleaned GenAI Response:", responseText);
      let genaiResponse;
      try {
        genaiResponse = JSON.parse(responseText);
        console.log("[ProblemAutomation]Parsed GenAI Response:", genaiResponse);
      } catch (jsonErr) {
        console.error("[ProblemAutomation]JSON parse error:", jsonErr);
        res
          .status(500)
          .json({ ok: false, error: "JSON parse error", raw: responseText });
        return;
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

1. inputGenCode: A single Python script that defines ${numTestcases} functions, each named generate_inputXX (e.g., generate_input00, generate_input01, ...), where each function generates a specific type of test case as described below. The types are: ${testcaseTypes.join(", ")}. Each function must:
- Generate a valid test case strictly within the problem's constraints (never exceeding them).
- For large/edge cases, maximize size/complexity but never cause TLE or violate constraints.
- Save the test case to a file named input/inputXX.txt (e.g., input00.txt, input01.txt, ...).
- The input format for every generated file must follow the problem's input format, which is: the first line contains T (number of testcases), and for each testcase, the length/size (e.g., n or string length) is on a new line, followed by the array/string or data, and any other parameters on their own lines as needed. (This should match the input format described in the problem statement.)
- The values of T and the length/size of each testcase should never exceed the maximum input length expected for the given expected time complexity (${expectedComplexity || "of the solution"}).
- Ensure the testcases include well thought-out edge cases, such as minimum/maximum values, sorted/unsorted data, all equal elements, and any other relevant edge scenarios for the problem.
- ensure that the first i.e input00.txt and output00.tx is a sample testcase which is provided : ${sampleInput} and ${sampleOutput}

2. outputGenCode: A Python script that, given the provided solution code and the generated input files, reads each input/inputXX.txt, runs the solution, and writes the output to output/outputXX.txt. The script must:
- Use the provided solution code (below) as a function or module.
- Ensure outputs are correct and correspond to the generated inputs.

Provided solution code:
"""
${solution}
"""

Return your response as a JSON object with these fields:
{
  "inputGenCode": "...python code...",
  "outputGenCode": "...python code..."
}
`;

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const result = await model.generateContent(prompt);
      let responseText = result.response.text();
      console.log("Gemini TestcaseGen Response:", responseText);
      responseText = responseText.replace(/```json|```/g, "").trim();
      let codeResponse;
      try {
        codeResponse = JSON.parse(responseText);
      } catch (jsonErr) {
        console.error("JSON parse error (testcaseGen):", jsonErr);
        res
          .status(500)
          .json({ ok: false, error: "JSON parse error", raw: responseText });
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

  //RCE logic to run

  runPipeline: async (req, res) => {
    //Call the RCEengine with inputGenCode,outputGenCode and Metadata
  },
};
