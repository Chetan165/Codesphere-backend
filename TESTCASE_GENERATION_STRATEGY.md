# AutoCraft Testcase Generation Strategy

## Overview

The AutoCraft system currently lacks a **systematic approach** to guide the LLM in generating problem-specific, adversarial testcases. This document outlines:
1. What's currently being done (weak)
2. What should be done (proposed)
3. How HackerRank-style constraints work
4. How to leverage `adversarial_patterns.json`

## Complete AutoCraft Step-by-Step Flow

### Step 1: User Submits Problem Parameters
```
POST /genai/problem
{
  "tags": ["array", "sorting"],
  "difficulty": "medium",
  "expectedComplexity": "O(n log n)",
  "solution": "def solve(arr): return sorted(arr)",
  "questionStyle": "General"
}
```

### Step 2: API Creates Session Directory
- Generate unique `sessionId` (UUID v4)
- Create directory: `uploads/{sessionId}/`
- Save input parameters to `uploads/{sessionId}/input.json`

### Step 3: Gemini API Generates Problem Statement
- Build comprehensive prompt with tags, difficulty, complexity, solution
- Call Gemini 2.5 Flash model
- Receive JSON response with:
  - `problemStatement`: Full problem description
  - `inputFormat`: How input should be structured
  - `outputFormat`: Expected output format
  - `constraints`: T and N limits
  - `sampleInput` & `sampleOutput`: Example testcase
  - `solution`: Reference solution code

### Step 4: Save Problem Response
- Parse and repair JSON (if needed)
- Save to `uploads/{sessionId}/genai_response.json`
- Return sessionId to client

### Step 5: User Submits Testcase Generation Request
```
POST /genai/testcaseGeneration
{
  "sessionId": "abc123...",
  "numTestcases": 4,
  "testcaseTypes": ["sample", "edge", "large", "generic"],
  "expectedComplexity": "O(n log n)"
}
```

### Step 6: Load Problem Context
- Read `uploads/{sessionId}/genai_response.json`
- Extract: problemStatement, constraints, inputFormat, solution

### Step 7: Gemini API Generates Test Code (WEAK POINT)
- Build prompt with testcase types
- Request two Python scripts:
  - `inputGenCode.py`: Functions to generate each testcase type
  - `outputGenCode.py`: Execute solution on inputs
- **Current issue**: No adversarial pattern guidance
- **Should include**: Complexity limits, pattern lookup, problem-specific weaknesses

### Step 8: Save Generated Code
- Parse Python code responses
- Save `inputGenCode.py` to `uploads/{sessionId}/`
- Save `outputGenCode.py` to `uploads/{sessionId}/`

### Step 9: Submit Job to CEEngine
```
POST /routeCE/pipeline/:id
{
  "jobid": "{sessionId}",
  "inputCode": "# content of inputGenCode.py",
  "outputCode": "# content of outputGenCode.py",
  "MetaData": {
    "genaiResponse": { ... }  // All problem data
  }
}
```

### Step 10: CEEngine Inserts Job into Queue
- Receive job at `/CEPipeline` endpoint
- Insert into SQLite `jobs` table with `status='queued'`

### Step 11: Worker Process Polls Queue (Every 5 Seconds)
```
while (true) {
  SELECT * FROM jobs WHERE status='queued' LIMIT 1
  if job found → claim it, set status='running'
  else → wait 5 seconds
}
```

### Step 12: Create Working Directory
- Create folder: `{sessionId}/`
- This is temporary working directory for job execution

### Step 13: Execute Input Generation Code in Docker
- Write `inputGenCode.py` to `{sessionId}/inputCode.py`
- Run in Docker container: `docker run -v {sessionId}:/workspace python:3.11-slim python inputCode.py`
- **Functions called**:
  - `generate_input00()`: Creates `input/input00.txt` (sample)
  - `generate_input01()`: Creates `input/input01.txt` (edge)
  - `generate_input02()`: Creates `input/input02.txt` (large)
  - `generate_input03()`: Creates `input/input03.txt` (generic)
- **Output**: `{sessionId}/input/input00.txt`, `input01.txt`, etc.

### Step 14: Execute Output Generation Code in Docker
- Write `outputGenCode.py` to `{sessionId}/outputCode.py`
- Run in Docker: `docker run -v {sessionId}:/workspace python:3.11-slim python outputCode.py`
- **Process**:
  1. Read `input/input00.txt`, `input01.txt`, ...
  2. For each input file:
     - Parse T (number of testcases)
     - For each testcase, parse N and input data
     - Execute solution function
     - Write output to corresponding `output/outputXX.txt`
