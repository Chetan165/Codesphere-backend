import os
import random
import sys

def generate_input00():
    # Sample case provided in the problem description
    filename = "input/input00.txt"
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with open(filename, "w") as f:
        f.write("2\n")
        f.write("5\n")
        f.write("10 20 0 30 0\n")
        f.write("3\n")
        f.write("5 0 0\n")
    print(f"Generated {filename}")

def generate_input01():
    # Edge case: All zeros
    filename = "input/input01.txt"
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with open(filename, "w") as f:
        f.write("1\n")
        N = 100
        f.write(f"{N}\n")
        f.write(" ".join(["0"] * N) + "\n")
    print(f"Generated {filename}")

def generate_input02():
    # Edge case: All positive values
    filename = "input/input02.txt"
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with open(filename, "w") as f:
        f.write("1\n")
        N = 100
        f.write(f"{N}\n")
        f.write(" ".join([str(random.randint(1, 100)) for _ in range(N)]) + "\n")
    print(f"Generated {filename}")

def generate_input03():
    # Edge case: Mixed ops, resulting in empty stack (push-pop sequence)
    filename = "input/input03.txt"
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with open(filename, "w") as f:
        f.write("1\n")
        N = 200 # 100 pushes, 100 pops
        ops = []
        for i in range(N // 2):
            ops.append(str(random.randint(1, 1000)))
            ops.append("0")
        f.write(f"{len(ops)}\n")
        f.write(" ".join(ops) + "\n")
    print(f"Generated {filename}")

def generate_input04():
    # Edge case: Single operation
    filename = "input/input04.txt"
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with open(filename, "w") as f:
        f.write("2\n")
        # Case 1: single positive
        f.write("1\n")
        f.write(f"{random.randint(1, 10**9)}\n")
        # Case 2: single zero
        f.write("1\n")
        f.write("0\n")
    print(f"Generated {filename}")

def generate_input05():
    # Large case: Max N, all positive values, max op_i
    filename = "input/input05.txt"
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with open(filename, "w") as f:
        f.write("1\n")
        N = 10**5
        f.write(f"{N}\n")
        f.write(" ".join([str(10**9)] * N) + "\n") # All max value
    print(f"Generated {filename}")

def generate_input06():
    # Large case: Max N, push all then pop almost all, leaving a few
    filename = "input/input06.txt"
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with open(filename, "w") as f:
        f.write("1\n")
        num_to_push = 5 * 10**4
        num_to_pop = num_to_push - 5 # Leave 5 elements
        ops = [str(random.randint(1, 10**9)) for _ in range(num_to_push)] # Push
        ops.extend(["0"] * num_to_pop) # Pop
        f.write(f"{len(ops)}\n")
        f.write(" ".join(ops) + "\n")
    print(f"Generated {filename}")

def generate_input07():
    # Large case: Max N, alternating push/pop, but ending with many pushes
    filename = "input/input07.txt"
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with open(filename, "w") as f:
        f.write("1\n")
        N = 10**5
        ops = []
        # Alternating for most part
        for i in range((N - 100) // 2): # leave 100 ops for final pushes
            ops.append(str(random.randint(1, 10**9)))
            ops.append("0")
        # Many pushes at the end
        for i in range(100):
            ops.append(str(random.randint(1, 10**9)))
        
        # Adjust N if it's slightly off due to division (robustness)
        if len(ops) > N:
            ops = ops[:N]
        elif len(ops) < N:
            ops.extend([str(random.randint(1, 10**9))] * (N - len(ops)))
            
        f.write(f"{len(ops)}\n")
        f.write(" ".join(ops) + "\n")
    print(f"Generated {filename}")

def generate_input08():
    # Large case: Max T, small N each
    filename = "input/input08.txt"
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with open(filename, "w") as f:
        T = 100
        f.write(f"{T}\n")
        total_N = 0
        for _ in range(T):
            N_per_case = random.randint(1, 200) # Small N, sum(N) up to 20000
            total_N += N_per_case
            ops = []
            for _ in range(N_per_case):
                if random.random() < 0.7: # More likely to push
                    ops.append(str(random.randint(1, 10**9)))
                else:
                    ops.append("0")
            f.write(f"{N_per_case}\n")
            f.write(" ".join(ops) + "\n")
    print(f"Generated {filename}, total N: {total_N}")

def generate_input09():
    # Max sum of N over all test cases (2*10^5), single test case
    filename = "input/input09.txt"
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with open(filename, "w") as f:
        f.write("1\n")
        N = 2 * 10**5 # Max sum of N
        f.write(f"{N}\n")
        ops = []
        # Pattern: push N/2, pop N/4, push N/4, then fill remaining with pops
        num_pushes_1 = N // 2
        num_pops_1 = N // 4
        num_pushes_2 = N // 4
        
        for _ in range(num_pushes_1):
            ops.append(str(random.randint(1, 10**9)))
        for _ in range(num_pops_1):
            ops.append("0")
        for _ in range(num_pushes_2):
            ops.append(str(random.randint(1, 10**9)))
        
        # Fill remaining with zeros to reach exact N ops
        while len(ops) < N:
            ops.append("0")

        f.write(" ".join(ops[:N]) + "\n")
    print(f"Generated {filename}")

# This part would be executed to generate all inputs when the script is run
if __name__ == '__main__':
    generate_input00()
    generate_input01()
    generate_input02()
    generate_input03()
    generate_input04()
    generate_input05()
    generate_input06()
    generate_input07()
    generate_input08()
    generate_input09()
