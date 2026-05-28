function buildInputCodePrompt(problem, reasoning, fileList, injection) {
  const excludeAdversarial = injection?.excludeAdversarial || false;
  const adversarialOnly = injection?.adversarialOnly || false;

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
  const hasAdversarial = !!adversarialCase && !excludeAdversarial;

  const nBudget =
    adversarialCase?.adversarial_n_budget ||
    Math.floor(
      (reasoning.problem_analysis?.max_allowed_sum_of_n_over_T || 200000) / 4,
    );

  // Pull python_constructors from approaches if available
  const constructors = (problem.approaches?.wrong_approaches || [])
    .filter((a) => a.killing_input_structure?.python_constructor)
    .map((a) => ({
      name: a.name,
      constructor: a.killing_input_structure.python_constructor,
      verified_on: a.killing_input_structure.constructor_verified_on || "",
    }));

  // Pull input signature from approaches
  const sig = problem.approaches?.input_signature || null;

  // Pull buggy function definitions
  const buggyFunctions = (problem.approaches?.wrong_approaches || [])
    .filter((a) => a.buggy_python_function)
    .map((a, i) => {
      const normalized = a.buggy_python_function.replace(/\\n/g, "\n");
      const nameMatch = normalized.match(/def\s+(\w+)/);
      return {
        index: i,
        name: a.name,
        code: a.buggy_python_function,
        funcName: nameMatch?.[1] || `buggy_${i}`,
      };
    });

  // Build signature-aware template pieces
  const sigArgs = sig?.args_list?.join(", ") || "n, arr";
  const sigPrimaryArray = sig?.primary_array_arg || "arr";
  const sigPrimarySize = sig?.primary_size_arg || "n";
  const sigScalars = sig?.scalar_args || [];
  const sigVmin = sig?.vmin ?? 0;
  const sigVmax = sig?.vmax ?? 1000000000;
  const sigNmin = sig?.nmin ?? 1;
  const sigNmax = sig?.nmax ?? 100000;
  const sigPrimaryArrayIndex =
    sig?.args_list?.indexOf(sig?.primary_array_arg) ?? 1;

  // ═══════════════════════════════════════════════════════════════════════
  // BEGIN PROMPT ASSEMBLY
  // ═══════════════════════════════════════════════════════════════════════

  let prompt = `
You are writing a Python testcase generator for a competitive programming problem.

INPUT FORMAT:
${problem.inputFormat}

CONSTRAINTS:
${problem.constraints}

${adversarialOnly ? "" : `FULL GENERATION PLAN:\n${JSON.stringify(reasoning, null, 2)}`}

${
  sig
    ? `
═══════════════════════════════════════════════
INPUT SIGNATURE (from problem analysis — use this everywhere)
═══════════════════════════════════════════════

Arguments: ${sigArgs}
Types: ${JSON.stringify(sig.args_types)}
Primary array: ${sigPrimaryArray}
Primary size: ${sigPrimarySize}
Scalar args: ${JSON.stringify(sigScalars)}
Value range: [${sigVmin}, ${sigVmax}]
Size range: [${sigNmin}, ${sigNmax}]
Parse code (one testcase): ${sig.parse_code}
Format code (one testcase): ${sig.format_code}
`
    : ""
}

═══════════════════════════════════════════════
IMPORTS — file must start with exactly these
═══════════════════════════════════════════════

import random
import os
import math
import sys
import io
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
`;

  // ═══════════════════════════════════════════════════════════════════════
  // NON-ADVERSARIAL SECTIONS (sample + edge + generic + large)
  // ═══════════════════════════════════════════════════════════════════════

  if (!adversarialOnly) {
    prompt += `
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

MINIMUM CASE COUNT:
- At least 3 Tier 1 cases (boundary values)
- At least 1 case per wrong approach in Tier 2 (${problem.approaches?.wrong_approaches?.length || 0} approaches = ${problem.approaches?.wrong_approaches?.length || 0} cases minimum)
- At least 2 Tier 3 cases
- At least 2 Tier 4 cases
- TOTAL: at least ${Math.max(10, 3 + (problem.approaches?.wrong_approaches?.length || 0) + 4)} cases

If you cannot fit all cases within constraint limits, prioritize:
Tier 2 > Tier 1 > Tier 3 > Tier 4

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
RULE 3: sum_n must equal ${largeCase.sum_n} exactly.

VERIFIED CONSTRUCTORS FOR LARGE FILE:
Use these to build the WA-trap testcase (testcase_index 0):
${
  constructors.length > 0
    ? constructors
        .map(
          (c, i) =>
            `# "${c.name}": TRAP_LARGE_${i} = eval(${JSON.stringify(c.constructor)})
# Call: TRAP_LARGE_${i}(${largeCase?.n_values?.[0] || "N"}, ${sigVmax})
# Verified: ${c.verified_on}`,
        )
        .join("\n")
    : "# No constructors — follow construction_algorithm from plan"
}

