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

STEP 1 — ANALYZE THE INPUT FORMAT:
Before writing anything else, analyze the input format and determine:
- What variables exist per testcase (N, K, M, edges, etc.)
- Which are scalars vs arrays vs edge-lists vs matrices vs strings
- What the natural function signature would be for a solve(args) function

Return this analysis in the "input_signature" field.

Return ONLY valid JSON:
{
  "input_signature": {
    "description": "e.g. Each testcase has N (int), K (int), then array of N ints",
    "args_list": ["n", "k", "arr"],
    "args_types": {"n": "int", "k": "int", "arr": "list[int]"},
    "primary_array_arg": "arr",
    "primary_size_arg": "n",
    "scalar_args": ["k"],
    "parse_code": "n, k = map(int, input().split())\\narr = list(map(int, input().split()))",
    "format_code": "f\\"{n} {k}\\\\n{' '.join(map(str, arr))}\\\\n\\"",
    "vmin": -1000000000,
    "vmax": 1000000000,
    "nmin": 1,
    "nmax": 100000
  },

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
      "buggy_python_function": "COMPLETE Python function body as a string. This must be actual runnable Python code defining a function that takes the SAME arguments as described in input_signature.args_list and returns the answer. The function MUST contain the algorithmic bug. Comment the buggy line with # BUG: explanation. Example for a problem with signature (n, arr):\\n\\ndef buggy_greedy(n, arr):\\n    arr_sorted = sorted(arr, reverse=True)  # BUG: sorts by value not ratio\\n    return sum(arr_sorted[:n//2])",
      "passes_sample": true,
      "estimated_pass_rate_on_random_small": "e.g. 80%",
      "killing_input_structure": {
        "description": "exact structural description of what breaks this approach",
        "python_constructor": "a single-line Python lambda string: lambda n, vmax: [...] that builds a LIST (the core array/values) of length n using vmax as the constraint ceiling. Must be directly eval()-able. Example: 'lambda n, vmax: [vmax if i % 3 == 0 else vmax // 3 for i in range(n)]'. Use only builtins: range, list, sorted, reversed, min, max, abs, int, len. No imports.",
        "constructor_verified_on": "short string: e.g. n=6, vmax=9 → [9,3,3,9,3,3]"
      },
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
      "python_constructor": "single-line lambda string same rules as above",
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

CRITICAL for buggy_python_function:
- Must be a COMPLETE, RUNNABLE Python function definition as a string
- Must accept the EXACT arguments described in input_signature.args_list
- Must RETURN the answer (no print, no stdin)
- Must contain the actual algorithmic bug — not a correct solution
- Comment the buggy line(s) with # BUG: explanation
- Must use standard Python only — no imports beyond builtins
- DO NOT accidentally fix the bug. The function must produce WRONG output
  on the minimal_killing_example.

Still include at least 6 edge cases in the 'edge_case_inventory' that clearly
expose the listed wrong approaches. Every 'minimal_killing_example' must be
manually verified using your code execution capability — run both the wrong
algorithm and the correct algorithm on the raw_input and confirm the outputs.
The python_constructor in killing_input_structure must also be tested: eval() it,
call it with small n and vmax, confirm the output looks structurally correct.

CRITICAL for python_constructor:
- Must be a string containing a valid Python lambda
- Must accept exactly (n, vmax) as arguments
- Must return a flat list of integers
- Must use only Python builtins (range, list, sorted, reversed, min, max, abs, int, len)
- No imports, no multiline, no semicolons
- Test it yourself before writing it

CRITICAL for input_signature:
- parse_code must be the exact Python lines needed to read ONE testcase from stdin
  (not including the T line). Use input() and split().
- format_code must be a Python f-string or expression that produces the text representation
  of ONE testcase (no T header, ending with newline).
- vmin/vmax are the min/max values for the PRIMARY array elements.
- nmin/nmax are the min/max values for the primary size parameter.

Return exactly one JSON object, and nothing else — no commentary, no markdown, no code fences, no explanation.
All keys and string values must use double quotes. No trailing commas. Escape newlines as \\n and backslashes as \\\\ inside string values.
`;
}

module.exports = buildApproachMiningPrompt;
