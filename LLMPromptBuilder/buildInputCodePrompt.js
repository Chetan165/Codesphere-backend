function buildInputCodePrompt(problem, reasoning, fileList, injection) {
  const functionList = fileList
    .map((f) => `generate_input${f.index}()  →  ${f.filename}  [${f.type}]`)
    .join("\n");
  const functionCalls = fileList
    .map((f) => `    generate_input${f.index}()`)
    .join("\n");

  const largeCase = reasoning.testcases?.find((t) => t.type === "large");
  const adversarialCase = reasoning.testcases?.find(
    (t) => t.type === "adversarial",
  );
  const hasAdversarial = !!adversarialCase;

  // N budget: use adversarial_n_budget from plan, or fall back to max_allowed / 4 as a safe share
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
GENERAL RULES (all files)
═══════════════════════════════════════════════

1. Write exactly these functions, one per output file:
${functionList}

2. Each function creates its file with:
   os.makedirs("input", exist_ok=True)

3. SAMPLE FILE (type: sample): the sampleInput field contains the EXACT string to write.
   Do not generate new sample cases. Do not modify. Write this exact string:
   open("input/input00.txt","w").write(${JSON.stringify(problem.sampleInput + "\n")})
   That is the complete function body for generate_input00.

4. EDGE FILE (type: edge): implement each case from the plan exactly.
   After generating the planned deterministic edge cases, append 3 to 5 MID-SIZED, fully random generic cases to this same file to pad it and obscure the edge traps.
   CRITICAL: Do not use tiny inputs for padding. "Mid-sized" means using roughly 20% to 50% of the problem's maximum allowed constraints for N and value ranges.

5. LARGE FILE:
${
  largeCase
    ? `   Helper  : ${largeCase.helper_function_name}(n)
   Pattern : ${largeCase.worst_case_payload_design?.anti_early_exit_pattern || "see plan"}
   Distrib : ${largeCase.worst_case_payload_design?.worst_case_distribution || "see plan"}
   Build   : ${largeCase.construction_algorithm}
   N vals  : ${JSON.stringify(largeCase.n_values)}
   sum_n   : ${largeCase.sum_n} (must equal this exactly)
   RULE: helper must NOT use random as primary source. Build deterministically.`
    : "   See plan."
}

6. GENERIC FILE (type: generic): use random within constraint ranges from the plan.

7. Comment above each function:
   # TYPE: [type]
   # TARGETS: [what wrong algorithm or suboptimal approach this stresses]
   # SUM_N: [total sum of all N values written to this file]

8. Stdlib only: random, os, math, sys, time, hashlib, string, itertools. No pip.

═══════════════════════════════════════════════
${
  hasAdversarial
    ? `ADVERSARIAL FILE — FULL SPECIFICATION
═══════════════════════════════════════════════

CONTEXT:
This file targets students who submitted conceptually wrong algorithms that happen
to pass easy/random inputs. The wrong approaches identified in the plan are:
${JSON.stringify(adversarialCase?.buggy_implementations || [], null, 2)}

Trap being exploited: "${adversarialCase?.logic_trap_description || "see plan"}"
Trap scaling pattern: "${adversarialCase?.trap_scaling_pattern || "see plan"}"
N budget for this file: ${nBudget} (sum of all N across all found cases must not exceed this)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP A — implement optimal + buggy solutions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A1. Translate the reference solution below into optimal_ans(*args).
    The reference solution reads from stdin. Your job is to extract ONLY
    the per-testcase logic and wrap it in a function.

    The function signature must match format_case and get_n exactly.
    It must return the answer as a value — no stdin, no print, no sys.stdout.

    Translation rules:
    - Remove all stdin reading (sys.stdin.read, input(), next(tokens))
    - Remove all stdout writing (print, sys.stdout.write)
    - The function receives the parsed testcase variables directly as arguments
    - Keep all DP logic, data structures, and math exactly as written
    - Do NOT simplify, optimize, or rewrite the algorithm

REFERENCE SOLUTION (translate this — do not rewrite):
${problem.solution}

A2. Implement optimal_ans(*args) → comparable return value (no print).
    Must be correct for all inputs. Use the solution logic from the problem plan.

A3. For each buggy_implementations entry implement buggy_1, buggy_2, etc.
    Follow the pseudocode EXACTLY — implement the described wrong algorithm faithfully.
    Do not accidentally fix it. Each must also return a comparable value (no print).

A4. BUGGY_FNS = [buggy_1, buggy_2, ...]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP B — helpers
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

B1. format_case(*args) → str: serialize ONE testcase, no T header, just the body lines.

B2. get_n(*args) → int: return the N (input size) for a given set of args.
    Used to track sum_n so we never exceed the N budget.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP C — collection setup (TWO separate budgets)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# EXPLORATION budget — how many candidates we test during fuzzing
EXPLORE_MAX_CASES = 1000   # STRICT MEMORY CAP to prevent OOM crashes
EXPLORE_TIME      = 25.0   # Total time allowed

# OUTPUT budget — what actually goes in the final file
N_BUDGET   = ${nBudget}    # sum of N in final output file
MAX_OUTPUT = 100           # max testcases in final output file

# Exploration state
candidates = []    # list of (formatted_string, n_size, phase, structure_tag)
start_time = time.time()
def elapsed(): return time.time() - start_time

def check_and_collect(phase, structure_tag, *args):
    """
    Test args. If any buggy disagrees with optimal, add to candidates.
    No N budget check here — we collect everything during exploration.
    """
    if len(candidates) >= EXPLORE_MAX_CASES:
        return False

    try:
        opt = optimal_ans(*args)
        for buggy_fn in BUGGY_FNS:
            try:
                if buggy_fn(*args) != opt:
                    n = get_n(*args)
                    candidates.append((format_case(*args), n, phase, structure_tag))
                    return True
            except Exception:
                pass
    except Exception:
        pass
    return False

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP D — seed from minimal_failing_example
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Parse the minimal_failing_example from the plan and attempt to collect it.
This is the guaranteed seed — it should always succeed since the plan verified it.

Seed input from plan: ${JSON.stringify(adversarialCase?.minimal_failing_example?.raw_input || "see plan")}
Expected optimal output: ${JSON.stringify(adversarialCase?.minimal_failing_example?.optimal_output || "see plan")}

After collecting the seed, generate 5-10 scaled-up variants using the trap scaling pattern.
For each variant, call check_and_collect.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP E — three-phase collection (ALL phases run for full time share)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRITICAL RULE: Stop exploration immediately if len(candidates) >= EXPLORE_MAX_CASES.

Each phase has its own deadline derived from start_time:
  phase1_end = start_time + 5.0    # 5 seconds for exhaustive
  phase2_end = start_time + 15.0   # 10 more seconds for structured
  phase3_end = start_time + 20.0   # 5 more seconds for random

PHASE 1 — exhaustive small N:
  For N in range(1, 4):  # STRICT LIMIT: NEVER exceed N=3 for iproduct to prevent CPU lock.
    Choose a small adversarial value set (max 4-5 values) representing Equivalence Classes 
    (e.g., [constraint_min, -1, 0, 1, constraint_max]). Do NOT just use [-1,0,1] if the trap relies on huge numbers.
    Use itertools.product over this set.
    For each candidate:
      if time.time() > phase1_end or len(candidates) >= EXPLORE_MAX_CASES: break
      check_and_collect(1, "exhaustive", ...)

PHASE 2 — structured adversarial random:
  Generate inputs whose STRUCTURE targets the trap but whose VALUES have randomness.
  Base all structure decisions on the trap_scaling_pattern from the plan.
  Loop continuously:
    if time.time() > phase2_end or len(candidates) >= EXPLORE_MAX_CASES: break
    # generate one structured input, call check_and_collect(2, "structured", ...)

PHASE 3 — pure random sweep:
  Fully random valid inputs across all constraint ranges.
  Loop continuously:
    if time.time() > phase3_end or len(candidates) >= EXPLORE_MAX_CASES: break
    # generate one random input, call check_and_collect(3, "random", ...)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP F — select best candidates to write (Balanced Phase Mixing)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Deduplicate by content hash first
seen = set()
unique = []
for cstr, n, ph, tg in candidates:
    h = hashlib.md5(cstr.encode()).hexdigest()
    if h not in seen:
        seen.add(h)
        unique.append((cstr, n, ph, tg))

# Separate cases by phase and sort each pool by smallest N
p1_cases = sorted([x for x in unique if x[2] == 1], key=lambda x: x[1])
p2_cases = sorted([x for x in unique if x[2] == 2], key=lambda x: x[1])
p3_cases = sorted([x for x in unique if x[2] == 3], key=lambda x: x[1])

final_cases = []
curr_n = 0

# Helper to add cases while respecting budgets
def add_from_pool(pool, max_to_take):
    global curr_n
    taken = 0
    for cstr, n, ph, tg in pool:
        if taken >= max_to_take or len(final_cases) >= MAX_OUTPUT: break
        if curr_n + n > N_BUDGET: continue
        final_cases.append(cstr)
        curr_n += n
        taken += 1

# Take a balanced mix: 30% Micro (P1), 40% Structured (P2), 30% Random (P3)
add_from_pool(p1_cases, int(MAX_OUTPUT * 0.3))
add_from_pool(p2_cases, int(MAX_OUTPUT * 0.4))
add_from_pool(p3_cases, int(MAX_OUTPUT * 0.3))

# If we still have room in the file (because a phase didn't find enough), fill remaining slots
remaining_slots = MAX_OUTPUT - len(final_cases)
if remaining_slots > 0:
    # Fill from whatever is left over, prioritizing P1 -> P2 -> P3
    leftovers = [x for x in p1_cases + p2_cases + p3_cases if x[0] not in final_cases]
    add_from_pool(leftovers, remaining_slots)

if not final_cases:
    # Safe fallback using the exact minimal example from the JSON plan
    fallback_str = ${JSON.stringify(adversarialCase?.minimal_failing_example?.raw_input || "1\n1")}
    final_cases.append(fallback_str)
    curr_n += 10  # safe dummy n for the fallback

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP G — write output file
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

T = len(final_cases)

with open("${adversarialCase?.file || "input/input04.txt"}", "w") as f:
    f.write(f"{T}\\n")
    for case_body in final_cases:
        f.write(case_body)
        if not case_body.endswith("\\n"):
            f.write("\\n")

print(
    f"[adversarial] T={T} | sum_n={curr_n} / {N_BUDGET} | elapsed={elapsed():.1f}s",
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

Return ONLY Python code. No JSON. No explanation. No markdown fences.
First line of output must be: import random
`;
}

module.exports = buildInputCodePrompt;