For testcase_index 0 (WA trap): PREFER using a constructor above, scaled to n_values[0].
For testcase_index 1 (TLE stress): follow the construction_algorithm deterministically.`
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

VERIFIED TRAP CONSTRUCTORS (eval these directly — do not reinterpret them):
${
  constructors.length > 0
    ? constructors
        .map(
          (c) => `# ${c.name} — verified: ${c.verified_on}
TRAP_${c.name.toUpperCase().replace(/\s+/g, "_")} = eval(${JSON.stringify(c.constructor)})`,
        )
        .join("\n")
    : "# (no constructors available — use trap_patterns descriptions above)"
}

Build the generic file in THREE portions:

PORTION 1 (${genericCase.trap_structured_count} cases) — trap-structured:
  For each trap pattern below, generate cases at varying N values.
  
  CRITICAL: Do NOT generate random data for these cases.
  Use the TRAP_* constructors if available — they are verified to produce
  structurally adversarial inputs.
  
  Construction order:
  ${
    constructors.length > 0
      ? constructors
          .map(
            (c, i) =>
              `Case group ${i + 1}: Call TRAP_${c.name.toUpperCase().replace(/\s+/g, "_")}(n, ${sigVmax}) for n in [${Array.from(
                {
                  length: Math.min(
                    3,
                    Math.ceil(
                      genericCase.trap_structured_count /
                        Math.max(constructors.length, 1),
                    ),
                  ),
                },
                (_, j) =>
                  Math.floor(
                    genericCase.n_range[0] +
                      ((genericCase.n_range[1] - genericCase.n_range[0]) *
                        (j + 1)) /
                        4,
                  ),
              ).join(", ")}]`,
          )
          .join("\n  ")
      : "No constructors — implement trap_pattern descriptions manually with exact values."
  }
  
  If constructors produce arrays shorter/longer than n, use scale_pattern() to adjust:
  def scale_pattern(base, target_n):
      if not base: return [1]*target_n
      return (base * ((target_n // len(base)) + 1))[:target_n]
  
  Track sum_n across ALL portions. Do not exceed ${genericCase.sum_n_budget}.

PORTION 2 (30% of remaining T) — boundary-adjacent random:
  N chosen near boundaries: mix of small N (2-5) and large N (near n_range max).
  Values biased: 30% chance each value is at constraint min or max.

PORTION 3 (remaining) — pure random:
  N and values fully random within n_range and value_range.`
    : "See plan."
}
`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ADVERSARIAL SECTION
  // ═══════════════════════════════════════════════════════════════════════

  if (hasAdversarial || adversarialOnly) {
    prompt += `
═══════════════════════════════════════════════
ADVERSARIAL FILE
═══════════════════════════════════════════════
CRITICAL STRUCTURAL RULE:
EVERYTHING adversarial-related — optimal_ans definition, buggy function definitions,
BUGGY_FNS list, SEED_RAW_INPUT parsing, SEED_ARGS, sanity check, all phases,
selection logic, and file writing — MUST be defined INSIDE the
generate_input${fileList.find((f) => f.type === "adversarial")?.index || "04"}() function body.
NOTHING should be at module/top level. This script will be merged with another script,
and top-level code would execute before other generator functions run.

CONTEXT:
Trap: "${adversarialCase?.logic_trap_description || "see plan"}"
Trap variants to explore:
${JSON.stringify(adversarialCase?.trap_variants || [], null, 2)}
Trap scaling pattern: "${adversarialCase?.trap_scaling_pattern || "see plan"}"
N budget: ${nBudget}

═══════════════════════════════════════════════
ADVERSARIAL — PIECE 1: FUNCTION SIGNATURES
═══════════════════════════════════════════════

