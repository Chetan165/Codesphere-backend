function buildOutputCodePrompt(problem, fileList) {
  const indices = fileList.map((f) => f.index);

  return `
Write a Python script that runs a solution on testcase input files and saves outputs.

INPUT FORMAT:
${problem.inputFormat}

OUTPUT FORMAT:
${problem.outputFormat}

SOLUTION CODE:
"""
${problem.solution}
"""

The script must:
1. For each index in ${JSON.stringify(indices)}:
   - Read input/input{index}.txt
   - Parse T from first line
   - For each of T testcases: parse input, call solve(), collect output
   - Write all outputs to output/output{index}.txt

2. Use try/except per file. If a file fails, write the error to
   output/output{index}_error.txt and continue to the next file.

3. Create output directory: os.makedirs("output", exist_ok=True)

4. The solve() function is embedded from the solution code above.
   Do not import it. Paste it directly into the script.

Return ONLY the Python code. No explanation. No markdown fences.`;
}

module.exports = buildOutputCodePrompt;
