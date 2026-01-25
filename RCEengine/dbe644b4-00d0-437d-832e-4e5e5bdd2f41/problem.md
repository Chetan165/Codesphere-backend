
# Problem Statement
You are given a list of `N` students, each possessing a distinct skill level. Your task is to divide these students into exactly `K` teams. The "cohesion" of a team is defined as the difference between the highest and lowest skill levels among its members. For instance, a team with skills `[10, 12, 15]` has a cohesion of `15 - 10 = 5`. 

Your objective is to partition all `N` students into `K` teams such that the *maximum* cohesion among all `K` teams is minimized. What is this minimum possible maximum cohesion?

## Input Format
The first line contains an integer `T` (the number of testcases).

For each testcase:
- The first line contains two space-separated integers `N` and `K` (number of students and number of teams).
- The second line contains `N` space-separated integers, `skill_1, skill_2, ..., skill_N`, representing the skill levels of the students.

## Output Format
For each testcase, print a single integer: the minimum possible maximum cohesion.

## Constraints
1 <= T <= 100
1 <= K <= N <= 10^5
0 <= skill_i <= 10^9
The sum of N over all testcases does not exceed 2 * 10^5.

## Sample Input
```
2
5 3
10 20 30 40 50
4 2
1 10 100 1000
```

## Sample Output
```
10
98
```

## Solution
```python
import sys

def solve():
    N, K = map(int, sys.stdin.readline().split())
    skills = list(map(int, sys.stdin.readline().split()))
    
    # Sorting skills is crucial for the greedy approach in can_form
    skills.sort()

    # Helper function: Check if it's possible to partition students into at most K teams
    # such that no team has a cohesion greater than max_cohesion.
    # This function uses a greedy approach: always make the current team
    # as large as possible while respecting max_cohesion, thereby minimizing
    # the total number of teams formed.
    def can_form(max_cohesion):
        teams_needed = 0
        i = 0
        while i < N:
            teams_needed += 1
            current_team_min_skill = skills[i]
            j = i + 1
            # Expand the current team as much as possible, adding students
            # whose skill difference from the current team's min skill
            # does not exceed max_cohesion.
            while j < N and skills[j] - current_team_min_skill <= max_cohesion:
                j += 1
            # All students from skills[i] to skills[j-1] are now in this team.
            # The next team will start with skills[j].
            i = j
        
        # If we need M teams with this max_cohesion, and M <= K, it's possible.
        # If M < K, we can always split one of the existing teams (or any team)
        # into more teams without increasing their maximum cohesion until we have exactly K teams.
        # If M > K, then max_cohesion is too small.
        return teams_needed <= K

    # The search space for the minimum possible maximum cohesion:
    # - Minimum possible value: 0 (if K=N, or all students have the same skill).
    # - Maximum possible value: skills[-1] - skills[0] (if K=1, all students form one team).
    low = 0
    high = skills[-1] - skills[0] if N > 0 else 0 # N >= 1 is guaranteed by constraints
    ans = high # Initialize with a worst-case possible answer, to be minimized

    # Perform binary search on the answer (max_cohesion).
    # We are looking for the smallest `mid` for which `can_form(mid)` is True.
    while low <= high:
        mid = low + (high - low) // 2
        if can_form(mid):
            ans = mid      # `mid` is a possible answer, try for a smaller one
            high = mid - 1
        else:
            low = mid + 1  # `mid` is too small, need a larger `max_cohesion`
    
    sys.stdout.write(str(ans) + '\n')

# Read the number of testcases
T = int(sys.stdin.readline())
for _ in range(T):
    solve()

```
