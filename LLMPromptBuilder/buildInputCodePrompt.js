function buildInputCodePrompt(problem, reasoning, fileList, injection) {
  const functionList = fileList
    .map((f) => `generate_input${f.index}()  →  ${f.filename}  [${f.type}]`)
    .join("\n");
  const functionCalls = fileList
    .map((f) => `    generate_input${f.index}()`)
    .join("\n");

  const largeCase = reasoning.testcases?.find((t) => t.type === "large");
  const adversarialCase = reasoning.testcases?.find(
    (t) => t.type === "adversarial" || t.type === "wa",
  );
  const genericCase = reasoning.testcases?.find((t) => t.type === "generic");
  const edgeCases = reasoning.testcases?.filter((t) => t.type === "edge") || [];
  const hasAdversarial = !!adversarialCase;

  const nBudget =
    adversarialCase?.adversarial_n_budget ||
    Math.floor(
      (reasoning.problem_analysis?.max_allowed_sum_of_n_over_T || 200000) / 4,
    );

  return `
You are writing a Python testcase generator for a competitive programming problem.

INPUT FORMAT:
${problem.inputFormat}

CONSTRAINTS:
${problem.constraints}

FULL GENERATION PLAN:
${JSON.stringify(reasoning, null, 2)}

═══════════════════════════════════════════════
IMPORTS — file must start with exactly these
═══════════════════════════════════════════════

import random
import os
import math
import sys
import time
import hashlib
import string
from itertools import permutations, product as iproduct
from collections import defaultdict

═══════════════════════════════════════════════
GENERAL RULES
═══════════════════════════════════════════════

1. Write exactly these functions, one per output file:
${functionList}

2. Each function: os.makedirs("input", exist_ok=True) before writing.

3. Comment above each function:
   # TYPE: [type]
   # TARGETS: [what this stresses]
   # SUM_N: [total N written to this file]

4. Stdlib only. No pip packages.

═══════════════════════════════════════════════
SAMPLE FILE
═══════════════════════════════════════════════

For the sample file function, the ENTIRE body is:
    os.makedirs("input", exist_ok=True)
    open("input/input00.txt", "w").write(${JSON.stringify(problem.sampleInput + "\n")})

Do not generate cases. Do not modify. That exact string only.

═══════════════════════════════════════════════
EDGE FILES
═══════════════════════════════════════════════

The plan contains cases grouped into tiers:
- Tier 1: boundary values — implement exactly as specified, exact values
- Tier 2: wrong-approach killers — implement exactly, these are verified traps
- Tier 3: structurally tricky — implement exactly as specified
- Tier 4: semi-random tricky — use the specified structure but randomize values
  within the described pattern

For Tier 4 cases: generate 3-5 random instances of the described pattern.
Use random values but preserve the structural property (e.g. if the pattern
requires one large element followed by many medium elements, randomize the
magnitudes but keep the structure).

Never substitute random data for Tier 1, 2, or 3 cases.
Always write exact values for those tiers.

═══════════════════════════════════════════════
LARGE FILE
═══════════════════════════════════════════════
${
  largeCase
    ? `Helper  : ${largeCase.helper_function_name}(n, mode)
Pattern : ${largeCase.worst_case_payload_design?.anti_early_exit_pattern || "see plan"}
Distrib : ${largeCase.worst_case_payload_design?.worst_case_distribution || "see plan"}
Build   : ${largeCase.construction_algorithm}
N vals  : ${JSON.stringify(largeCase.n_values)}
sum_n   : ${largeCase.sum_n}

RULE 1: Helper must be deterministic. No random as primary source.
RULE 2: Each testcase targets a specific wrong approach per per_testcase_targets.
        Build the input structure that specifically kills that approach at large N.
RULE 3: sum_n must equal ${largeCase.sum_n} exactly.`
    : "See plan."
}

═══════════════════════════════════════════════
GENERIC FILE
═══════════════════════════════════════════════
${
  genericCase
    ? `T        : ${genericCase.T}
n_range  : ${JSON.stringify(genericCase.n_range)}
v_range  : ${JSON.stringify(genericCase.value_range)}
sum_n    : ${genericCase.sum_n_budget}
trap_structured_count: ${genericCase.trap_structured_count}
trap_patterns: ${JSON.stringify(genericCase.trap_patterns, null, 2)}

Build the generic file in THREE portions:
PORTION 1 (${genericCase.trap_structured_count} cases) — trap-structured:
  For each trap_pattern in the plan:
    Generate ceil(trap_structured_count / num_patterns) cases using that pattern.
    The structure must match the pattern description exactly.
    Values within the structure can be random within valid ranges.

PORTION 2 (30% of remaining T) — boundary-adjacent random:
  N chosen near boundaries: mix of small N (2-5) and large N (near n_range max).
  Values biased: 30% chance each value is at constraint min or max.

PORTION 3 (remaining) — pure random:
  N and values fully random within n_range and value_range.`
    : "See plan."
}

═══════════════════════════════════════════════
${
  hasAdversarial
    ? `ADVERSARIAL FILE
═══════════════════════════════════════════════

CONTEXT:
Trap: "${adversarialCase?.logic_trap_description || "see plan"}"
Wrong approaches to implement as buggy functions:
${JSON.stringify(adversarialCase?.buggy_implementations || [], null, 2)}
Trap variants to explore:
${JSON.stringify(adversarialCase?.trap_variants || [], null, 2)}
Trap scaling pattern: "${adversarialCase?.trap_scaling_pattern || "see plan"}"
N budget: ${nBudget}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP A — optimal + buggy functions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A1. Translate the reference solution into optimal_ans(*args) → return value.
    No stdin. No print. Return the answer directly.
    Translation rules:
    - Remove all sys.stdin / input() / next(tokens) reading
    - Remove all print / sys.stdout.write
    - Receive parsed testcase variables as function arguments
    - Keep ALL DP logic, data structures, math exactly as written
    - Do NOT simplify or rewrite

REFERENCE SOLUTION:
${problem.solution}

A2. Implement each buggy function from buggy_implementations.
    Follow pseudocode EXACTLY. Implement the wrong algorithm faithfully.
    Do not accidentally fix it. Return value directly, no print.

A3. BUGGY_FNS = [buggy_1, buggy_2, ...]  (one per buggy_implementations entry)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP B — helpers
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

format_case(*args) → str: ONE testcase body, no T header, ends with newline.
get_n(*args) → int: return N for these args.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP C — collection setup
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

candidates = []
start_time = time.time()
def elapsed(): return time.time() - start_time

EXPLORE_MAX = 2000
EXPLORE_TIME = 25.0

def explore_ok():
    return elapsed() < EXPLORE_TIME and len(candidates) < EXPLORE_MAX

def check_and_collect(phase, tag, *args):
    try:
        opt = optimal_ans(*args)
        for i, buggy_fn in enumerate(BUGGY_FNS):
            try:
                if buggy_fn(*args) != opt:
                    candidates.append((format_case(*args), get_n(*args), phase, tag, i))
                    return True
            except Exception:
                pass
    except Exception:
        pass
    return False

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP D — seed from minimal_failing_example
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Parse the raw_input from the plan:
${JSON.stringify(adversarialCase?.minimal_failing_example?.raw_input || "see plan")}
Expected optimal: ${JSON.stringify(adversarialCase?.minimal_failing_example?.optimal_output || "see plan")}

Attempt check_and_collect(0, "seed", ...) on the seed input.
Then generate 5-10 scaled variants using the trap_scaling_pattern.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP E — exploration phases (ALL run for full time share)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RULE: All phases run for their full time allocation regardless of how many
candidates were found. Do NOT break early because candidates were found.
Only stop when explore_ok() returns False.

phase1_end = start_time + 8.0
phase2_end = start_time + 18.0
phase3_end = start_time + 25.0

PHASE 1 — exhaustive small N (until phase1_end):
  For n in range(1, 9):
    Choose value_set: 4-5 values that stress the trap.
    Use the killing_input_structure to pick values — not [1,2,3,4].
    For k in all_valid_k_values (if K is a parameter):
      for A in iproduct(value_set, repeat=n):
        if explore_ok() and time.time() < phase1_end:
          check_and_collect(1, "exhaustive", n, k, list(A))  # adjust args to match problem

PHASE 2 — trap variants (until phase2_end):
  Implement each trap_variant from the plan as a generator function.
  For each variant, generate inputs at multiple N values (10, 20, 50, 100):
    while explore_ok() and time.time() < phase2_end:
      for each trap_variant:
        n = random.choice([10, 20, 30, 50, 100])
        A = build_variant(n)  # implement each trap_variant's construction
        check_and_collect(2, variant.name, n, A)

  Also add:
  - TIE-HEAVY: restrict value range to force equal values
  - BOUNDARY CLUSTER: values only from [min, min+1, max-1, max]
  - SHUFFLE OF TRAP: build trap pattern then random.shuffle()

PHASE 3 — pure random (until phase3_end):
  while explore_ok() and time.time() < phase3_end:
    generate fully random valid inputs
    check_and_collect(3, "random", ...)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP F — selection: diversity-first, N-budget-aware
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

N_BUDGET = ${nBudget}
MAX_OUTPUT = 100

# Deduplicate
seen_hashes = set()
unique_candidates = []
for case_str, n, phase, tag, buggy_idx in candidates:
    h = hashlib.md5(case_str.encode()).hexdigest()
    if h not in seen_hashes:
        seen_hashes.add(h)
        unique_candidates.append((case_str, n, phase, tag, buggy_idx))

# Sort: phase 1 first (smallest, most pure), then phase 2, then phase 3
# Within each phase, smaller N first (fits more cases in budget)
unique_candidates.sort(key=lambda x: (x[2], x[1]))

# Round-robin selection across buggy functions for diversity
# Ensures the output file catches ALL wrong approaches, not just one
coverage = defaultdict(list)
for item in unique_candidates:
    coverage[item[4]].append(item)

final_cases = []
sum_n_final = 0
buggy_keys = list(coverage.keys())
pointers = {k: 0 for k in buggy_keys}

while sum_n_final < N_BUDGET and len(final_cases) < MAX_OUTPUT:
    made_progress = False
    for bk in buggy_keys:
        pool = coverage[bk]
        ptr = pointers[bk]
        while ptr < len(pool):
            case_str, n, phase, tag, _ = pool[ptr]
            ptr += 1
            if sum_n_final + n <= N_BUDGET:
                final_cases.append(case_str)
                sum_n_final += n
                made_progress = True
                break
        pointers[bk] = ptr
    if not made_progress:
        break

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP G — fallback
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If final_cases is empty, build one deterministic trap:
"${adversarialCase?.fallback_construction_algorithm || "see plan"}"
Append unconditionally.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP H — write
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

T = len(final_cases)
with open("${adversarialCase?.file || "input/inputXX.txt"}", "w") as f:
    f.write(f"{T}\\n")
    for case_body in final_cases:
        f.write(case_body)
        if not case_body.endswith("\\n"):
            f.write("\\n")

print(
    f"[adv] explored={len(candidates)} "
    f"written={T} sum_n={sum_n_final}/{N_BUDGET} t={elapsed():.1f}s",
    file=sys.stderr
)
`
    : "═══════════════════════════════════════════════"
}

═══════════════════════════════════════════════
MANDATORY EXECUTION BLOCK
═══════════════════════════════════════════════

if __name__ == "__main__":
${functionCalls}

Return ONLY Python code. No JSON. No markdown fences. No triple backticks anywhere.
First line must be: import random
`;
}

module.exports = buildInputCodePrompt;
