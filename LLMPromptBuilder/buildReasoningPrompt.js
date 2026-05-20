function buildReasoningPrompt(
  problem,
  complexity,
  tags,
  fileList,
  injection,
  difficulty,
) {
  return `
You are an expert competitive programming problem setter and test data engineer.
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
    ? `KNOWN TRAPS FOR THIS PROBLEM TYPE (${injection.tag}):
${JSON.stringify(injection, null, 2)}`
    : `No pattern library entry found. Reason from first principles.`
}

REQUIRED FILES: ${fileList.map((f) => `${f.filename} (${f.type})`).join(", ")}

═══════════════════════════════════════════════
HARD FORMATTING RULES
═══════════════════════════════════════════════
1. HackerRank/Codeforces style: input always starts with T, followed by exactly T testcases.
2. Do not set T higher than 100.
3. Sum of N across all T testcases MUST NOT exceed what the optimal ${complexity} algorithm allows.
4. DIFFICULTY SCALING:
   - Easy:        (OPTIONAL)Relax constraints. O(N²) may barely pass. Smaller N is fine.
   - Medium/Hard: Sum of N must mathematically guarantee any suboptimal algorithm TLEs.
5. For "large" testcases: use explicit worst-case payload structures (anti-sorted arrays, repeating strings, star graphs). NOT random data.
6. For "adversarial" testcases: you MUST provide a minimal_failing_example with exact verified input/output values. This is not optional.

═══════════════════════════════════════════════
ADVERSARIAL FILE — WHAT IT MUST CATCH
═══════════════════════════════════════════════

The adversarial file has ONE job: expose students who submitted the WRONG ALGORITHM.

A wrong algorithm is one that is conceptually incorrect for this problem but appears reasonable to a student who partially understood it. It must:
  - Pass all sample testcases
  - Pass most small random inputs (>80% of random tests at small N)
  - Fail only on inputs with a specific structure that exposes the flaw

What counts as a wrong algorithm (reason from the problem structure):
  - A greedy approach when global optimization requires DP
  - An approach that handles the common case correctly but collapses on a specific structural pattern (e.g. all same parity, large K relative to values, ties)

For buggy_implementations, reason about this specific problem:
  - What simpler version of the problem would their wrong algorithm solve correctly?
  - On what structural input does the simplified approach diverge from optimal?
  - Would their wrong algorithm pass the sample cases? (it must — otherwise it is not plausible)

The minimal_failing_example is the most important field. You must:
  - Manually trace the optimal algorithm step by step on this input
  - Manually trace each buggy algorithm step by step on this input
  - Only include it if you are certain both outputs are correct
  - Keep N <= 10 so the manual trace is feasible

═══════════════════════════════════════════════
RETURN THIS JSON EXACTLY
═══════════════════════════════════════════════
{
  "problem_analysis": {
    "broad_tag": "string",
    "micro_variant": "string (e.g. DP on Grid, Monotonic Stack on Trees)",
    "exact_optimal_complexity": "string",
    "max_allowed_sum_of_n_over_T": number,
    "identified_common_pitfalls": ["2-3 specific wrong-algorithm mistakes students will make"]
  },
  "testcases": [
    ${fileList
      .map(
        (f) => `{
      "file": "${f.filename}",
      "type": "${f.type}",
      "purpose": "${
        f.type === "edge"
          ? "Combined edge cases: basic boundaries (min/max N, empty), complex variants (alternating, disconnected), padded with a few MID-SIZED random cases to obscure the traps."
          : "string"
      }",
      ${f.type === "sample" ? `"instruction": "use exact sample provided"` : ""}
      ${
        f.type === "edge"
          ? `"cases": [
        {
          "name": "string",
          "n": number,
          "construction": "exact description with specific values",
          "bug_caught": "specific failure mode in student code"
        }
      ]`
          : ""
      }
      ${
        f.type === "large"
          ? `"worst_case_payload_design": {
        "anti_early_exit_pattern": "what exact structure prevents early-exit loops",
        "worst_case_distribution": "describe precisely: anti-sorted, star graph, all equal, etc."
      },
      "helper_function_name": "string",
      "construction_algorithm": "step by step precise mathematical construction",
      "T": number,
      "n_values": [array of N per testcase],
      "sum_n": number,
      "why_optimal_unaffected": "string",
      "why_suboptimal_TLEs": "string"`
          : ""
      }
      ${
        f.type === "adversarial"
          ? `"logic_trap_description": "precise name of the wrong algorithm being targeted",

      "buggy_implementations": [
        {
          "name": "short descriptive name",
          "approach_summary": "one sentence — what the student thinks their algorithm does",
          "pseudocode": "4-8 lines using the actual variable names and conditions from THIS problem. Specific enough to implement exactly. Must produce correct output on the sample testcase.",
          "why_it_seems_correct": "one sentence",
          "why_it_fails": "the exact structural condition — name the specific pattern or value relationship that breaks it",
          "expected_pass_rate_on_random": "estimate e.g. 85% — must be above 70% or this is not a plausible student mistake"
        }
      ],

      "minimal_failing_example": {
        "description": "one sentence — what structure makes this a trap",
        "raw_input": "EXACT multi-line string, T on first line then testcase lines. N <= 10. Manually verified.",
        "optimal_output": "exact correct output, manually traced",
        "buggy_outputs": [
          {
            "buggy_name": "must match a name in buggy_implementations",
            "wrong_output": "exact wrong output, manually traced through the buggy pseudocode",
            "trace": "2-3 line trace showing how the buggy algorithm arrives at the wrong answer"
          }
        ]
      },

      "trap_scaling_pattern": "exact repeating structural unit that preserves the trap at larger N",
      "fallback_construction_algorithm": "deterministic step-by-step to build a trap input of arbitrary N without a fuzzer",
      "adversarial_n_budget": number,
      "why_suboptimal_WA": "string"`
          : ""
      }
      ${
        f.type === "generic"
          ? `"T": number,
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
