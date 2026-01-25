import os
import random

# Create the input directory if it doesn't exist
os.makedirs('input', exist_ok=True)

def write_test_case(filename, N, weights, limit):
    with open(filename, 'w') as f:
        f.write(str(N) + '\n')
        f.write(' '.join(map(str, weights)) + '\n')
        f.write(str(limit) + '\n')

# generate_input00 (Sample Test Case)
def generate_input00():
    N = 5
    weights = [10, 20, 30, 40, 50]
    limit = 60
    write_test_case('input/input00.txt', N, weights, limit)

# generate_input01 (Edge Case - All fit perfectly in pairs, N/2 pods)
# Max N and limit. All weights are limit/2, ensuring perfect pairs.
def generate_input01():
    N = 5 * 10**4
    limit = 3 * 10**4
    weight_val = limit // 2
    # Ensure weight_val is at least 1 and within limit
    weight_val = max(1, min(weight_val, limit))
    weights = [weight_val] * N
    write_test_case('input/input01.txt', N, weights, limit)

# generate_input02 (Edge Case - No pairs possible / All single, N pods)
# Max N and limit. All weights are > limit/2, forcing each person to take a separate pod.
def generate_input02():
    N = 5 * 10**4
    limit = 3 * 10**4
    weight_val = limit // 2 + 1
    # Ensure weight_val is at least 1 and within limit
    weight_val = max(1, min(weight_val, limit))
    weights = [weight_val] * N
    write_test_case('input/input02.txt', N, weights, limit)

# generate_input03 (Large Generic Test Case)
# Max N and limit, with weights randomly distributed within the valid range.
def generate_input03():
    N = 5 * 10**4
    limit = 3 * 10**4
    weights = [random.randint(1, limit) for _ in range(N)]
    write_test_case('input/input03.txt', N, weights, limit)

# generate_input04 (Random/Stress Test Case - Many small, few large)
# Max N and limit, with a distribution designed to heavily use the two-pointer logic.
# A large number of very light people and a smaller number of very heavy people.
def generate_input04():
    N = 5 * 10**4
    limit = 3 * 10**4
    
    # Approximately 90% very light, 10% very heavy
    num_light = N * 9 // 10
    num_heavy = N - num_light
    
    weights = []
    # Very light people (weight 1 or 2, respecting limit)
    for _ in range(num_light):
        weights.append(random.randint(1, min(2, limit)))
    
    # Very heavy people (weight close to limit, respecting limit and >=1)
    for _ in range(num_heavy):
        weights.append(random.randint(max(1, limit - 100), limit))
        
    random.shuffle(weights) # Shuffle for non-sorted initial state
    write_test_case('input/input04.txt', N, weights, limit)

if __name__ == '__main__':
    generate_input00()
    generate_input01()
    generate_input02()
    generate_input03()
    generate_input04()
