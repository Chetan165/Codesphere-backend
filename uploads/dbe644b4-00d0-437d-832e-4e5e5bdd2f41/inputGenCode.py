import os
import random

# Helper function to write test cases to a file
def write_test_case_to_file(filename, test_cases_data):
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with open(filename, 'w') as f:
        f.write(str(len(test_cases_data)) + '\n')
        for N, K, skills in test_cases_data:
            f.write(f"{N} {K}\n")
            f.write(" ".join(map(str, skills)) + '\n')

def generate_input00():
    # Sample Test Cases
    test_cases = [
        # Example 1: N=5, K=2, skills=[10, 20, 30, 40, 50] -> Expected Ans: 20
        # Teams could be [10,20,30] (cohesion 20), [40,50] (cohesion 10). Max is 20.
        # Another: [10,20] (cohesion 10), [30,40,50] (cohesion 20). Max is 20.
        (5, 2, [10, 20, 30, 40, 50]),
        # Example 2: N=7, K=3, skills=[1, 2, 3, 10, 11, 12, 20] -> Expected Ans: 2
        # Teams: [1,2,3] (cohesion 2), [10,11,12] (cohesion 2), [20] (cohesion 0). Max is 2.
        (7, 3, [1, 2, 3, 10, 11, 12, 20]),
        # Example 3: All same skills, K < N -> Expected Ans: 0
        (4, 2, [5, 5, 5, 5]),
    ]
    write_test_case_to_file("input/input00.txt", test_cases)

def generate_input01():
    # Edge Test Cases
    test_cases = []

    # 1. N=1, K=1 (minimum N, K) -> Expected Ans: 0
    test_cases.append((1, 1, [500]))

    # 2. K=N (each student forms a team) -> Expected Ans: 0
    test_cases.append((10, 10, [random.randint(0, 10**9) for _ in range(10)]))

    # 3. K=1 (all students in one team) -> Expected Ans: skills_k1[-1] - skills_k1[0]
    skills_k1 = sorted([random.randint(0, 10**9) for _ in range(15)])
    test_cases.append((15, 1, skills_k1))

    # 4. All skills are identical -> Expected Ans: 0
    test_cases.append((8, 3, [42] * 8))

    # 5. Skills with large range, unsorted input to check sorting
    # Sorted: [0, 1, 2, 10^9-1, 10^9]. For K=2, can form [0,1,2] and [10^9-1, 10^9]. Max cohesion 2.
    test_cases.append((5, 2, [0, 10**9, 1, 10**9 - 1, 2])) 

    # 6. Linear progression, K=2 (should split roughly in half) -> Expected Ans: (max_skill - min_skill) / 2
    N_edge = 20
    skills_linear = [i * 10 for i in range(N_edge)] # [0, 10, ..., 190]
    test_cases.append((N_edge, 2, skills_linear))

    # 7. Linear progression, K slightly less than N/2, should try to pair up students
    N_edge_pairs = 20
    skills_pairs = [i * 2 for i in range(N_edge_pairs)] # [0, 2, 4, ..., 38]
    # For K=N_edge_pairs//2 = 10 teams. `can_form(1)` fails. `can_form(2)` works for teams like [0,2], [4,6], etc. Max cohesion 2.
    test_cases.append((N_edge_pairs, N_edge_pairs // 2, skills_pairs))

    write_test_case_to_file("input/input01.txt", test_cases)

def generate_input02():
    # Large Test Cases (sum of N over all testcases in this file <= 2 * 10^5)
    test_cases = []

    # 1. Max N, min K=2, skills with small gaps (linear progression) -> Expected Ans: (N-1)/2
    N_large_1 = 10**5
    test_cases.append((N_large_1, 2, list(range(N_large_1))))

    # 2. Max N, max K=N, skills with large random gaps -> Expected Ans: 0
    N_large_2 = 10**5
    skills_large_2 = sorted(random.sample(range(0, 10**9 + 1), N_large_2))
    test_cases.append((N_large_2, N_large_2, skills_large_2))

    # Total N = 10^5 + 10^5 = 2 * 10^5. This respects the sum N constraint for a single file.
    write_test_case_to_file("input/input02.txt", test_cases)

def generate_input03():
    # Generic Test Cases (mixture of N, K, skills; sum of N over all testcases in this file <= 2 * 10^5)
    test_cases = []

    # 1. Medium N, medium K, uniform skill distribution
    N_gen_1 = 20000
    K_gen_1 = 1000
    test_cases.append((N_gen_1, K_gen_1, [i * 5 for i in range(N_gen_1)]))

    # 2. Medium N, small K, random wide skill distribution
    N_gen_2 = 30000
    K_gen_2 = 20
    skills_gen_2 = sorted([random.randint(0, 10**9) for _ in range(N_gen_2)])
    test_cases.append((N_gen_2, K_gen_2, skills_gen_2))

    # 3. Medium N, K closer to N/2, small skill range
    N_gen_3 = 50000
    K_gen_3 = N_gen_3 // 2
    test_cases.append((N_gen_3, K_gen_3, list(range(N_gen_3))))

    # 4. Large N, K=1, linear skills with large gaps
    N_gen_4 = 100000 
    K_gen_4 = 1
    test_cases.append((N_gen_4, K_gen_4, [i * 100 for i in range(N_gen_4)])) 
    
    # Total N = 20k + 30k + 50k + 100k = 200k. This respects the sum N constraint for a single file.
    write_test_case_to_file("input/input03.txt", test_cases)

def generate_input04():
    # Random Test Cases (T=100, N up to 2000 per case, sum N over all testcases in this file <= 2 * 10^5)
    test_cases = []
    max_total_N_for_file = 2 * 10**5
    current_total_N = 0
    max_N_per_single_case = 2000 # To ensure sum N is generally respected for 100 testcases
    
    for _ in range(100): # Aim for T=100 test cases
        remaining_N_capacity = max_total_N_for_file - current_total_N
        if remaining_N_capacity <= 0:
            break # Stop if N capacity is exhausted
        
        N = random.randint(1, min(max_N_per_single_case, remaining_N_capacity))
        K = random.randint(1, N)
        
        # Vary skill generation somewhat
        skill_type = random.randint(0, 3)
        skills = []
        if skill_type == 0: # Random skills
            skills = [random.randint(0, 10**9) for _ in range(N)]
        elif skill_type == 1: # Linearly increasing
            start_skill = random.randint(0, 10**9 - N) # Ensure start_skill + N does not exceed 10^9 easily
            step = random.randint(0, 1000) 
            skills = [start_skill + i * step for i in range(N)]
        elif skill_type == 2: # All skills same
            skill_val = random.randint(0, 10**9)
            skills = [skill_val] * N
        else: # Random, but clustered (e.g., two clusters)
            cluster_point_1 = random.randint(0, 10**9 // 2)
            cluster_point_2 = random.randint(10**9 // 2 + 1, 10**9)
            for _ in range(N):
                if random.random() < 0.5:
                    skills.append(random.randint(max(0, cluster_point_1 - 100), min(10**9, cluster_point_1 + 100)))
                else:
                    skills.append(random.randint(max(0, cluster_point_2 - 100), min(10**9, cluster_point_2 + 100)))
            
        test_cases.append((N, K, skills))
        current_total_N += N
    
    write_test_case_to_file("input/input04.txt", test_cases)

# Call all generation functions when inputGenCode is executed
generate_input00()
generate_input01()
generate_input02()
generate_input03()
generate_input04()