ALL functions in this file (optimal_ans, every buggy function, format_case,
get_n) MUST use this exact signature derived from the problem's input format:

  Function arguments: (${sigArgs})
  ${sigScalars.length > 0 ? `Where scalar args ${JSON.stringify(sigScalars)} are fixed per testcase` : ""}
  ${sigPrimaryArray ? `Where ${sigPrimaryArray} is the primary array/list argument` : ""}
  ${sigPrimarySize ? `Where ${sigPrimarySize} is the primary size argument` : ""}

DO NOT guess the signature. Use exactly what is specified above.

═══════════════════════════════════════════════
ADVERSARIAL — PIECE 2: optimal_ans
═══════════════════════════════════════════════

Translate the REFERENCE SOLUTION into optimal_ans(${sigArgs}).
Translation rules:
- Remove all sys.stdin / input() / next(tokens) reading
- Remove all print / sys.stdout.write
- Receive parsed testcase variables as function arguments: (${sigArgs})
- Keep ALL logic, data structures, math exactly as written
- Return the answer directly
- DO NOT simplify or rewrite the algorithm

REFERENCE SOLUTION:
<<<SOLUTION_START>>>
${problem.solution}
<<<SOLUTION_END>>>

═══════════════════════════════════════════════
ADVERSARIAL — PIECE 3: BUGGY FUNCTIONS
═══════════════════════════════════════════════

${
  buggyFunctions.length > 0
    ? `The following buggy functions were generated during approach mining.
PASTE THEM EXACTLY as written. Do not fix any bugs. Do not modify logic.
Only adjust the function to match the signature (${sigArgs}) if needed.

${buggyFunctions
  .map(
    (bf) => `# ── Buggy approach: "${bf.name}" ──
# Paste this function EXACTLY — do not fix the BUG: lines
${bf.code}
`,
  )
  .join("\n")}

BUGGY_FNS = [${buggyFunctions.map((bf) => bf.funcName).join(", ")}]`
    : `Implement each buggy function from the plan below.
Follow the pseudocode EXACTLY. Implement the wrong algorithm faithfully.
Do not accidentally fix it. Return value directly, no print.
Each buggy function must accept (${sigArgs}) as arguments.

CRITICAL: Each buggy function MUST produce DIFFERENT output than optimal_ans
on the minimal_failing_example. If you implement a buggy function and it gives
the same answer as optimal_ans, you have accidentally fixed the bug. Re-read
the pseudocode and ensure the buggy line is faithfully reproduced.

Buggy implementations:
${JSON.stringify(adversarialCase?.buggy_implementations || [], null, 2)}

BUGGY_FNS = [buggy_1, buggy_2, ...]  # one per implementation above`
}

═══════════════════════════════════════════════
ADVERSARIAL — PIECE 4: HELPERS
═══════════════════════════════════════════════

def format_case(${sigArgs}):
    """Format ONE testcase as a string. No T header. End with newline."""
    ${sig?.format_code ? `return ${sig.format_code}` : `# Implement based on INPUT FORMAT above — must match exactly`}

def get_n(${sigArgs}):
    """Return the primary size parameter."""
    return ${sigPrimarySize}

