// buildSolutionGuidance.js
// Injects algorithm-specific correctness guidance into the solution generation prompt.
// Covers all supported tags. Add new entries as new tag types are introduced.

function buildSolutionGuidance(tags, complexity) {
  const guidance = [];

  // ── ARRAY ────────────────────────────────────────────────────────────
  if (tags.some((t) => ["Array"].includes(t))) {
    guidance.push(`
ARRAY GUIDANCE:
- For Dutch National Flag (3-way partition on 0,1,2):
    low=0, mid=0, high=N-1
    while mid <= high:
      if nums[mid]==0: swap(low,mid), low++, mid++
      elif nums[mid]==1: mid++
      else: swap(mid,high), high--   # DO NOT increment mid here
  Common bug: incrementing mid after swapping with high causes index skip.
- For in-place operations: verify you are not reading a value after it has been overwritten.
- Trace through: [0], [2,1,0], [0,0,0], [2,2,2], [1,1,1] before submitting.`);
  }

  // ── SORTING ──────────────────────────────────────────────────────────
  if (tags.some((t) => ["Sorting"].includes(t))) {
    guidance.push(`
SORTING GUIDANCE:
- Do NOT use Python's built-in sort() or sorted() if the problem forbids it.
- If implementing QuickSort: handle duplicates with three-way partition to avoid O(n²) on equal elements.
- If implementing MergeSort: ensure merge step handles subarrays of length 1 and 0.
- For counting sort (values 0,1,2 only): count occurrences then reconstruct — O(n), no pointer bugs.
- Common QuickSort bug: using first/last element as pivot on sorted input → O(n²).
- Trace through: already sorted, reverse sorted, all identical, single element.`);
  }

  // ── STRING ───────────────────────────────────────────────────────────
  if (tags.some((t) => ["String"].includes(t))) {
    guidance.push(`
STRING GUIDANCE:
- String indexing: always verify s[i] is not accessed when i == len(s).
- For pattern matching without KMP: handle pattern longer than text as an early exit.
- For KMP: the failure function (lps array) must be built correctly.
    lps[0] = 0 always. Use two pointers, not nested loops.
- For hashing strings: use a large prime modulus (10^9+7) and handle negative mod.
- Common bug: advancing by len(pattern) instead of 1 after a match (misses overlapping matches).
- Trace through: empty string, pattern == text, pattern not found, fully overlapping matches.`);
  }

  // ── STACK ────────────────────────────────────────────────────────────
  if (tags.some((t) => ["Stack"].includes(t))) {
    guidance.push(`
STACK GUIDANCE:
- Always check if stack is empty before calling pop() or peek/stack[-1].
- For balanced parentheses: push on open, pop and verify match on close.
  If stack is non-empty at end → unbalanced.
- For monotonic stack: be explicit about strict vs non-strict comparison.
  "next greater" uses strict >, "next greater or equal" uses >=.
- Common bug: not handling the case where no answer exists for an element
  (elements still in stack at end have no next greater → answer is -1).
- Trace through: empty input, all same elements, strictly increasing, strictly decreasing.`);
  }

  // ── QUEUE ────────────────────────────────────────────────────────────
  if (tags.some((t) => ["Queue"].includes(t))) {
    guidance.push(`
QUEUE GUIDANCE:
- Use collections.deque, not a list with pop(0) — list pop(0) is O(n).
- For BFS: mark nodes as visited WHEN ENQUEUED, not when dequeued.
  Marking on dequeue causes the same node to be enqueued multiple times.
- For sliding window maximum (deque-based): maintain indices not values.
  Remove indices from front when out of window, from back when smaller than current.
- Common bug: forgetting to clear the queue between multiple testcases.
- Trace through: single element queue, queue with all identical values.`);
  }

  // ── HEAP / PRIORITY QUEUE ────────────────────────────────────────────
  if (tags.some((t) => ["Heap"].includes(t))) {
    guidance.push(`
HEAP GUIDANCE:
- Python's heapq is a MIN-heap. For max-heap: push negative values (-val).
- heapq.heappush and heapq.heappop are the only safe operations.
  Do NOT index into the heap array directly.
- For k-th largest: maintain a min-heap of size k. If heap size > k, pop.
  At end, heap[0] is the k-th largest.
- Common bug: using sorted() for each extraction → O(n² log n) instead of O(n log n).
- Common bug: forgetting to negate values back when using max-heap simulation.
- Trace through: empty heap, single element, all identical elements, heap of size 1 then extract.`);
  }

  // ── DYNAMIC PROGRAMMING ──────────────────────────────────────────────
  if (tags.some((t) => ["Dynamic Programming"].includes(t))) {
    guidance.push(`
DYNAMIC PROGRAMMING GUIDANCE:
- Define dp[i] precisely before writing any code. Write the recurrence in comments first.
- Initialize dp array to a sentinel value (float('inf') or -1 or 0) based on what makes sense.
- Base case must be set before the loop, not inside it.
- For 2D DP: be explicit about row-major vs column-major iteration order.
- Common bug: dp[i] depends on dp[i] itself (circular dependency) — check transition direction.
- Common bug: forgetting to handle the "no valid answer" case — return -1 or 0 explicitly.
- Common bug: off-by-one in dp array size — if 1-indexed, allocate N+1 slots.
- Trace through: N=0, N=1, all identical values, case where answer is 0 or impossible.`);
  }

  // ── GRAPH ────────────────────────────────────────────────────────────
  if (tags.some((t) => ["Graph"].includes(t))) {
    guidance.push(`
GRAPH GUIDANCE:
- Use iterative BFS/DFS — Python's default recursion limit is 1000.
  Recursive DFS crashes on bamboo/line graphs with N > 1000.
- Build adjacency LIST (dict or list of lists), not adjacency matrix.
  Matrix is O(V²) memory and O(V²) traversal time.
- Always handle disconnected graphs: iterate all nodes, call BFS/DFS on unvisited ones.
- Mark visited WHEN ENQUEUING in BFS, not when processing.
- For weighted graphs: use Dijkstra with heapq, not BFS.
- Common bug: 0-indexed vs 1-indexed node confusion — be consistent throughout.
- Common bug: not resetting visited array between testcases.
- Trace through: single node, disconnected components, self-loop, all nodes connected to one.`);
  }

  // ── MATH ─────────────────────────────────────────────────────────────
  if (tags.some((t) => ["Math"].includes(t))) {
    guidance.push(`
MATH GUIDANCE:
- For primality: trial division up to sqrt(N) is O(sqrt(N)).
  For multiple queries: Sieve of Eratosthenes up to max N.
- For GCD: use math.gcd() from stdlib. LCM = a * b // gcd(a, b).
- For modular arithmetic: always apply mod at each step, not only at end.
  (a * b) % MOD ≠ a * b % MOD when a*b overflows (not an issue in Python but be consistent).
- For combinations/permutations: use math.comb() or precompute factorials with mod inverse.
- Common bug: integer division // vs true division / — use // for floor division always.
- Common bug: not handling N=0 or N=1 in factorial/combinatorics.
- Trace through: N=0, N=1, large primes near constraint limit, N=1 for prime check.`);
  }

  // ── GREEDY ───────────────────────────────────────────────────────────
  if (tags.some((t) => ["Greedy"].includes(t))) {
    guidance.push(`
GREEDY GUIDANCE:
- Before writing code, PROVE the greedy choice is safe — write the proof in a comment.
  "We choose X first because any solution that doesn't must be sub-optimal because..."
- Sort input if the greedy requires processing in a specific order — don't assume it arrives sorted.
- For interval scheduling: sort by END time (not start time) for maximum non-overlapping intervals.
- For minimum cost: sort by cost ascending.
- Common bug: greedy that works on the sample but fails on adversarial input where
  local optimum ≠ global optimum. Always think of a counter-example.
- Common bug: mutating the input array while iterating over it.
- Trace through: already optimal input, input requiring full reversal, single element, all identical.`);
  }

  // ── BACKTRACKING ─────────────────────────────────────────────────────
  if (tags.some((t) => ["Backtracking"].includes(t))) {
    guidance.push(`
BACKTRACKING GUIDANCE:
- Always increase Python's recursion limit for deep backtracking:
    import sys; sys.setrecursionlimit(10**6)
- Add pruning as early as possible — check constraints BEFORE making the recursive call.
- Use a visited/used set and UNDO changes after recursive call returns (backtrack step).
- For permutations: mark element as used before recursion, unmark after.
- Common bug: forgetting to unmark/undo state after recursive return — corrupts future branches.
- Common bug: base case check placed after recursive calls instead of before.
- Common bug: returning first solution found when all solutions are needed (or vice versa).
- Trace through: N=1 (trivial solution), case with no valid solution, case with exactly one solution.`);
  }

  // ── SEARCHING / BINARY SEARCH ────────────────────────────────────────
  if (tags.some((t) => ["Searching"].includes(t))) {
    guidance.push(`
BINARY SEARCH GUIDANCE:
- Template for finding leftmost valid position:
    lo, hi = 0, N-1
    while lo < hi:
        mid = (lo + hi) // 2
        if condition(mid): hi = mid
        else: lo = mid + 1
    return lo
- Template for finding rightmost valid position:
    lo, hi = 0, N-1
    while lo < hi:
        mid = (lo + hi + 1) // 2   # +1 prevents infinite loop when lo+1==hi
        if condition(mid): lo = mid
        else: hi = mid - 1
    return lo
- Common bug: mid = (lo + hi) // 2 in rightmost search → infinite loop.
- Common bug: searching on a non-monotonic predicate — verify predicate is monotonic first.
- Common bug: off-by-one in initial hi (should be N-1 for index search, N for count search).
- Trace through: target at index 0, target at last index, target not present, single element.`);
  }

  // ── HASH TABLE ───────────────────────────────────────────────────────
  if (tags.some((t) => ["Hash Table"].includes(t))) {
    guidance.push(`
HASH TABLE GUIDANCE:
- Use dict.get(key, default) instead of checking 'if key in dict' then accessing — one lookup.
- Use collections.defaultdict(int) or collections.Counter for frequency counting.
- For two-sum style problems: store complement in dict as you iterate — one pass O(n).
- Common bug: dict not reset between testcases — clear it at the start of each testcase.
- Common bug: using a mutable object as a dict key (list → use tuple instead).
- Common bug: assuming dict preserves insertion order in Python < 3.7 (it does in 3.7+).
- Trace through: empty input, all identical keys, key that maps to 0 (falsy value check).`);
  }

  // ── RECURSION ────────────────────────────────────────────────────────
  if (tags.some((t) => ["Recursion"].includes(t))) {
    guidance.push(`
RECURSION GUIDANCE:
- Always set recursion limit for deep inputs:
    import sys; sys.setrecursionlimit(10**6)
- Every recursive function must have:
    1. A base case that returns without recursing
    2. Progress toward the base case (input shrinks each call)
- Add memoization (@functools.lru_cache or manual dict) if subproblems repeat.
- Common bug: missing base case → infinite recursion → stack overflow.
- Common bug: base case placed after recursive call → always recurses once too many.
- Common bug: mutable default argument in recursive function def foo(arr=[]) — use None instead.
- Trace through: N=0, N=1, N=2 (smallest non-trivial case).`);
  }

  // ── BIT MANIPULATION ─────────────────────────────────────────────────
  if (tags.some((t) => ["Bit Manipulation"].includes(t))) {
    guidance.push(`
BIT MANIPULATION GUIDANCE:
- Use & (AND), | (OR), ^ (XOR), ~ (NOT), << (left shift), >> (right shift).
- To check if bit i is set: (n >> i) & 1
- To set bit i: n | (1 << i)
- To clear bit i: n & ~(1 << i)
- To toggle bit i: n ^ (1 << i)
- To count set bits: bin(n).count('1') or use bit_count() in Python 3.10+
- XOR trick: a ^ a = 0, a ^ 0 = a. For finding unique element: XOR all → duplicates cancel.
- Common bug: operator precedence — (n & mask == 0) parses as n & (mask == 0). Use (n & mask) == 0.
- Common bug: negative numbers in Python have infinite leading 1s in binary — use masking.
- Trace through: n=0, n=1, n with all bits set (2^k - 1), n=power of 2.`);
  }

  // ── TWO POINTERS ─────────────────────────────────────────────────────
  if (tags.some((t) => ["Two Pointers", "Two Pointer"].includes(t))) {
    guidance.push(`
TWO POINTERS GUIDANCE:
- Two pointers only works correctly on SORTED arrays (for pair-sum style).
  If input is not sorted, sort it first (and track original indices if needed).
- Template:
    lo, hi = 0, N-1
    while lo < hi:
        s = arr[lo] + arr[hi]
        if s == target: record, lo++, hi--
        elif s < target: lo++
        else: hi--
- For sliding window variant: lo only moves forward — O(n) total.
- Common bug: using lo <= hi instead of lo < hi allows same element used twice.
- Common bug: not advancing both pointers after finding a match (infinite loop).
- Common bug: forgetting to sort input before applying two pointers.
- Trace through: no valid pair, all elements identical, answer at extreme ends.`);
  }

  // ── SLIDING WINDOW ───────────────────────────────────────────────────
  if (tags.some((t) => ["Sliding Window"].includes(t))) {
    guidance.push(`
SLIDING WINDOW GUIDANCE:
- Fixed window: right pointer advances each step, left = right - k + 1.
- Variable window: expand right unconditionally, shrink left while constraint violated.
- For maximum/minimum in window: use collections.deque (monotonic deque), not sorted().
  Sorted() inside loop → O(n²). Deque → O(n).
- Track window state incrementally — update when adding right element, update when removing left.
- Common bug: off-by-one in window size: window size = right - left + 1.
- Common bug: not initializing the result before the loop (if array could be empty).
- Common bug: shrinking window past valid state — check condition BEFORE shrinking.
- Trace through: window larger than array, all identical elements, k=1, k=N.`);
  }

  // ── DIVIDE AND CONQUER ───────────────────────────────────────────────
  if (tags.some((t) => ["Divide and Conquer"].includes(t))) {
    guidance.push(`
DIVIDE AND CONQUER GUIDANCE:
- Split at midpoint: mid = (lo + hi) // 2. Never split based on value.
- Ensure base case handles: lo == hi (single element) and lo > hi (empty).
- Merge step must combine LEFT and RIGHT results correctly without losing elements.
- For merge sort counting (inversions etc.): count during the merge step, not before.
- Common bug: mid = (lo + hi) / 2 (float) instead of // (integer) → index error.
- Common bug: off-by-one in recursive calls: left = solve(lo, mid), right = solve(mid+1, hi).
  Using solve(lo, mid-1) or solve(mid, hi) creates wrong splits.
- Common bug: not copying subarrays before merging (modifying array in-place during merge).
- Trace through: N=1, N=2, N=3 (odd), already sorted, reverse sorted.`);
  }

  // ── UNION FIND ───────────────────────────────────────────────────────
  if (tags.some((t) => ["Union Find"].includes(t))) {
    guidance.push(`
UNION FIND GUIDANCE:
- Always implement BOTH path compression AND union by rank for O(α(n)) amortized.
    def find(x):
        if parent[x] != x:
            parent[x] = find(parent[x])   # path compression
        return parent[x]
    def union(x, y):
        px, py = find(x), find(y)
        if px == py: return False          # already same component
        if rank[px] < rank[py]: px, py = py, px
        parent[py] = px
        if rank[px] == rank[py]: rank[px] += 1
        return True
- Initialize: parent[i] = i, rank[i] = 0 for all i.
- Reset parent and rank arrays between testcases.
- Common bug: calling find() without path compression → O(N) per call on chain graphs.
- Common bug: not initializing parent[i] = i (leaving as 0) → all nodes point to node 0.
- Trace through: self-union, union of already-connected nodes, chain of N unions then find.`);
  }

  // ── MATRIX ───────────────────────────────────────────────────────────
  if (tags.some((t) => ["Matrix"].includes(t))) {
    guidance.push(`
MATRIX GUIDANCE:
- Access: matrix[row][col]. Rows = len(matrix), Cols = len(matrix[0]).
- For BFS on grid: directions = [(0,1),(0,-1),(1,0),(-1,0)].
  Always check 0 <= nr < rows and 0 <= nc < cols before accessing.
- For in-place modification: if reading and writing same matrix, copy or use two-pass.
- For spiral/rotation: handle the boundary indices carefully (lo_row, hi_row, lo_col, hi_col).
- Common bug: row/col confusion — matrix[i][j] where i is row (vertical) and j is col (horizontal).
- Common bug: modifying matrix while iterating it in flood-fill → use a visited set.
- Common bug: not handling non-square matrices (M×N where M≠N).
- Trace through: 1×1 matrix, 1×N matrix, M×1 matrix, fully identical values.`);
  }

  // ── SIMULATION ───────────────────────────────────────────────────────
  if (tags.some((t) => ["Simulation"].includes(t))) {
    guidance.push(`
SIMULATION GUIDANCE:
- Simulate exactly what the problem says — do not try to optimize unless TLE.
- For large step counts: look for a cycle. If state repeats, skip ahead.
    seen = {}
    step = 0
    while step < total_steps:
        state_key = make_hashable(state)
        if state_key in seen:
            cycle_len = step - seen[state_key]
            remaining = (total_steps - step) % cycle_len
            fast_forward to step + remaining; break
        seen[state_key] = step
        simulate_one_step()
        step += 1
- Common bug: off-by-one in simulation loop (simulating N+1 steps instead of N).
- Common bug: not resetting state between testcases.
- Common bug: using floating point for position/time — use integer arithmetic where possible.
- Trace through: 0 steps, 1 step, step count equals cycle length exactly.`);
  }

  // ── GAME THEORY ──────────────────────────────────────────────────────
  if (tags.some((t) => ["Game Theory"].includes(t))) {
    guidance.push(`
GAME THEORY GUIDANCE:
- For Nim-style games: compute XOR of all pile sizes. If XOR == 0 → second player wins.
- For Grundy/Sprague-Grundy: g(state) = mex({g(next_state) for all moves}).
  mex = minimum excludant (smallest non-negative integer not in the set).
- Memoize Grundy values — states repeat.
- For simple take-away games: if N % (k+1) == 0 → second player wins (where k = max take).
- Common bug: computing XOR correctly but returning wrong winner (XOR==0 means CURRENT player loses).
- Common bug: not memoizing Grundy values → exponential recomputation.
- Common bug: forgetting that a position with no moves is a losing position (Grundy = 0).
- Trace through: N=0 (base case, losing), N=1, N=2, N where second player wins.`);
  }

  // ── TOPOLOGICAL SORT ─────────────────────────────────────────────────
  if (tags.some((t) => ["Topological Sort"].includes(t))) {
    guidance.push(`
TOPOLOGICAL SORT GUIDANCE:
- Kahn's algorithm (BFS-based): use in-degree array.
    Queue all nodes with in-degree 0.
    Process: for each neighbor, decrement in-degree. If 0, enqueue.
    If result length < N → cycle exists.
- DFS-based: post-order DFS, reverse the result.
- Always handle disconnected graphs: all nodes must be processed.
- For cycle detection: if topological sort processes fewer than N nodes → cycle.
- Common bug: not initializing in-degree for all nodes (nodes with no incoming edges missing).
- Common bug: modifying the graph while iterating adjacency list.
- Common bug: 0-indexed vs 1-indexed node ids — be consistent.
- Trace through: single node, linear chain (1→2→3), graph with a cycle, disconnected DAG.`);
  }

  // ── MONOTONIC STACK ──────────────────────────────────────────────────
  if (tags.some((t) => ["Monotonic Stack"].includes(t))) {
    guidance.push(`
MONOTONIC STACK GUIDANCE:
- For "next greater element": maintain a DECREASING monotonic stack.
    for i in range(N):
        while stack and arr[stack[-1]] < arr[i]:
            idx = stack.pop()
            result[idx] = arr[i]   # arr[i] is next greater for arr[idx]
        stack.append(i)
    # elements remaining in stack have no next greater → result[idx] = -1
- For "previous smaller element": process left to right with increasing stack.
- Store INDICES in stack, not values — you need index to fill result array.
- After loop: all indices still in stack → no answer exists → set to -1 or 0.
- Common bug: storing values instead of indices → cannot fill result array.
- Common bug: using wrong comparison (< vs <=) → off-by-one for equal elements.
- Common bug: forgetting to handle remaining stack elements after the loop.
- Trace through: strictly increasing, strictly decreasing, all equal, single element.`);
  }

  // ── PREFIX SUM ───────────────────────────────────────────────────────
  if (tags.some((t) => ["Prefix Sum"].includes(t))) {
    guidance.push(`
PREFIX SUM GUIDANCE:
- Build: prefix[0] = 0, prefix[i] = prefix[i-1] + arr[i-1] (1-indexed prefix).
  This way: sum(l, r) = prefix[r] - prefix[l-1] for 1-indexed l,r.
- For 0-indexed: sum(l, r) = prefix[r+1] - prefix[l].
- For 2D prefix sum: prefix[i][j] = arr[i][j] + prefix[i-1][j] + prefix[i][j-1] - prefix[i-1][j-1].
- Common bug: off-by-one — prefix array needs N+1 slots, not N.
- Common bug: querying prefix[r] - prefix[l] instead of prefix[r] - prefix[l-1].
- Common bug: not resetting prefix array between testcases.
- Common bug: integer overflow in prefix sum for large values — Python handles big ints natively.
- Trace through: query [1,1] (single element), query [1,N] (entire array), all negative values.`);
  }

  if (guidance.length === 0) {
    return `Verify your solution carefully against all edge cases.
Trace through the sample input manually before returning.
Check boundary conditions: empty input, single element, all identical values.`;
  }

  return `═══════════════════════════════════════════════════
ALGORITHM-SPECIFIC CORRECTNESS REQUIREMENTS
Read all of these before writing a single line of code.
═══════════════════════════════════════════════════
${guidance.join("\n")}

UNIVERSAL REQUIREMENTS (apply to all solutions):
- Reset ALL state (arrays, dicts, counters) at the start of each testcase.
- Do not use global mutable variables that persist across testcases.
- Trace through the provided sample input manually and verify output matches.
- Handle T=1 and T=max identically — no special-casing.`;
}

module.exports = buildSolutionGuidance;
