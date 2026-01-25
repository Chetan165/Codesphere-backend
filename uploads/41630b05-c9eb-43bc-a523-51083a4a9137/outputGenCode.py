import os

# The provided solution code
def minRescuePods(weights: list[int], limit: int) -> int:
    """
    Calculates the minimum number of rescue pods required to save all people.
    Each pod can carry at most two people, with a total weight limit.
    
    Args:
        weights: A list of integers representing the weights of the people.
        limit: An integer representing the maximum weight capacity of a rescue pod.
        
    Returns:
        The minimum number of rescue pods.
    """
    weights.sort()  # Sort the weights in ascending order (O(N log N))
    
    pods = 0
    left = 0          # Pointer for the lightest person
    right = len(weights) - 1 # Pointer for the heaviest person
    
    # Use two pointers to pair people (O(N))
    while left <= right:
        # Each iteration saves at least one person (the heaviest person at 'right')
        pods += 1
        
        # Try to pair the heaviest person with the lightest
        # If their combined weight is within the limit, both are saved in one pod
        if weights[left] + weights[right] <= limit:
            left += 1 # The lightest person is now saved, move to the next lightest
        
        right -= 1 # The heaviest person is always saved (either alone or with 'left'),
                   # move to the next heaviest person
            
    return pods

# Create the output directory if it doesn't exist
os.makedirs('output', exist_ok=True)

def generate_outputs():
    # Loop through the 5 test cases (input00.txt to input04.txt)
    for i in range(5):
        input_filename = f'input/input{i:02d}.txt'
        output_filename = f'output/output{i:02d}.txt'

        try:
            with open(input_filename, 'r') as f:
                N = int(f.readline())
                weights = list(map(int, f.readline().split()))
                limit = int(f.readline())
            
            # Run the solution function with the parsed input
            result = minRescuePods(weights, limit)
            
            # Write the result to the corresponding output file
            with open(output_filename, 'w') as f:
                f.write(str(result) + '\n')
        except FileNotFoundError:
            print(f"Error: Input file {input_filename} not found. Please ensure inputGenCode has been run to create input files.")
        except Exception as e:
            print(f"An error occurred while processing {input_filename}: {e}")

if __name__ == '__main__':
    generate_outputs()
