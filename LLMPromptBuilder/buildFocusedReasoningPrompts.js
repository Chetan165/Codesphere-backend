// ─────────────────────────────────────────────────────────────────────────────
// buildEdgeReasoningPrompt
// ─────────────────────────────────────────────────────────────────────────────
function buildEdgeReasoningPrompt(
  problem,
  complexity,
  approaches,
  files,
  difficulty,
) {
  return `
You are designing edge case testcases for a competitive programming problem.
Return ONLY valid JSON.

PROBLEM: ${problem.problemStatement}
INPUT FORMAT: ${problem.inputFormat}
CONSTRAINTS: ${problem.constraints}
DIFFICULTY: ${difficulty}
OPTIMAL COMPLEXITY: ${complexity}

WRONG APPROACHES AND THEIR KILLING EXAMPLES (from analysis):
${JSON.stringify(approaches.wrong_approaches, null, 2)}

EDGE CASE INVENTORY (from analysis):
${JSON.stringify(approaches.edge_case_inventory, null, 2)}

REQUIRED FILES: ${files.map((f) => `${f.filename}`).join(", ")}

YOUR TASK:
Design edge cases that collectively cover ALL of the following:

TIER 1 — Boundary values (must cover every one that applies):
- N=1 (single element)
- N=2 (smallest non-trivial)
- N=max or near-max
- All elements equal
- All elements the maximum allowed value
- All elements the minimum allowed value (including negatives if allowed)
- K=1, K=N if K is a parameter
- Empty result edge cases if applicable

TIER 2 — Wrong-approach killers (use the minimal_killing_examples from above):
- Include a scaled or direct version of each minimal_killing_example
- These are CONFIRMED to break specific wrong approaches
- Do not skip any wrong approach from the list above

TIER 3 — Structurally tricky (construct these specifically for this problem):
- Inputs where the answer is a single element (greedy would pick wrong)
- Inputs where taking a penalty is strictly better than avoiding it
- Inputs with many ties or equal values
- Inputs where the optimal solution skips the globally largest element
- Inputs constructed to have a non-obvious optimal choice

TIER 4 — Randomly structured tricky (2-3 cases):
- Small N (5-15), values biased toward the trap structures identified above
- Use the killing_input_structure patterns from wrong_approaches
- These are semi-random but structurally targeted

For EVERY case give exact values. Never write "random values" or "large values".

Return JSON:
{
  "files": [
    ${files
      .map(
        (f) => `{
      "file": "${f.filename}",
      "type": "edge",
      "purpose": "string",
      "cases": [
        {
          "name": "string",
          "tier": "1 or 2 or 3 or 4",
          "n": number,
          "exact_construction": "exact values or formula",
          "targets_wrong_approach": "name of wrong approach this kills, or null",
          "bug_caught": "specific failure mode"
        }
      ]
    }`,
      )
      .join(",\n    ")}
  ]
}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildLargeReasoningPrompt
// ─────────────────────────────────────────────────────────────────────────────
function buildLargeReasoningPrompt(
  problem,
  complexity,
  approaches,
  files,
  difficulty,
) {
  return `
You are designing large/stress testcases for a competitive programming problem.
Return ONLY valid JSON.

PROBLEM: ${problem.problemStatement}
INPUT FORMAT: ${problem.inputFormat}
CONSTRAINTS: ${problem.constraints}
DIFFICULTY: ${difficulty}
OPTIMAL COMPLEXITY: ${complexity}

WORST CASE STRUCTURES (from analysis):
${JSON.stringify(approaches.worst_case_structures, null, 2)}

WRONG APPROACHES TO KILL:
${JSON.stringify(
  approaches.wrong_approaches.map((a) => ({
    name: a.name,
    complexity: a.complexity,
    killing_input_structure: a.killing_input_structure,
    minimal_killing_example: a.minimal_killing_example,
  })),
  null,
  2,
)}

STANDARD LIMITS: ~10^8 ops for C++/Java at 2-3s, ~10^7 ops for Python at 10s.

YOUR TASK:
Design large testcases that simultaneously guarantee:

REQUIREMENT 1 — TLE for wrong complexity:
- Sum of N must mathematically force TLE for any solution worse than ${complexity}
- Use the worst_case_structures above — anti-sorted, adversarial distributions, etc.
- Every large testcase must be deterministically constructed, NOT random

REQUIREMENT 2 — WA for wrong algorithms at scale:
- CRITICAL: Scale the killing_input_structure from EACH wrong approach to max N
- A greedy solution that passes small inputs must fail on these large inputs too
- A fast-but-wrong solution must produce wrong output, not just TLE
- For each large testcase explicitly state which wrong approach it kills and why

REQUIREMENT 2B — Split responsibilities when possible:
- Prefer T = 2 for the large file when the file budget allows it
- testcase_index 0: a scaled WA-producing trap copied from a minimal_killing_example or killing_input_structure
- testcase_index 1: an absolute TLE stress case built to maximize the real bottleneck of the intended wrong complexity
- If more than 2 cases are required by the budget, keep the first two roles above and use any extra cases only as additional coverage
- ENSURE THAT THIS TESTCASE PRODUCES TLE for unoptimized and bruteforce solutions, not just WA for greedy/suboptimal ones. It should be a pure time trap that any solution above the optimal complexity falls into, even if it is correct.

REQUIREMENT 3 — Anti-early-exit:
- No structure that allows wrong solutions to terminate early with a lucky answer
- No sorted inputs unless the problem requires sorted input
- No uniform value inputs unless they specifically target a wrong approach

REQUIREMENT 4 — Scale the minimal_killing_examples:
- Take each minimal_killing_example from the wrong approaches above
- Scale its structural pattern to N = max allowed
- This is the most reliable way to ensure large tests catch WA, not just TLE

For each file return:
- T testcases
- Exact n_values array
- sum_n that equals max_allowed_sum_of_n exactly
- helper_function_name that builds the input deterministically
- construction_algorithm: step by step, no randomness
- For each testcase: which wrong approach it kills and how

Return JSON:
{
  "max_allowed_sum_of_n": number,
  "files": [
    ${files
      .map(
        (f) => `{
      "file": "${f.filename}",
      "type": "large",
      "purpose": "string",
      "worst_case_payload_design": {
        "anti_early_exit_pattern": "string",
        "worst_case_distribution": "string"
      },
      "helper_function_name": "string",
      "construction_algorithm": "step by step deterministic construction",
      "T": 2,
      "n_values": [array],
      "sum_n": number,
      "per_testcase_targets": [
        {
          "testcase_index": number,
          "kills_wrong_approach": "name",
          "why_tle_or_wa": "string"
        }
      ],
      "why_optimal_unaffected": "string"
    }`,
      )
      .join(",\n    ")}
  ]
}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildGenericReasoningPrompt
// ─────────────────────────────────────────────────────────────────────────────
function buildGenericReasoningPrompt(
  problem,
  complexity,
  approaches,
  files,
  difficulty,
) {
  return `
You are designing generic testcases for a competitive programming problem.
Return ONLY valid JSON.

PROBLEM: ${problem.problemStatement}
INPUT FORMAT: ${problem.inputFormat}
CONSTRAINTS: ${problem.constraints}
DIFFICULTY: ${difficulty}
OPTIMAL COMPLEXITY: ${complexity}

WRONG APPROACHES AND KILLING STRUCTURES:
${JSON.stringify(
  approaches.wrong_approaches.map((a) => ({
    name: a.name,
    killing_input_structure: a.killing_input_structure,
  })),
  null,
  2,
)}

YOUR TASK:
Design generic testcase files that provide broad coverage using a MIX of:

PORTION 1 — Trap-structured (40% of cases):
- Inputs built from the killing_input_structure of each wrong approach
- Vary N from small to medium (not max)
- These are NOT random — they have specific structure that stresses wrong approaches

PORTION 2 — Boundary-adjacent random (30% of cases):
- Random values but with N near boundaries (N=2, N=3, N near max for this file)
- Random values biased toward constraint extremes (mix of min/max values)

PORTION 3 — Pure random (30% of cases):
- Fully random across all valid ranges
- Provides volume and catches unexpected bugs

For each file specify:
- T: total number of testcases
- n_range: [min, max] for N in this file
- value_range: [min, max] for values
- trap_structured_count: how many cases are trap-structured
- trap_patterns: which wrong approach killing structures to use
- sum_n_budget: total N budget for this file (must stay within constraints)

Return JSON:
{
  "files": [
    ${files
      .map(
        (f) => `{
      "file": "${f.filename}",
      "type": "generic",
      "purpose": "string",
      "T": number,
      "n_range": [min, max],
      "value_range": [min, max],
      "sum_n_budget": number,
      "trap_structured_count": number,
      "trap_patterns": [
        {
          "wrong_approach_name": "string",
          "structure_description": "how to construct inputs that stress this approach",
          "n_range_for_this_pattern": [min, max]
        }
      ]
    }`,
      )
      .join(",\n    ")}
  ]
}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildAdversarialReasoningPrompt
// ─────────────────────────────────────────────────────────────────────────────
function buildAdversarialReasoningPrompt(
  problem,
  complexity,
  approaches,
  files,
  difficulty,
) {
  return `
You are designing adversarial testcases for a competitive programming problem.
Return ONLY valid JSON.

PROBLEM: ${problem.problemStatement}
INPUT FORMAT: ${problem.inputFormat}
CONSTRAINTS: ${problem.constraints}
DIFFICULTY: ${difficulty}
OPTIMAL COMPLEXITY: ${complexity}

ALL WRONG APPROACHES WITH VERIFIED KILLING EXAMPLES:
${JSON.stringify(approaches.wrong_approaches, null, 2)}

YOUR TASK:
Select exactly TWO of the most dangerous, non-trivial wrong approaches — ones that:
  - Pass the sample testcases
  - Pass >70% of random inputs
  - Require specific structural traps to expose
  - Are substantive algorithmic mistakes (no trivial off-by-one, single-value, or formatting-only bugs)

For each selected approach provide everything the fuzzer needs to find mismatches. Ensure each approach is a realistic algorithmic variant (not a trivial heuristic):
1. Exact implementable pseudocode (with actual variable names from this problem)
2. Verified minimal_failing_example — you MUST trace both algorithms manually
3. Multiple structural variants of the trap (not just one pattern)
4. Scaling instructions to reproduce the trap at N=10, N=50, N=100

The adversarial file must collectively catch BOTH selected wrong approaches.

N budget for adversarial file: medium (the fuzzer explores, not brute forces)
Recommended: adversarial_n_budget = sum of all n_values * 3 (fuzzer generates many small cases)

Return JSON:
{
  "files": [
    ${files
      .map(
        (f) => `{
      "file": "${f.filename}",
      "type": "adversarial",
      "purpose": "string",
      "logic_trap_description": "string",
      "adversarial_n_budget": number,

      "buggy_implementations": [
        {
          "name": "string",
          "approach_summary": "one sentence",
          "pseudocode": "5-10 lines, actual variable names, implementable exactly",
          "why_it_seems_correct": "one sentence",
          "why_it_fails": "exact structural condition",
          "estimated_pass_rate_on_random": "e.g. 80%"
        }
      ],

      "minimal_failing_example": {
        "description": "string",
        "raw_input": "exact multi-line string, T on first line, N <= 8",
        "optimal_output": "manually traced",
        "buggy_outputs": [
          {
            "buggy_name": "string",
            "wrong_output": "manually traced",
            "trace": "3-5 line trace"
          }
        ]
      },

      "trap_variants": [
        {
          "name": "string",
          "description": "structural variant of the main trap",
          "construction": "how to build this variant"
        }
      ],

      "trap_scaling_pattern": "string",
      "fallback_construction_algorithm": "string",
      "T": number,
      "n_values": [array],
      "why_suboptimal_WA": "string"
    }`,
      )
      .join(",\n    ")}
  ]
}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildSampleReasoningEntry — no LLM needed, just returns the sample instruction
// ─────────────────────────────────────────────────────────────────────────────
function buildSampleEntry(files) {
  return files.map((f) => ({
    file: f.filename,
    type: "sample",
    purpose: "Verify basic functionality against provided sample",
    instruction: "use exact sample provided",
  }));
}

module.exports = {
  buildEdgeReasoningPrompt,
  buildLargeReasoningPrompt,
  buildGenericReasoningPrompt,
  buildAdversarialReasoningPrompt,
  buildSampleEntry,
};
