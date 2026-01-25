import os
import sys
import io
import glob

# The provided solution code, refactored into a callable function.
def solve_callable(N, K, skills_list):
    # Sorting skills is crucial for the greedy approach in can_form
    skills = sorted(skills_list)

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
    
    return ans

# Main logic for generating outputs
# This function will be called by the testing framework.
def generate_outputs():
    input_files = sorted(glob.glob("input/input*.txt"))
    os.makedirs("output", exist_ok=True)

    for input_filepath in input_files:
        output_filename = os.path.basename(input_filepath).replace("input", "output")
        output_filepath = os.path.join("output", output_filename)

        results = []
        with open(input_filepath, 'r') as infile:
            T = int(infile.readline())
            for _ in range(T):
                N, K = map(int, infile.readline().split())
                skills = list(map(int, infile.readline().split()))
                
                # Call the refactored solve function
                result = solve_callable(N, K, skills)
                results.append(str(result))

        with open(output_filepath, 'w') as outfile:
            outfile.write("\n".join(results) + "\n")

# Call the output generation function when outputGenCode is executed
generate_outputs()