def scale_pattern(base_arr, target_n):
    """Tile/repeat base_arr to reach target_n elements, then trim."""
    if not base_arr:
        return [1] * target_n
    result = (base_arr * ((target_n // len(base_arr)) + 1))[:target_n]
    return result

═══════════════════════════════════════════════
ADVERSARIAL — PIECE 5: SEED SELF-TEST
═══════════════════════════════════════════════

SEED_RAW_INPUT = ${JSON.stringify(adversarialCase?.minimal_failing_example?.raw_input || "")}
SEED_EXPECTED  = ${JSON.stringify(adversarialCase?.minimal_failing_example?.optimal_output || "")}

# Parse SEED_RAW_INPUT into SEED_ARGS.
# The parsed args must match the signature: (${sigArgs})
# Use the input format parse_code as reference: ${sig?.parse_code || "see INPUT FORMAT"}
#
# Example parsing (adapt to this problem):
#   lines = SEED_RAW_INPUT.strip().split("\\n")
#   T_seed = int(lines[0])
#   line_idx = 1
#   # parse first testcase only
#   ${sig?.parse_code?.replace(/input\(\)/g, "lines[line_idx]; line_idx += 1") || "# adapt to input format"}
#   SEED_ARGS = (${sigArgs})

# ── Multi-level sanity check ──────────────────────────────────────
_SANITY_LEVEL = 0  # 0=broken, 1=runs-wrong-output, 2=fully-verified

try:
    _got = str(optimal_ans(*SEED_ARGS)).strip()
    _exp = str(SEED_EXPECTED).strip()
    if _got == _exp:
        _SANITY_LEVEL = 2
        print(f"[adv] sanity FULL PASS: optimal_ans={_got}", file=sys.stderr)
    else:
        _SANITY_LEVEL = 1
        print(f"[adv] sanity PARTIAL: got={_got!r} expected={_exp!r}", file=sys.stderr)
        print(f"[adv] optimal_ans runs but wrong output — will use for divergence detection", file=sys.stderr)
except Exception as _e:
    _SANITY_LEVEL = 0
    print(f"[adv] sanity CRASH: {_e}", file=sys.stderr)
    import traceback; traceback.print_exc(file=sys.stderr)

═══════════════════════════════════════════════
ADVERSARIAL — PIECE 6: COLLECTION ENGINE
═══════════════════════════════════════════════

candidates = []
start_time = time.time()
def elapsed(): return time.time() - start_time

N_BUDGET          = ${nBudget}
CANDIDATE_N_CAP   = N_BUDGET * 12
EXPLORE_TIME      = 25.0
_VMIN = ${sigVmin}
_VMAX = ${sigVmax}

def candidate_sum_n():
    return sum(c[1] for c in candidates)

def explore_ok():
    return elapsed() < EXPLORE_TIME and candidate_sum_n() < CANDIDATE_N_CAP

stats = {"calls": 0, "opt_crash": 0, "buggy_crash": 0, "mismatches": 0, "phase1_scaled": 0, "constructor_hits": 0}

def check_and_collect(phase, tag, ${sigArgs}):
    stats["calls"] += 1

    if _SANITY_LEVEL >= 1:
        # Level 2: full comparison. Level 1: divergence detection
        try:
            opt = optimal_ans(${sigArgs})
        except Exception:
            stats["opt_crash"] += 1
            return False
        found = False
        for i, buggy_fn in enumerate(BUGGY_FNS):
            try:
                buggy_out = buggy_fn(${sigArgs})
                if buggy_out != opt:
                    stats["mismatches"] += 1
                    candidates.append((format_case(${sigArgs}), get_n(${sigArgs}), phase, tag, i))
                    found = True
            except Exception:
                stats["buggy_crash"] += 1
                # Buggy crashes but optimal doesn't — valid differentiator
                candidates.append((format_case(${sigArgs}), get_n(${sigArgs}), phase, tag, i))
                found = True
        return found
    else:
        # Level 0: optimal_ans is broken — collect input anyway (constructor-based)
        candidates.append((format_case(${sigArgs}), get_n(${sigArgs}), phase, tag, 0))
        return True

═══════════════════════════════════════════════
ADVERSARIAL — PIECE 7: EXPLORATION PHASES
═══════════════════════════════════════════════

# ── Extract seed array for mutation ───────────────────────────────
_seed_arr_raw = SEED_ARGS[${sigPrimaryArrayIndex}] if len(SEED_ARGS) > ${sigPrimaryArrayIndex} and isinstance(SEED_ARGS[${sigPrimaryArrayIndex}], list) else []
_seed_values = sorted(set(_seed_arr_raw))[:6] if _seed_arr_raw else []

# ── Derive value set from seed (structurally adversarial) ─────────
if _seed_values:
    _value_set = _seed_values[:]
    for _sv in _seed_values[:4]:
        if _sv - 1 >= _VMIN: _value_set.append(_sv - 1)
        if _sv + 1 <= _VMAX: _value_set.append(_sv + 1)
    if _VMAX not in _value_set: _value_set.append(_VMAX)
    if _VMIN not in _value_set: _value_set.append(_VMIN)
    _value_set = sorted(set(_value_set))[:8]
else:
    _value_set = sorted(set([_VMIN, _VMIN + 1, 1, 2, 3, _VMAX - 1, _VMAX]))[:6]

# ── Default scalar args from seed ─────────────────────────────────
${
  sigScalars.length > 0
    ? sigScalars
        .map(
          (s) =>
            `_default_${s} = SEED_ARGS[${sig?.args_list?.indexOf(s) ?? 0}] if len(SEED_ARGS) > ${sig?.args_list?.indexOf(s) ?? 0} else 1`,
        )
        .join("\n")
    : "# No scalar args"
}

def _build_args(${sigPrimarySize}, ${sigPrimaryArray}${sigScalars.map((s) => `, ${s}=None`).join("")}):
    """Build full args tuple from primary size + array + optional scalars."""
    ${
      sigScalars.length > 0
        ? sigScalars
            .map((s) => `${s} = ${s} if ${s} is not None else _default_${s}`)
            .join("\n    ")
        : "pass"
    }
    return (${sigArgs})

# ── Time budgets (rebalanced) ─────────────────────────────────────
phase1_end = start_time + 5.0    # targeted mutation — fast
phase2_end = start_time + 20.0   # constructors + variants — highest value
phase3_end = start_time + 25.0   # random safety net

_trap_kernels = []

# ══════════════════════════════════════════════════════════════════
# PHASE 1 — TARGETED SEED MUTATION (not blind enumeration)
# ══════════════════════════════════════════════════════════════════

if _SANITY_LEVEL >= 1 and _seed_arr_raw:
    print(f"[adv] Phase 1: mutating seed (len={len(_seed_arr_raw)}, values={_seed_values[:5]})", file=sys.stderr)

    # Strategy A: Permute the seed (structural rearrangement)
    if len(_seed_arr_raw) <= 8:
        for perm in permutations(_seed_arr_raw):
            if time.time() > phase1_end: break
            _pA = list(perm)
            _args = _build_args(len(_pA), _pA)
            try:
                _opt = optimal_ans(*_args)
                for _i, _bf in enumerate(BUGGY_FNS):
                    try:
                        if _bf(*_args) != _opt:
                            _trap_kernels.append((_pA[:], _i))
                    except Exception: pass
            except Exception: pass

    # Strategy B: Single-element mutations on seed
    for _pos in range(len(_seed_arr_raw)):
        if time.time() > phase1_end: break
        for _replacement in _value_set:
            _mutated = _seed_arr_raw[:]
            _mutated[_pos] = _replacement
            _args = _build_args(len(_mutated), _mutated)
            try:
                _opt = optimal_ans(*_args)
                for _i, _bf in enumerate(BUGGY_FNS):
                    try:
                        if _bf(*_args) != _opt:
                            _trap_kernels.append((_mutated[:], _i))
                    except Exception: pass
            except Exception: pass

    # Strategy C: Length mutations (shrink/extend seed)
    for _target_n in range(max(1, len(_seed_arr_raw)-3), len(_seed_arr_raw)+6):
        if time.time() > phase1_end: break
        _resized = scale_pattern(_seed_arr_raw, _target_n)
        _args = _build_args(_target_n, _resized)
        try:
            _opt = optimal_ans(*_args)
            for _i, _bf in enumerate(BUGGY_FNS):
                try:
                    if _bf(*_args) != _opt:
                        _trap_kernels.append((_resized[:], _i))
                except Exception: pass
        except Exception: pass

    # Strategy D: Small exhaustive with SMALL value_set (3 values max, cap n=6)
    _small_vset = (_seed_values[:3] if _seed_values else [1, 2, 3])
    for _n in range(1, 7):
        if time.time() > phase1_end: break
        for _A in iproduct(_small_vset, repeat=_n):
            if time.time() > phase1_end: break
            _A = list(_A)
            _args = _build_args(_n, _A)
            try:
                _opt = optimal_ans(*_args)
                for _i, _bf in enumerate(BUGGY_FNS):
                    try:
                        if _bf(*_args) != _opt:
                            _trap_kernels.append((_A[:], _i))
                    except Exception: pass
            except Exception: pass

    # Scale every found kernel to meaningful N values
    for _base, _bidx in _trap_kernels[:20]:
        for _tn in [30, 80, 200, 500, 1000]:
            if not explore_ok(): break
            _sc = scale_pattern(_base, _tn)
            _args = _build_args(_tn, _sc)
            stats["phase1_scaled"] += 1
            check_and_collect(1, f"scaled_kernel_b{_bidx}", *_args)

elif _SANITY_LEVEL == 0 and _seed_arr_raw:
    # Sanity broken — still scale the seed pattern directly
    print("[adv] Phase 1: sanity=0, scaling seed directly", file=sys.stderr)
    for _tn in [10, 30, 80, 200, 500, 1000]:
        if not explore_ok(): break
        _sc = scale_pattern(_seed_arr_raw, _tn)
        _args = _build_args(_tn, _sc)
        check_and_collect(1, "seed_scaled_nosanity", *_args)

elif _SANITY_LEVEL >= 1 and not _seed_arr_raw:
    # No seed array but sanity works — do small exhaustive only
    print("[adv] Phase 1: no seed array, small exhaustive", file=sys.stderr)
    _small_vset = [_VMIN, 1, _VMAX]
    for _n in range(1, 7):
        if time.time() > phase1_end: break
        for _A in iproduct(_small_vset, repeat=_n):
            if time.time() > phase1_end: break
            _A = list(_A)
            _args = _build_args(_n, _A)
            try:
                _opt = optimal_ans(*_args)
                for _i, _bf in enumerate(BUGGY_FNS):
                    try:
                        if _bf(*_args) != _opt:
                            _trap_kernels.append((_A[:], _i))
                    except Exception: pass
            except Exception: pass

    for _base, _bidx in _trap_kernels[:20]:
        for _tn in [30, 80, 200, 500, 1000]:
            if not explore_ok(): break
            _sc = scale_pattern(_base, _tn)
            _args = _build_args(_tn, _sc)
            stats["phase1_scaled"] += 1
            check_and_collect(1, f"scaled_kernel_b{_bidx}", *_args)

print(f"[adv] Phase 1 done: kernels={len(_trap_kernels)} scaled={stats['phase1_scaled']} t={elapsed():.1f}s", file=sys.stderr)

# ══════════════════════════════════════════════════════════════════
# PHASE 2 — CONSTRUCTORS + VARIANTS (highest value phase)
# ══════════════════════════════════════════════════════════════════

# Eval verified constructors from approach mining
${
  constructors.length > 0
    ? constructors
        .map(
          (c, idx) => `
try:
    _constructor_${idx} = eval(${JSON.stringify(c.constructor)})
    # "${c.name}" — verified: ${c.verified_on}
except Exception as _ce:
    _constructor_${idx} = None
    print(f"[adv] constructor ${idx} failed to eval: {_ce}", file=sys.stderr)
`,
        )
        .join("")
    : "# (no constructors available)"
}

_phase2_covered_buggy = set()

if _SANITY_LEVEL >= 1:
    print("[adv] Phase 2: constructors + variants (sanity OK)", file=sys.stderr)
    while explore_ok() and time.time() < phase2_end:
        # Prioritize uncovered buggy approaches
        _uncovered = [i for i in range(len(BUGGY_FNS)) if i not in _phase2_covered_buggy]
        if not _uncovered:
            # All covered — shift to larger N for scaling confidence
            _n = random.choice([500, 1000, 2000, 5000])
        else:
            _n = random.choice([15, 30, 60, 120, 250, 500])

${
  constructors.length > 0
    ? constructors
        .map(
          (c, idx) => `
        # Constructor: "${c.name}"
        if _constructor_${idx} is not None:
            try:
                _arr_c${idx} = _constructor_${idx}(_n, _VMAX)
                if isinstance(_arr_c${idx}, list) and len(_arr_c${idx}) > 0:
                    # Trim or extend to match _n
                    if len(_arr_c${idx}) != _n:
                        _arr_c${idx} = scale_pattern(_arr_c${idx}, _n)
                    _args_c = _build_args(_n, _arr_c${idx})
                    if check_and_collect(2, ${JSON.stringify(c.name)}, *_args_c):
                        stats["constructor_hits"] += 1
                        for item in candidates[-5:]:
                            _phase2_covered_buggy.add(item[4])
            except Exception:
                pass
`,
        )
        .join("")
    : ""
}

        # Scaled trap kernels from Phase 1
        if _trap_kernels:
            _base_k, _bidx = random.choice(_trap_kernels)
            _sc_k = scale_pattern(_base_k, _n)
            _args_k = _build_args(_n, _sc_k)
            if check_and_collect(2, f"kernel_variant_b{_bidx}", *_args_k):
                _phase2_covered_buggy.add(_bidx)

        # Shuffled kernel — same values, different order
        if _trap_kernels:
            _base_k2, _ = random.choice(_trap_kernels)
            _sc_k2 = scale_pattern(_base_k2, _n)
            random.shuffle(_sc_k2)
            _args_k2 = _build_args(_n, _sc_k2)
            check_and_collect(2, "shuffled_kernel", *_args_k2)

        # TIE-HEAVY: restrict to few distinct values
        _arr_tie = [random.choice(_value_set[:3]) for _ in range(_n)]
        _args_tie = _build_args(_n, _arr_tie)
        check_and_collect(2, "tie_heavy", *_args_tie)

        # BOUNDARY CLUSTER: values only near min/max
        _boundary_vals = [_VMIN, _VMIN + 1, _VMAX - 1, _VMAX]
        _arr_bnd = [random.choice(_boundary_vals) for _ in range(_n)]
        _args_bnd = _build_args(_n, _arr_bnd)
        check_and_collect(2, "boundary_cluster", *_args_bnd)

        # MONOTONIC ascending
        _arr_asc = sorted([random.randint(_VMIN, _VMAX) for _ in range(_n)])
        _args_asc = _build_args(_n, _arr_asc)
        check_and_collect(2, "sorted_asc", *_args_asc)

        # MONOTONIC descending
        _arr_desc = sorted([random.randint(_VMIN, _VMAX) for _ in range(_n)], reverse=True)
        _args_desc = _build_args(_n, _arr_desc)
        check_and_collect(2, "sorted_desc", *_args_desc)

        # ALL SAME value
        _same_val = random.choice(_value_set)
        _arr_same = [_same_val] * _n
        _args_same = _build_args(_n, _arr_same)
        check_and_collect(2, "all_same", *_args_same)

elif _SANITY_LEVEL == 0:
    print("[adv] Phase 2: sanity=0, constructors only", file=sys.stderr)
    while explore_ok() and time.time() < phase2_end:
        _n = random.choice([30, 60, 120, 250, 500])
        _fb_arr = None

${
  constructors.length > 0
    ? constructors
        .map(
          (c, idx) => `
        if _fb_arr is None and _constructor_${idx} is not None:
            try:
                _fb_arr = _constructor_${idx}(_n, _VMAX)
                if isinstance(_fb_arr, list) and len(_fb_arr) > 0:
                    if len(_fb_arr) != _n:
                        _fb_arr = scale_pattern(_fb_arr, _n)
                    _args_fb = _build_args(_n, _fb_arr)
                    check_and_collect(2, ${JSON.stringify(c.name + "_nosanity")}, *_args_fb)
                    stats["constructor_hits"] += 1
                    _fb_arr = None  # reset for next iteration
                else:
                    _fb_arr = None
            except Exception:
                _fb_arr = None
`,
        )
        .join("")
    : ""
}

        if _fb_arr is None:
            # No constructor worked — generate structurally varied inputs
            _pattern_choice = random.randint(0, 4)
            if _pattern_choice == 0:
                _fb_arr = [_VMAX if i % 2 == 0 else _VMIN for i in range(_n)]
            elif _pattern_choice == 1:
                _fb_arr = sorted([random.randint(_VMIN, _VMAX) for _ in range(_n)], reverse=True)
            elif _pattern_choice == 2:
                _fb_arr = [random.choice(_value_set) for _ in range(_n)]
            elif _pattern_choice == 3:
                _fb_arr = [_VMAX] * _n
            else:
                _fb_arr = [_VMIN] * (_n // 2) + [_VMAX] * (_n - _n // 2)
            _args_fb = _build_args(_n, _fb_arr)
            check_and_collect(2, "structural_nosanity", *_args_fb)
            _fb_arr = None  # reset

print(f"[adv] Phase 2 done: covered_buggy={_phase2_covered_buggy} constructor_hits={stats['constructor_hits']} t={elapsed():.1f}s", file=sys.stderr)

# ══════════════════════════════════════════════════════════════════
# PHASE 3 — RANDOM SAFETY NET
# ══════════════════════════════════════════════════════════════════

if _SANITY_LEVEL >= 1:
    print("[adv] Phase 3: random exploration", file=sys.stderr)
    while explore_ok() and time.time() < phase3_end:
        _n = random.randint(1, min(500, ${sigNmax}))
        _arr = [random.randint(_VMIN, _VMAX) for _ in range(_n)]
        _args_r = _build_args(_n, _arr)
        check_and_collect(3, "random", *_args_r)

print(f"[adv] Phase 3 done: total_candidates={len(candidates)} t={elapsed():.1f}s", file=sys.stderr)

═══════════════════════════════════════════════
ADVERSARIAL — PIECE 8: SELECTION (diversity-first, N-budget-aware)
═══════════════════════════════════════════════

MAX_OUTPUT = 150

# Deduplicate
seen_hashes = set()
unique_candidates = []
for case_str, n, phase, tag, buggy_idx in candidates:
    h = hashlib.md5(case_str.encode()).hexdigest()
    if h not in seen_hashes:
        seen_hashes.add(h)
        unique_candidates.append((case_str, n, phase, tag, buggy_idx))

# Sort: phase 1 (scaled kernels) first, then 2 (constructors), then 3 (random)
# Within each phase: LARGER N first — meaningful cases over trivial
unique_candidates.sort(key=lambda x: (x[2], -x[1]))

# Round-robin selection across buggy functions for coverage diversity
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

═══════════════════════════════════════════════
ADVERSARIAL — PIECE 9: FALLBACK (always produces output)
═══════════════════════════════════════════════

if not final_cases:
    print("[adv] WARNING: no candidates — using constructor + structural fallback", file=sys.stderr)
    _fallback_sum_n = 0
    _fallback_cases = []

    for _fb_iter in range(min(N_BUDGET // 50, 200)):
        _fb_n = random.choice([10, 30, 50, 100, 200])
        if _fallback_sum_n + _fb_n > N_BUDGET:
            break

        _fb_arr = None

${
  constructors.length > 0
    ? constructors
        .map(
          (c, idx) => `
        if _fb_arr is None and _constructor_${idx} is not None:
            try:
                _fb_arr = _constructor_${idx}(_fb_n, _VMAX)
                if not isinstance(_fb_arr, list) or len(_fb_arr) == 0:
                    _fb_arr = None
                elif len(_fb_arr) != _fb_n:
                    _fb_arr = scale_pattern(_fb_arr, _fb_n)
            except Exception:
                _fb_arr = None
`,
        )
        .join("")
    : ""
}

        if _fb_arr is None:
            # Structural fallback patterns
            _pattern_idx = _fb_iter % 5
            if _pattern_idx == 0:
                _fb_arr = [_VMAX if i % 2 == 0 else _VMIN for i in range(_fb_n)]
            elif _pattern_idx == 1:
                _fb_arr = sorted([random.randint(_VMIN, _VMAX) for _ in range(_fb_n)], reverse=True)
            elif _pattern_idx == 2:
                _fb_arr = [_VMAX] * _fb_n
            elif _pattern_idx == 3:
                _fb_arr = [random.choice(_value_set) for _ in range(_fb_n)]
            else:
                _fb_arr = [_VMIN] * (_fb_n // 2) + [_VMAX] * (_fb_n - _fb_n // 2)

        _fb_args = _build_args(_fb_n, _fb_arr)
        _fallback_cases.append(format_case(*_fb_args))
        _fallback_sum_n += _fb_n

    if _fallback_cases:
        final_cases = _fallback_cases
        sum_n_final = _fallback_sum_n

═══════════════════════════════════════════════
ADVERSARIAL — PIECE 10: WRITE OUTPUT
═══════════════════════════════════════════════

os.makedirs("input", exist_ok=True)
T_out = len(final_cases)
with open("${adversarialCase?.file || "input/input04.txt"}", "w") as f:
    f.write(f"{T_out}\\n")
    for case_body in final_cases:
        f.write(case_body)
        if not case_body.endswith("\\n"):
            f.write("\\n")

print(
    f"[adv] FINAL: sanity={_SANITY_LEVEL} "
    f"explored={stats['calls']} opt_crash={stats['opt_crash']} "
    f"buggy_crash={stats['buggy_crash']} mismatches={stats['mismatches']} "
    f"kernels={len(_trap_kernels)} scaled={stats['phase1_scaled']} "
    f"constructor_hits={stats['constructor_hits']} "
    f"unique={len(unique_candidates)} written={T_out} "
    f"sum_n={sum_n_final}/{N_BUDGET} t={elapsed():.1f}s",
    file=sys.stderr
)
`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EXECUTION BLOCK
  // ═══════════════════════════════════════════════════════════════════════

  prompt += `
═══════════════════════════════════════════════
MANDATORY EXECUTION BLOCK
═══════════════════════════════════════════════

if __name__ == "__main__":
${functionCalls}

Return ONLY Python code. No JSON. No markdown fences. No triple backticks anywhere.
First line must be: import random
`;

  return prompt;
}

module.exports = buildInputCodePrompt;
