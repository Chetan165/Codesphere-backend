function buildInputCodePrompt(problem, reasoning, fileList, injection) {
  const functionList = fileList
    .map((f) => `generate_input${f.index}()  →  ${f.filename}  [${f.type}]`)
    .join("\n");

  const largeCase = reasoning.testcases?.find((t) => t.type === "large");

  return `
You are writing a Python testcase generator for a competitive programming problem.

INPUT FORMAT TO FOLLOW:
${problem.inputFormat}

CONSTRAINTS:
${problem.constraints}

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

5. For the large adversarial case:
   ${
     largeCase
       ? `
   - Pattern: ${largeCase.adversarial_pattern}
   - Helper function name: ${largeCase.helper_function_name}
   - You MUST write a function named ${largeCase.helper_function_name}(n)
   - N values to use: ${JSON.stringify(largeCase.n_values)}
   - Sum must be ≤ ${largeCase.sum_n_limit}
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

Return ONLY the Python code. No JSON. No explanation. No markdown fences.
Start with: import random`;
}

module.exports = buildInputCodePrompt;
