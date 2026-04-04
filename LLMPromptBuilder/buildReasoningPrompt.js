function buildReasoningPrompt(problem, complexity, tags, fileList, injection) {
  return `
You are an expert competitive programming problem setter.
Analyze this problem and produce a testcase design plan.
Return ONLY valid JSON. No code. No explanations outside JSON.

PROBLEM:
${problem.problemStatement}

Input Format: ${problem.inputFormat}
Output Format: ${problem.outputFormat}
Constraints: ${problem.constraints}
Expected Complexity: ${complexity}
Tags: ${tags?.join(", ") || "unknown"}

${
  injection.matched
    ? `
KNOWN PATTERNS FOR THIS PROBLEM TYPE (${injection.tag}):
${JSON.stringify(injection, null, 2)}
`
    : `No pattern library entry found. Reason from first principles.`
}

REQUIRED FILES: ${fileList.map((f) => `${f.filename} (${f.type})`).join(", ")}

Return this JSON exactly:
{
  "algorithm_family": "string",
  "core_operation": "string",
  "why_random_is_insufficient_for_large": "string",
  "suboptimal_algorithm_being_targeted": "string",
  
  "testcases": [
    ${fileList
      .map(
        (f) => `{
      "file": "${f.filename}",
      "type": "${f.type}",
      "purpose": "string",
      ${
        f.type === "sample"
          ? `
      "instruction": "use exact sample provided"`
          : ""
      }
      ${
        f.type === "edge"
          ? `
      "cases": [
        {
          "name": "string",
          "n": number,
          "construction": "exact description — not 'small input', give specific values",
          "bug_caught": "specific failure in student code"
        }
      ]`
          : ""
      }
      ${
        f.type === "large"
          ? `
      "adversarial_pattern": "string",
      "helper_function_name": "string — e.g. create_killer_sequence",
      "construction_algorithm": "step by step, precise enough to implement",
      "T": number,
      "n_values": [array of N per testcase — must vary, must not repeat],
      "sum_n": number,
      "sum_n_limit": ${injection.constraints?.sum_n_limit || "calculate based on complexity"},
      "why_optimal_unaffected": "string",
      "why_suboptimal_TLEs": "string"`
          : ""
      }
      ${
        f.type === "generic"
          ? `
      "T": number,
      "n_range": [min, max],
      "value_range": [min, max]`
          : ""
      }
    }`,
      )
      .join(",\n    ")}
  ]
}`;
}

module.exports = buildReasoningPrompt;
