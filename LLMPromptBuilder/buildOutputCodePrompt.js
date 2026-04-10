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

RULES FOR STDIN/STDOUT:
- NEVER use contextlib.redirect_stdin (does not exist)
- ALWAYS use: sys.stdin = io.StringIO(file_content)
- ALWAYS use: sys.stdout = io.StringIO()
- ALWAYS restore with sys.__stdin__ and sys.__stdout__ (double underscore)
  not the variable you saved earlier - use the dunder versions
- Discover input files with glob.glob("input/input*.txt")
  never hardcode ["00", "01", "02"]

CRITICAL: Do NOT use contextlib.redirect_stdin — it does not exist in Python.
Do NOT use contextlib for stdin redirection at all.

The ONLY correct way to redirect stdin in this environment:
    sys.stdin = open(input_filename, 'r')
or
    sys.stdin = io.StringIO(file_content)

The ONLY correct way to redirect stdout:
    sys.stdout = io.StringIO()
    # run solve()
    output = sys.stdout.getvalue()

Always restore after:
    sys.stdin  = sys.__stdin__
    sys.stdout = sys.__stdout__

Return ONLY the Python code. No explanation. No markdown fences.`;
}

module.exports = buildOutputCodePrompt;