- **Output**: `{sessionId}/output/output00.txt`, `output01.txt`, etc.

### Step 15: Generate Problem Markdown
- Read metadata from job
- Create formatted markdown with:
  - Problem statement
  - Input/output formats
  - Constraints
  - Sample input/output
  - Reference solution
- Write to `{sessionId}/problem.md`

### Step 16: Create Testcase Archive
- Copy `input/` directory to `{sessionId}/Testcases/input/`
- Copy `output/` directory to `{sessionId}/Testcases/output/`
- Zip: `{sessionId}/Testcases.zip` (contains input & output folders)

### Step 17: Create Full Job Archive
- Zip entire `{sessionId}/` directory to `{sessionId}.zip`
- Contains: problem.md, inputCode.py, outputCode.py, input/, output/, Testcases.zip

### Step 18: Update Job Status
- `UPDATE jobs SET status='completed' WHERE jobid='{sessionId}'`

### Step 19: Cleanup Temporary Directory
- Delete temporary folder: `{sessionId}/`
- Keep only `{sessionId}.zip` for download

### Step 20: User Downloads Results
```
GET /Download/{sessionId}
```
- CEEngine streams `{sessionId}.zip` file
- User receives complete problem package

### Step 21: User Gets Final Deliverables
Contains:
```
{sessionId}.zip
  ├── problem.md              (Problem description + constraints + solution)
  ├── inputCode.py            (Code that generated inputs)
  ├── outputCode.py           (Code that generated outputs)
  ├── input/
  │   ├── input00.txt         (Sample testcase input)
  │   ├── input01.txt         (Edge case input)
  │   ├── input02.txt         (Large case input)
  │   └── input03.txt         (Generic testcase input)
  ├── output/
  │   ├── output00.txt        (Sample expected output)
  │   ├── output01.txt        (Edge case expected output)
  │   ├── output02.txt        (Large case expected output)
  │   └── output03.txt        (Generic expected output)
  └── Testcases.zip           (Just input/ and output/)
```

---

## Current Implementation (Limitations)

### What the LLM Gets Now

```javascript
// In genAITestcases endpoint
const prompt = `
For "sample": generate sample input/output
For "edge": generate boundary conditions
For "large": generate large data with max constraints
For "generic": generate random valid data
`
```

**Problem**: 
- Generic instructions with no problem-specific context
- No knowledge of common pitfalls for this problem type
- No guidance on what makes a "good" large testcase
- Large testcase just uses max N and T, doesn't structure data to break suboptimal solutions

### Generated Code Quality

```python
# Current approach - just maximize constraints
def generate_input02():  # "Large" case
    # Simply uses maximum T and N
    with open("input/input02.txt", "w") as f:
        f.write("100\n")  # Max T
        for t in range(100):
            f.write(f"{100000}\n")  # Max N
            f.write(" ".join(str(random.randint(1, 10**9)) for _ in range(100000)))
    # ❌ Random data doesn't exploit typical weaknesses
    # ❌ Doesn't target O(n²) solutions specifically
```

---

## What Should Be Done (Proposed)

### 1. Leverage adversarial_patterns.json

The project **already has** `metadata/adversarial_patterns.json` with ideal testcase patterns for each problem type:

```json
{
  "Array": {
    "pitfall": "Naive nested loops or sorting-based approaches",
    "patterns": [
      "Strictly increasing [1...N]",
      "Strictly decreasing [N...1]",
      "The 'V-Shape' [N, N-2...1...N-1]",
      "Alternating Max/Min [1, 10^9, 2, 10^9-1]"
    ]
  },
  "Sorting": {
    "pitfall": "Poor pivot choice in QuickSort (O(N^2))",
    "patterns": [
      "Median-of-three killer sequences",
      "Already sorted/Reverse sorted arrays",
      "Arrays with all identical elements"
    ]
  },
  "Graph": {
    "pitfall": "Deep recursion or O(V^2) adjacency scans",
    "patterns": [
      "The 'Bamboo' (Line graph) for recursion depth",
      "Complete Graph (K_N) for edge density"
    ]
  }
  // ... 25+ problem types with pitfalls
}
```

### 2. Complexity-Based Input Constraints (HackerRank Model)

Different complexities require different data size limits to ensure:
- Optimal solutions **pass within 2 seconds**
- Brute-force/suboptimal solutions **TLE (Time Limit Exceeded)**

#### Constraint Table

