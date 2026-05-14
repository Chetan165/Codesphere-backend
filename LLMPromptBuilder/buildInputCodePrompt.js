function buildInputCodePrompt(problem, reasoning, fileList, injection) {
  const functionList = fileList
    .map((f) => `generate_input${f.index}()  →  ${f.filename}  [${f.type}]`)
    .join("\n");
  const functionCalls = fileList
    .map((f) => `    generate_input${f.index}()`)
    .join("\n");

  const largeCase = reasoning.testcases?.find((t) => t.type === "large");
  const hasAdversarial = fileList.some(
    (f) => f.type === "adversarial" || f.type === "wa",
  );

  return `
You are writing a Python testcase generator for a competitive programming problem.

INPUT FORMAT TO FOLLOW:
${problem.inputFormat}

CONSTRAINTS:
${problem.constraints}

${
  hasAdversarial
    ? `
OPTIMAL SOLUTION REFERENCE:
"""
${problem.solution}
"""
`
    : ""
}
GENERATION PLAN (follow this exactly):
${JSON.stringify(reasoning, null, 2)}

RULES:
1. Write exactly these functions:
${functionList}

2. Each function writes to its file. Use:
   os.makedirs("input", exist_ok=True)

3. For the sample case: write the exact string below as a raw multiline string.
   Do not generate it. Do not modify it.
   """
${problem.sampleInput}
   """

4. For edge cases: implement each case from the plan exactly.
   Use the exact n values and constructions described.
   Do not substitute random data.

5. For the large adversarial case (TLE targeting):
   ${
     largeCase
       ? `
   - Anti-Early-Exit Pattern: ${largeCase.worst_case_payload_design?.anti_early_exit_pattern || "See plan"}
   - Distribution: ${largeCase.worst_case_payload_design?.worst_case_distribution || "See plan"}
   - Helper function name: ${largeCase.helper_function_name}
   - You MUST write a function named ${largeCase.helper_function_name}(n)
   - N values to use: ${JSON.stringify(largeCase.n_values)}
   - Sum must be exactly ${largeCase.sum_n}
   - HARD RULE: ${largeCase.helper_function_name}(n) must NOT call random
     as its primary data source. It must implement: ${largeCase.construction_algorithm}
   `
       : "See plan above"
   }

6. For generic case: use random within constraint ranges.

7. Use stdlib only: random, os, math, string. No pip packages.

8. Add a comment above each function stating:
   # TYPE: [type]
   # TARGETS: [what suboptimal algorithm this stresses]
   # SUM_N: [sum of all n values written]

${
  hasAdversarial
    ? `
9. ADVERSARIAL DIFFERENTIAL FUZZING (REQUIRED FOR 'adversarial' OR 'wa' FILES):
   You are generating a Logic-Breaking "WA" testcase. Use a Differential Fuzzer.
   A. Rewrite the Optimal Reference provided above into a callable function: optimal_ans(input_vars).
   B. Write up to 3 common "Smart but Flawed" approaches (e.g., Greedy, Naive Recursion, Bad Prefix assumption) as functions: buggy_1(input_vars), buggy_2(...), etc.
   C. Inside the generator function, use a loop to generate valid random inputs.
   D. Evaluate optimal_ans() against your buggy functions.
   E. If optimal_ans() != buggy_ans() for ANY of the buggy functions, write that input to the file and return.
   F. CRITICAL TIMEOUT: You MUST use \`time.time()\`! Limit the search loop to 3.0 seconds. If no mismatch is found in 3 seconds, break the loop and write a fallback random input to avoid deadlocking the server.
   G. Ensure you format the selected input into the correct multi-line string before writing to the file!
   H. Import \`time\` at the top of the file.
`
    : ""
}

10. MANDATORY EXECUTION BLOCK (required):
   After all function definitions, append exactly this entrypoint pattern and call
   every generate_inputXX() function exactly once:

   if __name__ == "__main__":
${functionCalls}

   Do not omit this block. Do not leave functions uncalled.

Return ONLY the Python code. No JSON. No explanation. No markdown fences.
Start with: import random`;
}

module.exports = buildInputCodePrompt;
