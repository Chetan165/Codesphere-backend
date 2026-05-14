function buildReasoningPrompt(
  problem,
  complexity,
  tags,
  fileList,
  injection,
  difficulty,
) {
  return `
You are an expert competitive programming problem setter.
Analyze this problem and produce a high-quality testcase design plan.
Return ONLY valid JSON. No code. No explanations outside JSON.

PROBLEM:
${problem.problemStatement}

Input Format: ${problem.inputFormat}
Output Format: ${problem.outputFormat}
Constraints: ${problem.constraints}
Difficulty: ${difficulty || "Medium"}
Expected Optimal Complexity: ${complexity}
Tags: ${tags?.join(", ") || "unknown"}

${
  injection.matched
    ? `
KNOWN TRAPS FOR THIS PROBLEM TYPE (These may or may not be of use, use your own reasoning and intelligence to decide traps and pitfalls) (${injection.tag}):
${JSON.stringify(injection, null, 2)}
`
    : `No pattern library entry found. Reason from first principles.`
}

REQUIRED FILES: ${fileList.map((f) => `${f.filename} (${f.type})`).join(", ")}

HARD FORMATTING RULES:
1. Follow HackerRank/Codeforces style limits: Input must always start with T (number of testcases), followed by exactly T testcases matching the expected input format.
2. Do not set T higher than 100 to avoid excess IO.
3. The sum of N (or sum of string lengths/grid areas) across all T testcases MUST NOT exceed the constraints allowed for the optimal \( ${complexity} \) algorithm. 
4. DIFFICULTY SCALING: 
   - If Problem Difficulty is "Easy": You may relax constraints. Sum of N can be relatively small so $O(N^2)$ approaches might barely pass.
   - If Problem Difficulty is "Medium" or "Hard": Sum of N must mathematically guarantee that any suboptimal algorithm will Time Limit Exceed (TLE).
5. For "large" testcases, do NOT just use random data. Generate explicit worst-case payload structures (e.g., repeating strings, anti-sorted arrays) to prevent early-exit loops.

Return this JSON exactly:
{
  "problem_analysis": {
    "broad_tag": "string",
    "micro_variant": "string (e.g. DP on Grid, Monotonic Stack on Trees)",
    "exact_optimal_complexity": "string",
    "max_allowed_sum_of_n_over_T": "number (calculated mathematically. Recall standard limits: ~10^8 operations (C++/Java for 2-3s) or ~10^7 operations (Python for 10s))",
    "identified_common_pitfalls": ["array of 2-3 specific mistakes students will make"]
  },
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
      "worst_case_payload_design": {
         "anti_early_exit_pattern": "string (what exact data prevents early return loops?)",
         "worst_case_distribution": "string (anti-sorted? star graph?)"
      },
      "helper_function_name": "string — e.g. generate_killer_sequence",
      "construction_algorithm": "step by step precise mathematical construction",
      "T": number,
      "n_values": [array of N per testcase],
      "sum_n": "number (Must equal max_allowed_sum_of_n_over_T)",
      "why_optimal_unaffected": "string",
      "why_suboptimal_TLEs": "string (Why it TLEs)"`
          : ""
      }
      ${
        f.type === "adversarial" || f.type === "wa"
          ? `
      "logic_trap_description": "short description of the logical fallacy being targeted (e.g. greedy trap, prefix assumption)",
      "buggy_heuristics_to_simulate": ["array of 2-3 specific bad approaches students will try"],
      "fallback_construction_algorithm": "how to build a deterministic trap if fuzzer times out",
      "T": number,
      "n_values": [array of N per testcase - moderate size, not max bounds],
      "why_suboptimal_WA": "string (Why it gets Wrong Answer)"`
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