| Complexity | Sum of N (all T) | Rationale | Example |
|-----------|------------------|-----------|---------|
| **O(1)** | Up to 10^6 | Constant per element | `T=100, N=10^4` |
| **O(log N)** | Up to 10^6 | Binary search level | `T=100, N=10^5` |
| **O(N)** | Up to 10^6 | Linear scan | `T=100, N=10^5` total |
| **O(N log N)** | Up to 10^6 | Sorting/optimal search | `T=100, N=10^5` total |
| **O(√N)** | Up to 10^8 | Square root decomposition | `T=1000, N=10^5` |
| **O(N²)** | Up to 10^4-10^5 | Nested loops (risky) | `T=10, N=10^3` or `T=100, N=1000` |
| **O(N³)** | Up to 500 | Triple nested loops | `T=1, N=500` |
| **O(2^N)** | N ≤ 20 | Exponential/backtracking | `T=1, N=20` |
| **O(N!)** | N ≤ 10 | Permutations | `T=1, N=10` |

**Why This Matters**:
```
If O(N log N) optimal solution is expected:
- Modern CPU does ~10^8-10^9 operations/second
- N log N for N=10^5: ~10^5 × 17 ≈ 1.7M operations
- With T=100: 170M operations → ~0.2 seconds ✅
- Brute force O(N³): 10^15 operations → would TLE ❌

If O(N²) solution is expected:
- N² for N=10^3: 10^6 operations
- With T=100: 10^8 operations → ~0.1 seconds ✅
- Full exploration O(2^N): would TLE immediately ❌
```

---

## HackerRank Input Format Pattern

### Standard Format (What AutoCraft Should Generate)

```
T
[For each testcase]
  n (or relevant size parameter)
  [Input data as per problem format]
```

### Example: Array Problem

```
Input File: input00.txt (Sample)
3              <- T (3 testcases)
3              <- n for testcase 1
1 2 3
4              <- n for testcase 2
4 3 2 1
5              <- n for testcase 3
2 1 5 3 4

Output File: output00.txt
1 2 3          <- output for testcase 1
1 2 3 4        <- output for testcase 2
1 2 3 4 5      <- output for testcase 3
```

### Constraint Enforcement

**Per-File Constraint**:
```
Sum of all N values across all T in ONE file ≤ Limit

✅ Valid for O(N) with limit 10^6:
   T=100, testcase sizes: [100, 200, 300, ..., 10000]
   Sum = 100×10000 = 10^6 ✅

❌ Invalid for O(N) with limit 10^6:
   T=100, all testcase sizes = 10000
   Sum = 100×10000 = 10^6... but each file can't multiply!
   
Correct calculation per FILE:
   File has multiple independent testcases
   Sum(all n in single file) must be <= limit
```

---

## Current vs Proposed: Details

### Current Flow (Weak)

```
Problem Type: "Array Sorting"
LLM Receives:
  - problemStatement (generic)
  - inputFormat
  - outputFormat
  - constraints
  - expectedComplexity: "O(n log n)"

LLM Generates:
  ❌ No knowledge of:
     - What breaks O(N²) solutions (already sorted? V-shape? reverse?)
     - How to structure data to maximize operations
     - Specific edge cases for sorting (duplicates, all-equal, etc.)
     - Constraint limits per complexity
  
Output Generated Code:
  - generate_input02() just:
    - Picks T_MAX and N_MAX
    - Fills with random numbers
    - Hope it causes TLE...
```

### Proposed Flow (Strong)

```
Problem Type: "Array Sorting"
Extract from adversarial_patterns.json:
  {
    "pitfall": "Poor pivot choice in QuickSort (O(N^2))",
    "patterns": [
      "Median-of-three killer sequences",
      "Already sorted/Reverse sorted arrays",
      "Arrays with all identical elements"
    ]
  }

Calculate Complexity-Based Limits:
  "O(n log n)" → Sum of N limit = 10^6
  
Enhanced LLM Prompt:
  ---
  Problem: Sorting array
  Expected Complexity: O(n log n)
  
  For EDGE cases, include:
  - Already sorted array [1,2,3,4,...]
  - Reverse sorted [n, n-1, ..., 1]
  - All identical elements [5, 5, 5, ...]
  - Duplicates with few unique values
  
  For LARGE case (to break O(n²) solutions):
  - Use pattern: "Median-of-three killer sequence"
  - This breaks naive QuickSort implementations
  - Set T and N such that sum(all N) ≤ 10^6
  - Example: T=10, N=100000 (sum=10^6)
  
  Constraint Format (HackerRank style):
  - First line: T (number of testcases)
  - For each testcase: N, then N integers
  - All files separate (input00.txt, input01.txt, ...)
  ---

LLM Generates:
  ✅ Targeted patterns based on problem type
  ✅ Data specifically designs to exploit weaknesses
  ✅ Complexity-aware constraint sizing
  ✅ Proper HackerRank format with T, N, data

Output Generated Code:
  - generate_input02() for "large":
    def generate_input02():
      # Median-of-three killer (breaks QuickSort)
      arr = [create killer sequence]
      with open("input/input02.txt", "w") as f:
          f.write(f"10\n")  # T calculated for sum≤10^6
          for _ in range(10):
              f.write(f"{100000}\n")
              f.write(" ".join(map(str, arr)) + "\n")
      # ✅ Targets specific weakness
      # ✅ O(n log n) passes, O(n²) TLEs
```

