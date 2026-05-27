function buildApproachMiningPrompt(problemData) {
  return `
You are analyzing a competitive programming problem to identify every plausible
wrong or suboptimal approach a student would submit.

PROBLEM: ${problemData.problemStatement}
INPUT FORMAT: ${problemData.inputFormat}
OUTPUT FORMAT: ${problemData.outputFormat}
CONSTRAINTS: ${problemData.constraints}
OPTIMAL COMPLEXITY: ${problemData.expectedComplexity}
TAGS: ${problemData.tags?.join(", ") || "unknown"}

CORRECT SOLUTION (use this to understand what the right approach is):
${problemData.solution}

YOUR TASK:
Enumerate every approach a student might try, from most to least plausible.
For each approach identify the EXACT input structure that exposes its failure.

Think about:
- Greedy variants that seem correct but aren't
- Simpler DP that ignores one constraint or dimension
- Correct algorithm with wrong complexity (O(N^2) instead of O(N))
- Correct algorithm applied to wrong problem simplification
- Approaches that work on sorted/distinct inputs but fail on duplicates or negatives
- Approaches that get lucky on random inputs but fail on crafted ones

Return ONLY valid JSON:
{
  "correct_algorithm": {
    "name": "short name e.g. Monotonic Deque DP",
    "key_insight": "the one non-obvious insight that makes this correct",
    "complexity": "O(...)"
  },

  "wrong_approaches": [
    {
      "rank": 1,
      "name": "short name",
      "why_students_try_it": "one sentence — why this seems right",
      "complexity": "O(...)",
      "pseudocode": "5-10 lines using ACTUAL variable names from this problem. Specific enough to implement exactly.",
      "passes_sample": true,
      "estimated_pass_rate_on_random_small": "e.g. 80%",
      "killing_input_structure": "exact structural description of what breaks this approach",
      "minimal_killing_example": {
        "description": "why this specific input breaks the approach",
        "raw_input": "exact multi-line input string including T on first line. N <= 8.",
        "correct_output": "exact output from correct algorithm, manually traced",
        "wrong_output": "exact output from this wrong approach, manually traced",
        "trace": "3-5 line step-by-step trace through the wrong algorithm on this input"
      }
    }
  ],

  "worst_case_structures": [
    {
      "name": "short name e.g. anti-sorted input",
      "targets": "which wrong approach or complexity this kills",
      "construction": "step by step how to build this for arbitrary N",
      "why_correct_unaffected": "one sentence",
      "why_wrong_fails": "one sentence — TLE or WA and why"
    }
  ],

  "edge_case_inventory": [
    {
      "name": "short name",
      "exact_construction": "exact values or formula, not vague descriptions",
      "catches": "specific bug this exposes in wrong solutions"
    }
  ]
}

Be selective: provide up to 3 high-quality wrong approaches (max 3).
Each wrong approach must be a substantive, genuine algorithmic or complexity mistake
that could plausibly pass poorly-designed or naive test suites — NOT trivial issues
(such as typos, formatting, or minor off-by-one mistakes). Prioritize plausible,
non-trivial incorrect algorithms that would commonly be implemented by students
and could slip past weak tests.

Still include at least 6 edge cases in the 'edge_case_inventory' that clearly
expose the listed wrong approaches. Every 'minimal_killing_example' must be
manually verified — trace both the wrong algorithm and the correct algorithm.

Return exactly one JSON object, and nothing else — no commentary, no markdown, no code fences, no explanation."
Require: "All keys and string values must use double quotes. No trailing commas. Escape newlines as \\n and backslashes as \\\\ inside string values."
`;
}

module.exports = buildApproachMiningPrompt;
