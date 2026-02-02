
# Problem Statement
You are managing a system that processes a sequence of numerical operations. Each operation is represented by an integer. If the integer is a positive value (`x > 0`), it signifies adding `x` to a list of active records. If the integer is `0`, it represents an undo operation, meaning the most recently added positive value should be removed from the list of active records. If an undo operation (`0`) occurs when there are no active records, it simply has no effect.

After all operations have been processed, your task is to calculate the total sum of all positive values that remain in the list of active records.

## Input Format
The first line of input contains a single integer `T`, representing the number of test cases.

For each test case:
- The first line contains an integer `N`, the number of operations.
- The second line contains `N` space-separated integers `op_1, op_2, ..., op_N`, representing the sequence of operations.

## Output Format
For each test case, output a single integer on a new line, which is the sum of all active records after processing all operations.

## Constraints
- `1 <= T <= 100`
- `1 <= N <= 10^5`
- `0 <= op_i <= 10^9` (where `op_i` is an operation value)
- The sum of `N` over all test cases will not exceed `2 * 10^5`.

## Sample Input
```
2
5
10 20 0 30 0
3
5 0 0
```

## Sample Output
```
10
0
```

## Solution
```python
import sys

def solve():
    N = int(sys.stdin.readline())
    operations = list(map(int, sys.stdin.readline().split()))

    stack = []
    for op in operations:
        if op > 0:
            stack.append(op)
        elif op == 0:
            # Only pop if the stack is not empty
            if stack:
                stack.pop()
    
    print(sum(stack))

T = int(sys.stdin.readline())
for _ in range(T):
    solve()

```