---

## Implementation Strategy

### Phase 1: Enhance LLM Prompt (LOW EFFORT)

Modify `ProblemAutomationController.genAITestcases()`:

```javascript
const prompt = `
Given competitive programming problem:
${problemStatement}

Expected Complexity: ${expectedComplexity}

CRITICAL INSTRUCTIONS FOR TESTCASE GENERATION:

1. INPUT FORMAT (HackerRank style):
   - First line: T (number of testcases)
   - For each testcase: size parameter (N/M/etc), then input data
   - Save to input/input{XX}.txt
   - All testcases in ONE FILE share total size limit

2. CONSTRAINT LIMITS based on complexity:
   - O(n): sum of all N ≤ 10^6
   - O(n log n): sum of all N ≤ 10^6
   - O(n²): sum of all N ≤ 10^4
   - O(n³): sum of all N ≤ 500
   - O(2^n): N ≤ 20
   
   "Sum of all N" means: if T=10 testcases each with n1, n2,...n10,
   then sum = n1+n2+...+n10 must not exceed limit. This is PER INPUT FILE.

3. For EDGE cases, target these specific weaknesses:
   [Insert problem-specific patterns from adversarial_patterns.json]
   
   Example for Arrays:
   - Strictly increasing [1,2,3,...,N]
   - Strictly decreasing [N, N-1, ..., 1]
   - V-Shape [N, N-2, ..., 1, N-1]
   - All identical elements
   
   Example for Sorting:
   - Already sorted array
   - Reverse sorted array
   - Median-of-three killer sequences
   
   Example for Graph:
   - Line graph (bamboo) for max recursion depth
   - Complete graph for edge density
   - Star graph for degree bottlenecks

4. For LARGE case:
   Design data to TLE any solution worse than optimal.
   Use adversarial patterns, not random data.
   Maximize sum(N) allowed by the complexity limit.
   
   Example for O(n log n) sorting:
   - T=10, each testcase N=100000 (sum=10^6)
   - Use "median-of-three killer" pattern
   - O(n²) naive sort -> TLE
   - O(n log n) optimal -> Pass in ~0.2s
   
5. For SAMPLE case:
   Use exact sample input/output provided: ${sampleInput} / ${sampleOutput}

Return Python code with:
- generate_input00(): Sample (use provided data)
- generate_input01(): Edge case
- generate_input02(): Large case (with adversarial pattern)
- generate_input03(): Generic random case (within limits)
`
```

### Phase 2: Create LLM Instruction System (MEDIUM EFFORT)

Create `metadata/testcase_generation_guide.json`:

```json
{
  "complexity_limits": {
    "O(1)": { "sum_limit": 1000000, "description": "Constant per element" },
    "O(log N)": { "sum_limit": 1000000, "description": "Binary search" },
    "O(N)": { "sum_limit": 1000000, "description": "Linear scan" },
    "O(N log N)": { "sum_limit": 1000000, "description": "Optimal sorting" },
    "O(√N)": { "sum_limit": 100000000, "description": "Square root decomposition" },
    "O(N²)": { "sum_limit": 10000, "description": "Nested loops" },
    "O(N³)": { "sum_limit": 500, "description": "Triple nested" },
    "O(2^N)": { "n_limit": 20, "description": "Exponential/Backtracking" }
  },
  "pattern_mapping": {
    "Array": ["Strictly increasing", "V-Shape", "Alternating", "Random permutation"],
    "Sorting": ["Already sorted", "Reverse sorted", "Killer sequence", "Duplicates"],
    "Graph": ["Line graph (Bamboo)", "Complete graph", "Star graph", "Bipartite"],
    "String": ["Long prefix", "Fibonacci string", "Thue-Morse sequence"],
    "Stack": ["Sawtooth pattern", "Monotonic increasing"],
    "Heap": ["Sorted data", "Reverse sorted data", "Random data"],
    "DP": ["Prime-weighted", "Knapsack worst-case", "All identical"],
    "Math": ["Large primes", "Highly composite", "Twin primes"],
    "Greedy": ["Counter-examples", "Interdependent costs"]
  },
  "format_style": "hackerrank",
  "format_description": "T on first line, then for each testcase: size param, then data"
}
```

