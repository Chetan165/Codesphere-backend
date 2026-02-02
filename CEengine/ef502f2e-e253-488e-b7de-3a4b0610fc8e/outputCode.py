import os
import sys
import glob

# Provided solution code wrapped in a function to be callable
def solve_problem_instance():
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
    
    # Return the sum instead of printing directly to allow capturing
    return sum(stack)

def generate_outputs():
    # Ensure output directory exists
    os.makedirs("output", exist_ok=True)

    # Get a sorted list of all input files to process them in order
    input_files = sorted(glob.glob("input/input*.txt"))

    for input_filepath in input_files:
        # Determine the corresponding output file path
        output_filename = os.path.basename(input_filepath).replace("input", "output")
        output_filepath = os.path.join("output", output_filename)
        
        # Redirect stdin and stdout to read from input file and write to output file
        original_stdin = sys.stdin
        original_stdout = sys.stdout

        try:
            with open(input_filepath, 'r') as infile, open(output_filepath, 'w') as outfile:
                sys.stdin = infile
                sys.stdout = outfile

                # Read the number of test cases for the current input file
                T = int(sys.stdin.readline())
                for _ in range(T):
                    # Call the solution function for each test case
                    result = solve_problem_instance()
                    sys.stdout.write(str(result) + '\n') # Write result to output file
        finally:
            # Restore original stdin and stdout regardless of errors
            sys.stdin = original_stdin
            sys.stdout = original_stdout
        print(f"Generated output for {input_filepath} to {output_filepath}")

# This part would be executed to generate all outputs when the script is run
if __name__ == '__main__':
    generate_outputs()