### Phase 3: Link Pattern Selection (MEDIUM EFFORT)

Modify endpoint to accept or auto-select problem tags:

```javascript
// In genAITestcases
const problemTags = problemData.tags;  // ["array", "sorting"]
const adversarialPatterns = require('../metadata/adversarial_patterns.json');
const testcaseGuide = require('../metadata/testcase_generation_guide.json');

// Find matching pattern
let selectedPattern = null;
for (const tag of problemTags) {
  const patternKey = tag.charAt(0).toUpperCase() + tag.slice(1);
  if (adversarialPatterns[patternKey]) {
    selectedPattern = adversarialPatterns[patternKey];
    break;
  }
}

// Inject into prompt
const complexityLimit = testcaseGuide.complexity_limits[expectedComplexity];
```

---

## Example: Before and After

### BEFORE (Current)

**Problem**: Sort an array

**LLM Prompt**:
```
For "large": generate large data with max N
```

**Generated Code**:
```python
def generate_input02():
    with open("input/input02.txt", "w") as f:
        f.write("100\n")
        for t in range(100):
            f.write("100000\n")
            f.write(" ".join(str(random.randint(1, 10**9)) for _ in range(100000)))
            # Random data - doesn't target any weakness
```

**Result**: Brute-force O(n²) might still pass because random data isn't adversarial.

---

### AFTER (Proposed)

**Problem**: Sort an array, tags: ["array", "sorting"], complexity: O(n log n)

**LLM Prompt**:
```
Expected Complexity: O(n log n)
Constraint Limit: sum of N ≤ 10^6

For EDGE cases, include:
- Already sorted array [1,2,3,...]
- Reverse sorted [n, n-1, ...]
- Duplicates [5, 5, 5, ...]
- Median-of-three killer sequence

For LARGE case: Use "Median-of-three killer" pattern to TLE O(n²) solutions
```

**Generated Code**:
```python
def generate_input02():
    # Median-of-three killer for QuickSort
    # Specifically designed to TLE O(n²) solutions
    arr = create_killer_sequence(100000)
    
    with open("input/input02.txt", "w") as f:
        f.write("10\n")  # T=10
        for t in range(10):
            f.write("100000\n")  # sum = 10*100000 = 10^6 ✅
            f.write(" ".join(map(str, arr)) + "\n")
            
def create_killer_sequence(n):
    # Median-of-three killer breaks naive QuickSort
    # Creates O(n²) behavior in standard implementations
    arr = list(range(n))
    # Rearrange to maximize comparisons
    killer = []
    lo, hi = 0, n - 1
    while lo <= hi:
        killer.append(arr[lo])
        lo += 1
        if lo <= hi:
            killer.append(arr[hi])
            hi -= 1
    return killer
```

**Result**: O(n log n) passes (~0.2s), O(n²) TLEs (~15s+).

---

## Summary: What to Implement

| Aspect | Current | Should Be |
|--------|---------|-----------|
| **Testcase Guidance** | Generic text | Leverage `adversarial_patterns.json` |
| **Large Case Design** | Random max data | Problem-specific adversarial patterns |
| **Constraint Limits** | Always max | Based on expected complexity |
| **Input Format** | Generic | HackerRank: T, then n, data |
| **Edge Cases** | Generic boundary | Problem-specific weakness patterns |
| **TLE Assurance** | Hope for best | Designed to break suboptimal solutions |

**Implementation Priority**:
1. **Quick Win**: Enhance LLM prompt with complexity limits (1-2 hours)
2. **Medium**: Create testcase_generation_guide.json (2-3 hours)
3. **Full**: Link adversarial_patterns.json to pattern selection (3-4 hours)

---

## Key Insight

The missing piece is **systematic guidance** to the LLM:

```
Current: "Generate large test, use max N"
Proposed: "Generate large test that causes O(n²) to TLE using [specific pattern]
           with sum(N) = 10^6 so O(n log n) passes in 0.2s"
```

This transforms testcase generation from **random chance** to **deliberate design**.
