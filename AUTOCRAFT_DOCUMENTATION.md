# AutoCraft: AI-Powered Problem & Test Case Generation System

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Endpoints](#endpoints)
4. [Core Components](#core-components)
5. [Question Creation Pipeline](#question-creation-pipeline)
6. [Test Case & Output Generation](#test-case--output-generation)
7. [Code Execution Engine (CEEngine)](#code-execution-engine-ceengine)
8. [Database & Job Management](#database--job-management)
9. [System Load & Concurrency Issues](#system-load--concurrency-issues)
10. [Potential Issues & Solutions](#potential-issues--solutions)
11. [Data Flow Examples](#data-flow-examples)

---

## Overview

**AutoCraft** is an intelligent problem and test case generation system designed to automatically create coding interview questions and their accompanying test cases. The system leverages:

- **Google Gemini API** for AI-powered problem and test case code generation
- **SQLite Database** for job queue management
- **Docker** for isolated Python code execution
- **Node.js/Express** for API and worker orchestration
- **Archiver** for packaging results

### Key Features:
- ✅ Generates programming problems with specified difficulty and tags
- ✅ Creates diverse test cases (sample, edge, large, generic)
- ✅ Generates test case input/output with reference solutions
- ✅ Executes code in isolated Docker containers
- ✅ Manages asynchronous job queues
- ✅ Packages results for download

---

## Architecture

### High-Level Flow

```
User Request
    ↓
[1] GenAI Problem Generation (Gemini API)
    ↓
Session Created (uploads/{sessionId}/)
    ↓
[2] GenAI Testcase Code Generation (Gemini API)
    ↓
Generated Code Stored
    ↓
[3] Job Submission to CEEngine (via runPipeline)
    ↓
SQLite Job Queue (status: queued)
    ↓
Worker Process (Polling Every 5s)
    ↓
[4] Code Execution in Docker
    ↓
Input/Output Generation
    ↓
[5] Artifact Generation (problem.md, zips)
    ↓
Job Status: completed
    ↓
[6] Download Results
```

### Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **API Server** | Node.js/Express | Handle HTTP requests, generate problems/testcases |
| **Job Queue** | SQLite (better-sqlite3) | Queue management and job state tracking |
| **Code Generation** | Google Gemini API | Generate problems and test case code using LLM |
| **Code Execution** | Docker + Python 3.11 | Isolated, safe execution of generated code |
| **File Management** | fs, fs-extra, archiver | Create/manage directories, compress artifacts |
| **Temp Storage** | `uploads/{sessionId}/` | Store intermediate results during generation |
| **Job Processing** | Node.js Worker (worker.js) | Poll queue, execute jobs, manage artifacts |

---

## Endpoints

### 1. **POST** `/genai/problem`
**Purpose**: Generate a new coding problem using Gemini API

**Request Body**:
```json
{
  "tags": ["array", "sorting"],
  "difficulty": "medium",
  "expectedComplexity": "O(n log n)",
  "solution": "def sort_arr(arr):\n    return sorted(arr)",
  "questionStyle": "General"
}
```

**Response**:
```json
{
  "ok": true,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "genaiResponse": {
    "problemStatement": "Given an array of integers...",
    "inputFormat": "First line contains T, number of testcases...",
    "outputFormat": "For each testcase, output...",
    "constraints": "1 ≤ T ≤ 100, 1 ≤ N ≤ 10^5",
    "sampleInput": "1\n3\n3 1 2",
    "sampleOutput": "1 2 3",
    "solution": "def solve():\n    ..."
  }
}
```

**Stored**:
- Saves input parameters to `uploads/{sessionId}/input.json`
- Saves Gemini response to `uploads/{sessionId}/genai_response.json`

**Key Logic**:
```javascript
// In ProblemAutomationController.genAIProblem()
1. Create unique sessionId (UUID v4)
2. Create temp directory: uploads/{sessionId}/
3. Save initial input data to input.json
4. Craft detailed prompt for Gemini API including:
   - Tags, difficulty level
   - Expected time/space complexity
   - Reference solution
   - Question style
5. Call Gemini 2.5 Flash model
6. Parse JSON response (with error recovery logic)
7. Save parsed response to genai_response.json
```

---

### 2. **POST** `/genai/testcaseGeneration`
**Purpose**: Generate Python code for test case input and output generation

**Request Body**:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "numTestcases": 4,
  "testcaseTypes": ["sample", "edge", "large", "generic"],
  "expectedComplexity": "O(n log n)"
}
```

**Response**:
```json
{
  "ok": true,
  "inputGenCode": "import os\nimport random\n\ndef generate_input00():\n    # Sample testcase code...",
  "outputGenCode": "def solve(t, n, arr):\n    return sorted(arr)\n\n# Main code to run solution..."
}
```

**Stored**:
- Saves `inputGenCode` to `uploads/{sessionId}/inputGenCode.py`
- Saves `outputGenCode` to `uploads/{sessionId}/outputGenCode.py`

**Generated Functions**:
The Gemini API generates Python code with functions like:
- `generate_input00()`: Sample test case (uses provided sample)
- `generate_input01()`: Edge case test (min/max values, boundary conditions)
- `generate_input02()`: Large/maximum test case (stress-tests solution)
- `generate_input03()`: Generic random test case

**Key Prompt Strategy**:
```
For "sample": Use the provided sample input/output
For "edge": Target boundary conditions specific to the problem
For "large": MAXIMUM T and N values, designed to TLE brute-force approaches
For "generic": Valid random values within constraints
```

---

### 3. **POST** `/routeCE/pipeline/:id`
**Purpose**: Submit the generated code to the CEEngine for execution

**Request Body** (from client or genAITestcases response):
```json
{
  "jobid": "550e8400-e29b-41d4-a716-446655440000",
  "inputCode": "# Python code from inputGenCode.py",
  "outputCode": "# Python code from outputGenCode.py",
  "MetaData": {
    "genaiResponse": {
      "problemStatement": "...",
      "inputFormat": "...",
      "outputFormat": "...",
      "constraints": "...",
      "sampleInput": "...",
      "sampleOutput": "...",
      "solution": "..."
    }
  }
}
```

**Backend Logic** (runPipeline):
```javascript
async runPipeline(req, res) {
  const data = req.body;
  // Forward request to CEEngine server on port 5000
  fetch("http://localhost:5000/CEPipeline", {
    method: "POST",
    body: JSON.stringify(data)
  })
}
```

**CEEngine Processing** (server.js):
```javascript
POST /CEPipeline → Insert job into SQLite with status='queued'
```

---

### 4. **GET** `/Download/:id`
**Purpose**: Download the packaged results (zip file)

**Response**:
- Returns `{jobid}.zip` containing:
  - `problem.md`: Markdown formatted problem statement
  - `input/`: Directory with generated input files (input00.txt, input01.txt, ...)
  - `output/`: Directory with expected outputs (output00.txt, output01.txt, ...)
  - `inputCode.py`, `outputCode.py`: The generated code files
  - `Testcases.zip`: Separate archive of just the testcases

**Backend Logic**:
```javascript
async downloadTestcases(req, res) {
  const id = req.params.id;
  // Proxy request to CEEngine's /download/:id endpoint
  const getFile = await axios(`http://localhost:5000/download/${id}`);
  // Stream zip file to client
  getFile.data.pipe(res);
}
```

---

### 5. **GET** `/autocraft/tags`
**Purpose**: Fetch available problem tags/categories

**Response**:
```json
{
  "tags": ["array", "sorting", "greedy", "dp", "graph", "string", ...]
}
```

**Source**: Reads from `metadata/Qtags.json`

---

## Core Components

### 1. ProblemAutomationController.js (Main API Controller)

**Key Methods**:

#### `genAIProblem(req, res)`
- **Input**: tags, difficulty, expectedComplexity, solution, questionStyle
- **Process**:
  1. Generate UUID for sessionId
  2. Create directory structure in `uploads/{sessionId}/`
  3. Save input parameters
  4. Build comprehensive Gemini prompt with:
     - Problem requirements
     - Constraints based on complexity
     - Reference solution
  5. Call Gemini API with streaming response handling
  6. Parse and repair JSON response (AI responses often have escaping issues)
  7. Save response to `genai_response.json`
- **Output**: sessionId and genaiResponse object
- **Error Handling**: Implements JSON repair strategy for malformed AI responses

#### `genAITestcases(req, res)`
- **Input**: sessionId, numTestcases, testcaseTypes, expectedComplexity
- **Process**:
  1. Load problem data from previous session
  2. Build Gemini prompt defining testcase types:
     - **Sample**: Hand-provided example
     - **Edge**: Boundary conditions
     - **Large**: Maximum constraints (for TLE detection)
     - **Generic**: Random valid inputs
  3. Request code generation for:
     - `inputGenCode.py`: Functions to generate each testcase type
     - `outputGenCode.py`: Execute solution and generate expected outputs
  4. Parse response and save Python files
- **Output**: inputGenCode and outputGenCode

#### `runPipeline(req, res)`
- **Input**: Job data with inputCode, outputCode, metadata
- **Process**: Forward request to CEEngine's `/CEPipeline` endpoint
- **Output**: Confirmation that job was queued

#### `downloadTestcases(req, res)`
- **Input**: Job ID
- **Process**: Stream zip file from CEEngine
- **Output**: Zipped artifacts for download

---

### 2. Routes (AdminRoutes.js & Autocraft.js)

**AdminRoutes.js** mounts all problem automation endpoints:
```javascript
Router.post("/genai/problem", genAIProblem);                    // Step 1
Router.post("/genai/testcaseGeneration", genAITestcases);      // Step 2
Router.post("/routeCE/pipeline/:id", runPipeline);             // Step 3
Router.get("/Download/:id", downloadTestcases);                 // Step 4
Router.use("/autocraft", AutocraftRouter);                      // Tags endpoint
```

**Autocraft.js** provides metadata:
```javascript
Router.get("/tags", (req, res) => res.json(tags));
```

---

## Question Creation Pipeline

### Gemini Prompt Architecture for Problem Generation

The system uses a **multi-part prompt** to guide Gemini API for problem creation:

#### Prompt Structure:
```
1. Role Definition: "You are an expert coding problem setter"
2. Input Specification:
   - Tags: Problem categories (array, sorting, DP, etc.)
   - Difficulty: Level (easy, medium, hard)
   - Complexity: Expected O() time complexity
   - Reference Solution: Seed for problem context
   - Style: Problem style preference

3. Requirements:
   - Clear and concise problem statement
   - Input format with T-testcases design
   - Output format specification
   - Tight constraints suited to complexity
   - Sample input/output
   - Reference Python solution

4. Constraints on Complexity:
   - O(n): T can be 100, N ≤ 10^5
   - O(n log n): T can be 100, N ≤ 10^5
   - O(n²): T can be 10, N ≤ 10^3
   - Higher: More restrictive limits
```

#### JSON Sanitization Strategy:

The Gemini API sometimes returns malformed JSON due to:
- Unescaped newlines in solution code
- Incorrect escape sequences
- Embedded quotes and special characters

**Recovery Algorithm**:
```javascript
1. Remove code block markers (```json, ```)
2. Try direct JSON.parse()
3. If fails, extract JSON from response using regex: /{[\s\S]*}/
4. Remove trailing commas before closing braces
5. If still fails, field-by-field parsing using regex patterns
6. Replace literal newlines with \n in each field
7. Rebuild valid JSON object
```

---

## Test Case & Output Generation

### Gemini-Generated Test Case Functions

#### Structure of Generated inputGenCode.py:

```python
import os
import random

# Provided constraints from problem schema
T_MAX = 100
N_MAX = 100000

def generate_input00():
    """Sample testcase - uses provided example"""
    # Write sample input from problemStatement
    with open("input/input00.txt", "w") as f:
        f.write("1\n3\n3 1 2\n")

def generate_input01():
    """Edge case - test boundaries"""
    # Minimum values
    with open("input/input01.txt", "w") as f:
        f.write("1\n1\n1\n")
    # Maximum values
    with open("input/input02.txt", "w") as f:
        f.write("1\n100000\n" + " ".join(str(i) for i in range(100000)) + "\n")

def generate_input02():
    """Large testcase - maximum constraints for TLE detection"""
    # MAXIMUM T and N values to stress-test solutions
    with open("input/input03.txt", "w") as f:
        f.write("100\n")  # Maximum T
        for t in range(100):
            f.write(f"{100000}\n")  # Maximum N
            f.write(" ".join(str(random.randint(1, 10**9)) for _ in range(100000)) + "\n")

def generate_input03():
    """Generic random testcase"""
    with open("input/input04.txt", "w") as f:
        # Random valid inputs within constraints
        t = random.randint(1, T_MAX)
        f.write(f"{t}\n")
        for _ in range(t):
            n = random.randint(1, N_MAX)
            f.write(f"{n}\n{' '.join(str(random.randint(1, 10**9)) for _ in range(n))}\n")
```

#### Structure of Generated outputGenCode.py:

```python
import sys
sys.path.insert(0, '/workspace')

# Include the provided solution code
def solve(n, arr):
    return sorted(arr)

# Main execution
def main():
    # Read each input file, execute solution, save output
    for i in range(10):  # Assuming 10 testcases
        with open(f'input/input{i:02d}.txt', 'r') as f:
            lines = f.readlines()
        
        # Parse input according to problem format
        t = int(lines[0])
        output_lines = []
        
        line_idx = 1
        for tc in range(t):
            n = int(lines[line_idx])
            arr = list(map(int, lines[line_idx + 1].split()))
            line_idx += 2
            
            # Execute solution
            result = solve(n, arr)
            
            # Format and save output
            output_lines.append(' '.join(map(str, result)))
        
        # Save to output file
        with open(f'output/output{i:02d}.txt', 'w') as f:
            f.write('\n'.join(output_lines))

if __name__ == "__main__":
    main()
```

### Test Case Types Details:

#### 1. **Sample Testcase** (input00.txt / output00.txt)
- Direct copy of provided sample input/output
- Small, illustrative, easy to understand
- Used for quick verification

#### 2. **Edge Case** (input01.txt, input02.txt, etc.)
- **Minimum values**: Constraints at lower bounds
- **Maximum single element**: One value at max
- **Problem-specific edges**: 
  - Array already sorted (for sorting problems)
  - All elements equal
  - Single element
- Designed to catch off-by-one errors

#### 3. **Large/Stress Test** (input0X.txt)
- **Complexity**: T and N at maximum allowed values
- **Purpose**: Force inadequate algorithms to Time Limit Exceed (TLE)
- **Design**: Uses complexity-specific patterns:
  - For O(n log n) sorts: T=100, N=10^5 random array
  - For O(n²) algorithms: T=10, N=10^3 reverse-sorted or worst-case patterns
  - Special cases: Monotomic sequences, zig-zags, deeply nested structures

#### 4. **Generic Testcase** (input0X.txt)
- Random valid values within constraints
- Ensures diverse input coverage
- Catches randomness-dependent edge cases

---

## Code Execution Engine (CEEngine)

### Architecture Overview

The CEEngine is a **separate microservice** running on port 5000 that handles:
- Job queueing and status management
- Isolated Python code execution in Docker
- Artifact generation (markdown, zips)
- Results packaging

### Components:

#### 1. **server.js** (Express Server)

**Port**: 5000

**Endpoints**:
```javascript
POST /CEPipeline
  - Receives job submission
  - Stores in SQLite database
  - Sets initial status='queued'

GET /getJobs
  - Returns all jobs in database
  - Used for monitoring

GET /deleteJobs
  - Clears entire job queue
  - Use with caution

GET /download/:id
  - Streams zipped job results
  - Returns {jobid}.zip file
```

#### 2. **worker.js** (Background Job Processor)

**Behavior**: Infinite loop, polls every 5 seconds

**Processing Steps**:
```javascript
while (true) {
  // 1. Claim a queued job
  const job = UPDATE jobs SET status='running' WHERE status='queued' LIMIT 1

  if (job) {
    try {
      // 2. Create working directory
      fs.mkdirSync(`./${jobid}/`)
      
      // 3. Write and execute inputCode.py
      fs.writeFileSync(`./inputCode.py`, job.inputCode)
      await runInDocker(`./`, `inputCode.py`)
      // Creates input/input00.txt, input01.txt, ...
      
      // 4. Write and execute outputCode.py
      fs.writeFileSync(`./outputCode.py`, job.outputCode)
      await runInDocker(`./`, `outputCode.py`)
      // Creates output/output00.txt, output01.txt, ...
      
      // 5. Generate problem.md
      await CreateMdFile(job)
      
      // 6. Package testcases
      cp input/* Testcases/input/
      cp output/* Testcases/output/
      zip Testcases.zip from Testcases/
      
      // 7. Package entire job
      zip {jobid}.zip from ./{jobid}/
      
      // 8. Update status
      UPDATE jobs SET status='completed' WHERE jobid=?
      
    } catch (error) {
      UPDATE jobs SET status='error' WHERE jobid=?
      log error
    } finally {
      // 9. Cleanup temporary directory
      rm -rf ./{jobid}/
    }
  }
  
  // 10. Sleep 5 seconds
  await sleep(5000)
}
```

#### 3. **runInDocker.js** (Docker Execution Utility)

```javascript
function runInDocker(jobDir, scriptName, options = {}) {
  return new Promise((resolve) => {
    // Build Docker command
    let cmd = 'docker run --rm'
    
    // Optional resource limits
    if (options.memoryLimit) 
      cmd += ` --memory=${options.memoryLimit}`
    if (options.cpuLimit) 
      cmd += ` --cpus=${options.cpuLimit}`
    
    // Mount job directory and run script
    cmd += ` -v "${jobDir}:/workspace"`
    cmd += ` -w /workspace`
    cmd += ` python:3.11-slim python /workspace/${scriptName}`
    
    // Execute with timeout
    exec(cmd, { timeout: options.timeoutMs || 10000 }, 
      (error, stdout, stderr) => {
        resolve({
          stdout,
          stderr,
          exitCode: error ? error.code : 0,
          error: error && error.killed ? "Timeout exceeded" : null
        })
      }
    )
  })
}
```

**Docker Image**: `python:3.11-slim` - Lightweight Python environment

**Resource Limits** (Optional):
- `memoryLimit`: e.g., `512m`
- `cpuLimit`: e.g., `1` (1 CPU)
- `timeoutMs`: Default 10 seconds

#### 4. **CreateMdFile.js** (Documentation Generator)

```javascript
async function CreateMdFile(job) {
  let meta = JSON.parse(job.MetaData).genaiResponse
  
  const mdContent = `
# Problem Statement
${meta.problemStatement}

## Input Format
${meta.inputFormat}

## Output Format
${meta.outputFormat}

## Constraints
${meta.constraints}

## Sample Input
\`\`\`
${meta.sampleInput}
\`\`\`

## Sample Output
\`\`\`
${meta.sampleOutput}
\`\`\`

## Solution
\`\`\`python
${meta.solution}
\`\`\`
  `
  
  fs.writeFileSync(`./${job.jobid}/problem.md`, mdContent)
}
```

#### 5. **sqliteDB.js** (Database Schema)

```javascript
db.prepare(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jobid TEXT,                    -- Unique job identifier
    status TEXT CHECK(status IN 
      ('queued', 'running', 'completed', 'error'))
      DEFAULT 'queued',
    inputCode TEXT,                 -- inputCode.py content
    outputCode TEXT,                -- outputCode.py content
    MetaData TEXT,                  -- JSON string with problem data
    createdAt DATETIME 
      DEFAULT CURRENT_TIMESTAMP
  )
`).run()
```

**Job Status Flow**:
```
queued → running → completed
              ↓
            error
```

---

## Database & Job Management

### SQLite Schema

#### Table: `jobs`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | INTEGER PRIMARY KEY | Auto-increment internal ID |
| `jobid` | TEXT | Unique job identifier (UUID) |
| `status` | TEXT | Job state (queued, running, completed, error) |
| `inputCode` | TEXT | Python code for generating test inputs |
| `outputCode` | TEXT | Python code for generating expected outputs |
| `MetaData` | TEXT | Stringified JSON with problem details |
| `createdAt` | DATETIME | Timestamp of job creation |

### Job Lifecycle

```
1. Job Created
   - User calls POST /genai/problem
   - sessionId generated
   - Problem data in memory (uploads/{sessionId}/)

2. Test Code Generated
   - User calls POST /genai/testcaseGeneration
   - inputCode.py and outputCode.py generated
   - Still in memory until submission

3. Job Submission
   - User calls POST /routeCE/pipeline/:id
   - Data forwarded to CEEngine /CEPipeline
   - Job inserted into SQLite with status='queued'

4. Job Processing by Worker
   - Worker polls every 5 seconds
   - Claims next queued job
   - Sets status='running'
   - Executes inputCode.py and outputCode.py in Docker
   - Generates problem.md and artifacts
   - Sets status='completed'

5. Result Download
   - User calls GET /Download/:id
   - CEEngine streams {jobid}.zip file
```

### Database Access Pattern

**Using better-sqlite3** (synchronous):
```javascript
// Insert job
db.prepare(
  "INSERT INTO jobs(jobid, inputCode, outputCode, MetaData) VALUES (?,?,?,?)"
).run(data.jobid, data.inputCode, data.outputCode, data.MetaData)

// Fetch jobs
const jobs = db.prepare("SELECT * FROM jobs").all()

// Update status (atomic with RETURNING)
const job = db.prepare(`
  UPDATE jobs SET status='running' 
  WHERE jobid=(SELECT jobid FROM jobs WHERE status='queued' LIMIT 1)
  RETURNING *
`).get()

// Delete all jobs
db.prepare("DELETE FROM jobs").run()
```

---

## System Load & Concurrency Issues

### Current Architecture Limitations

#### 1. **Single Worker Process**
- Only **one job processed at a time**
- Worker processes jobs serially in infinite loop
- If one job takes 30 seconds, next job waits 30 seconds in queue
- No parallelization

**Issue**: In high-traffic scenarios:
```
Queue: [Job1, Job2, Job3, Job4, Job5]
Time 0s:  Worker claims Job1
Time 30s: Job1 completes, Worker claims Job2
Time 60s: Job2 completes, Worker claims Job3
...
Time 150s: Job5 finally starts
```

**Impact**: Latency scales linearly with queue depth

#### 2. **Fixed 5-Second Poll Interval**
```javascript
await sleep(5000) // Always sleeps 5 seconds
```

**Issue**: 
- If no jobs: Needless database queries every 5 seconds
- If heavy load: 5 seconds can be wasted waiting for next claim attempt
- Not event-driven (no push mechanism)

#### 3. **Blocking Docker Execution**
```javascript
// runInDocker waits for process completion (timeout 10s default)
exec(dockerCmd, { timeout: 10000 }, callback)
```

**Issue**: 
- Long-running code blocks worker
- If solution takes 8 seconds, queue is blocked
- No timeout enforcement for generated code (could hang indefinitely)

#### 4. **Memory Accumulation**
- Docker containers cleaned up, but:
- SQLite database grows indefinitely
- No automatic job archival or cleanup policy
- Old completed jobs remain in database

#### 5. **No Resource Limits by Default**
```javascript
// Docker run without enforced limits
let dockerCmd = `docker run --rm -v "${absJobDir}:/workspace"...`
// Missing: --memory=512m --cpus=1
```

**Issue**:
- Malicious code could consume all host resources
- One bad job crashes entire Docker daemon
- No per-job resource quotas

#### 6. **Concurrent Database Access**
- Multiple API requests could submit jobs simultaneously
- `INSERT` operations not fully atomic if race conditions
- No transaction management

### Busy System Challenges

#### Scenario: High Traffic (100s of submission requests)

1. **API Bottleneck**: All jobs inserted quickly, but worker can only process one
2. **Memory Pressure**: Large MetaData JSON fields accumulate in database
3. **Disk I/O**: Creating hundreds of job directories temporarily
4. **Docker Daemon Stress**: Launching containers repeatedly
5. **Network Latency**: Download endpoint slows under load

#### Failure Modes

| Condition | Symptom | Impact |
|-----------|---------|--------|
| Worker crashes | Jobs stuck in 'running' | Queue deadlock |
| Database locks | INSERT blocks | API responds slowly |
| Docker daemon OOM | Container launch fails | Jobs marked 'error' |
| Disk full | Can't create job dirs | Cleanup fails, disk stays full |
| Network timeout | Long downloads fail | Users get incomplete zips |

---

## Potential Issues & Solutions

### Issue 1: JSON Parsing Failures from Gemini API

**Problem**: 
- Gemini sometimes returns malformed JSON with unescaped characters
- Solution code contains literal newlines, quotes, special chars
- Parsing fails, endpoint returns 500 error

**Symptoms**:
```
Error: Unexpected token } in JSON at position 2341
Error context: ...solution":"def foo():\n  print(...
```

**Current Solution**:
The controller implements a **multi-stage repair strategy**:
1. Remove markdown code blocks
2. Extract JSON using regex
3. Remove trailing commas
4. Field-by-field regex parsing with escaping

**Recommendation**:
```javascript
// Request Gemini to output strictly escaped JSON
const prompt = `
  CRITICAL: Return ONLY valid JSON.
  - Escape all newlines as \\n (not literal newlines)
  - Escape all quotes as \\"
  - Escape all backslashes as \\\\
  - Do NOT include any text outside the JSON braces
  
  Example format:
  {"solution": "def foo():\\n    print('hello')"}
`
```

### Issue 2: Worker Process Single Point of Failure

**Problem**: 
- If worker.js crashes, queue backs up indefinitely
- No monitoring or automatic restart
- No dead letter queue for failed jobs

**Solution Options**:

#### Option A: PM2 Process Manager
```bash
npm install pm2
pm2 start worker.js --name "ce-worker"
pm2 save
pm2 startup
```

#### Option B: Systemd Service
```ini
[Unit]
Description=CEEngine Worker
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/path/to/CEengine
ExecStart=/usr/bin/node worker.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

#### Option C: Docker Container with Restart Policy
```yaml
# docker-compose.yaml
services:
  ce-worker:
    build: ./CEengine
    restart: always
    environment:
      - NODE_ENV=production
```

### Issue 3: Database Lock Contention

**Problem**:
- SQLite locks entire database for writes
- Concurrent INSERT/UPDATE causes contention
- API slowness under load

**Current Synchronous Pattern**:
```javascript
// Each request blocks until complete
db.prepare(...).run()
db.prepare(...).get()
```

**Solution**: Migrate to PostgreSQL
```javascript
// Use connection pooling
const { Pool } = require('pg');
const pool = new Pool({
  max: 20,        // Max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Non-blocking queries
await pool.query('INSERT INTO jobs...')
```

### Issue 4: No Job Timeout Enforcement

**Problem**:
- Long-running solution code blocks worker indefinitely
- Docker timeout (10s) may be too short for legitimate use
- No adaptive timeout based on complexity

**Current Code**:
```javascript
exec(dockerCmd, { timeout: options.timeoutMs || 10000 }, ...)
```

**Solution**:
```javascript
// Adaptive timeout based on complexity
const getTimeout = (expectedComplexity) => {
  const timeoutMap = {
    'O(1)': 1000,
    'O(log n)': 2000,
    'O(n)': 5000,
    'O(n log n)': 10000,
    'O(n²)': 30000,
    'O(n³)': 60000,
  }
  return timeoutMap[expectedComplexity] || 10000
}

// In worker
const timeout = getTimeout(meta.expectedComplexity)
await runInDocker(folderPath, "inputCode.py", { timeoutMs: timeout })
```

### Issue 5: No Resource Limits by Default

**Problem**:
- Malicious code could consume all memory/CPU
- No per-job isolation beyond Docker container
- Host system vulnerable

**Solution**:
```javascript
// In worker.js
const getResourceLimits = (expectedComplexity) => {
  const limits = {
    'O(1)': { memoryLimit: '256m', cpuLimit: '0.5' },
    'O(n)': { memoryLimit: '512m', cpuLimit: '1' },
    'O(n log n)': { memoryLimit: '1g', cpuLimit: '2' },
    'O(n²)': { memoryLimit: '2g', cpuLimit: '2' },
  }
  return limits[expectedComplexity] || { memoryLimit: '512m', cpuLimit: '1' }
}

// In runInDocker
const options = getResourceLimits(meta.expectedComplexity)
// Already supports options.memoryLimit and options.cpuLimit
```

### Issue 6: No Job Archival or Data Retention Policy

**Problem**:
- Database grows indefinitely
- Completed jobs consume space permanently
- Cleanup only via manual DELETE operation

**Solution**: Implement retention policy
```javascript
// Add scheduled job cleaner
const schedule = require('node-schedule');

// Run daily at 2 AM
schedule.scheduleJob('0 2 * * *', () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const deletedCount = db.prepare(
    "DELETE FROM jobs WHERE createdAt < ? AND status='completed'"
  ).run(thirtyDaysAgo).changes;
  
  console.log(`Archived ${deletedCount} old jobs`);
});
```

### Issue 7: No Error Logging or Observability

**Problem**:
- Errors logged to console only
- No structured logging, metrics, or alerts
- Hard to debug production issues

**Solution**: Implement structured logging
```javascript
// Use winston or pino
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// In worker
logger.info('[CE_WORKER]', {
  event: 'job_claimed',
  jobid: job.jobid,
  timestamp: new Date(),
});
logger.error('[CE_WORKER]', {
  event: 'job_failed',
  jobid: job.jobid,
  error: err.message,
  stack: err.stack,
});
```

### Issue 8: No Input Validation for Generated Code

**Problem**:
- No sandbox validation before executing generated code
- Buggy AI-generated code could cause errors
- Syntax errors crash job execution

**Solution**: Pre-flight validation
```javascript
// Before executing in Docker, validate Python syntax
const { PythonShell } = require('python-shell');

async function validatePythonCode(code) {
  return new Promise((resolve, reject) => {
    // Use python -m py_compile to check syntax
    exec(`python -m py_compile -`, (error, stdout, stderr) => {
      if (error) reject(new Error(`Syntax error: ${stderr}`));
      else resolve(true);
    });
  });
}

// In worker
try {
  await validatePythonCode(job.inputCode);
  await validatePythonCode(job.outputCode);
  // Now safe to execute
} catch (err) {
  db.prepare("UPDATE jobs SET status=? WHERE jobid=?")
    .run("error", jobid);
  // Log validation error for debugging
}
```

---

## Data Flow Examples

### Example 1: Complete End-to-End Flow

```
User Request:
POST /genai/problem
{
  tags: ["array", "binary-search"],
  difficulty: "medium",
  expectedComplexity: "O(log n)",
  solution: "def binary_search(arr, target):\n    l, r = 0, len(arr)-1\n    while l <= r:\n        m = (l+r)//2\n        if arr[m] == target: return m\n        elif arr[m] < target: l = m+1\n        else: r = m-1\n    return -1",
  questionStyle: "General"
}

[ProblemAutomationController.genAIProblem]
1. sessionId = "abc123def456..."
2. Create: uploads/abc123def456/
3. Save input.json
4. Build Gemini prompt
5. Call Gemini API ← HTTP Request
6. Receive response
7. Parse & repair JSON
8. Save genai_response.json

Response:
{
  ok: true,
  sessionId: "abc123def456...",
  genaiResponse: {
    problemStatement: "Given a sorted array...",
    inputFormat: "First line T (testcases), for each: N (array size), then N integers",
    outputFormat: "For each testcase, output the index or -1",
    constraints: "1 ≤ T ≤ 100, 1 ≤ N ≤ 10^5, ...",
    sampleInput: "1\n5\n1 3 5 7 9\n5",
    sampleOutput: "2",
    solution: "..."
  }
}

---

User Request:
POST /genai/testcaseGeneration
{
  sessionId: "abc123def456...",
  numTestcases: 4,
  testcaseTypes: ["sample", "edge", "large"],
  expectedComplexity: "O(log n)"
}

[ProblemAutomationController.genAITestcases]
1. Load uploads/abc123def456/genai_response.json
2. Build Gemini prompt with test case types
3. Call Gemini API ← HTTP Request
4. Receive Python code
5. Parse JSON response
6. Save inputGenCode.py
7. Save outputGenCode.py

Response:
{
  ok: true,
  inputGenCode: "import os\nimport random\n\ndef generate_input00():\n    with open('input/input00.txt', 'w') as f:\n        f.write('1\\n5\\n1 3 5 7 9\\n5\\n')\n\ndef generate_input01():\n    # Edge cases...",
  outputGenCode: "# Solution execution code..."
}

---

User Request:
POST /routeCE/pipeline/:id
(with inputGenCode, outputGenCode, metadata)

[ProblemAutomationController.runPipeline]
1. Forward to CEEngine
  fetch("http://localhost:5000/CEPipeline", { ... })

[CEEngine: server.js /CEPipeline]
1. Receive job data
2. Stringify MetaData
3. INSERT INTO jobs(jobid, inputCode, outputCode, MetaData) 
   VALUES ('abc123def456...', '...', '...', '...')
   with status='queued'

Database State:
| jobid | status | inputCode | outputCode | MetaData | createdAt |
|-------|--------|-----------|------------|----------|-----------|
| abc123... | queued | import os... | # Solution... | {...} | 2025-01-15 10:30:00 |

---

[CEEngine: worker.js (5s poll)]
1. UPDATE jobs SET status='running' WHERE status='queued' LIMIT 1
2. Fetch job data
3. Create directory: abc123def456/
4. Write inputCode.py
5. Execute in Docker:
   docker run --rm -v "abc123def456/:/workspace" -w /workspace python:3.11-slim python inputCode.py
   
   [Inside Docker]
   - generate_input00() → creates input/input00.txt
   - generate_input01() → creates input/input01.txt
   - generate_input02() → creates input/input02.txt
   
6. Wait for completion
7. Write outputCode.py
8. Execute in Docker:
   docker run --rm -v "abc123def456/:/workspace" -w /workspace python:3.11-slim python outputCode.py
   
   [Inside Docker]
   - Reads input files
   - Executes solution for each
   - Writes output/output00.txt, output/output01.txt, ...

9. Generate problem.md from metadata
10. Create Testcases/input, Testcases/output
11. Zip: Testcases.zip
12. Zip: abc123def456.zip (entire job folder)
13. UPDATE jobs SET status='completed' WHERE jobid='abc123def456...'
14. rm -rf abc123def456/ (cleanup)

Database State (after):
| jobid | status | ... | createdAt |
|-------|--------|-----|-----------|
| abc123... | completed | ... | 2025-01-15 10:30:00 |

---

User Request:
GET /Download/abc123def456...

[ProblemAutomationController.downloadTestcases]
1. Proxy to CEEngine: GET /download/abc123def456...
2. CEEngine streams: abc123def456.zip
3. User receives zip containing:
   - problem.md
   - input/input00.txt
   - input/input01.txt
   - input/input02.txt
   - output/output00.txt
   - output/output01.txt
   - output/output02.txt
   - inputCode.py
   - outputCode.py
   - Testcases/input/...
   - Testcases/output/...
   - Testcases.zip
```

### Example 2: Error Scenario - Job Failure

```
[CEEngine: worker.js processing]
1. Execute inputCode.py in Docker
2. Python error: "SyntaxError: invalid syntax"
3. Error caught in try-catch
4. UPDATE jobs SET status='error' WHERE jobid=?
5. Log: "[CE_WORKER] Error processing job: abc123... Error: ..."
6. finally: rm -rf abc123def456/ (cleanup even on error)

Database State:
| jobid | status | ... | createdAt |
|-------|--------|-----|-----------|
| abc123... | error | ... | 2025-01-15 10:30:00 |

Potential Causes:
- Gemini API generated invalid syntax
- Container timeout exceeded
- Missing dependencies
- Out of memory
```

### Example 3: Large Load Test

```
Scenario: 50 concurrent submission requests

Time 0s: API receives 50 POST /genai/problem requests
  - 50 genAIProblem calls execute in parallel (Node.js event loop)
  - 50 Gemini API calls made concurrently
  - 50 sessionIds created
  - 50 uploads/{sessionId}/ directories created

Time ~2-5s: Gemini responses arrive
  - 50 genaiResponse.json files saved
  - API returns responses to clients

Time 5s: Users call POST /genai/testcaseGeneration (for 50 problems)
  - 50 genAITestcases calls execute in parallel
  - 50 Gemini API calls for test generation
  - Code parsed and saved

Time 10-15s: Users call POST /routeCE/pipeline/:id (for all 50)
  - 50 jobs INSERT into SQLite database
  - Status='queued' for all 50

Time 15s: Worker polls
  - Claims 1 job (abc123...)
  - Sets status='running'
  - Starts processing

Time 15-45s: Worker executes job 1
  - inputCode.py execution: ~10s
  - outputCode.py execution: ~15s
  - Markdown generation: ~1s
  - Zipping: ~4s

Time 45s: Job 1 complete, Worker claims job 2

Time 90s: Job 2 complete, Worker claims job 3

...

Time 2500s (~40 minutes): All 50 jobs completed

Users waiting: Job 25 still queued after 25 jobs × 30s = 750s = 12.5 minutes
```

**Problem Evident**: Queue latency grows linearly with job count!

**Solution**: Add multiple workers
```javascript
// Run multiple worker.js instances
// worker-1.js, worker-2.js, worker-3.js
// Each runs independently in separate Node processes
// All claim from same SQLite database

With 5 workers: 50 jobs × 30s ÷ 5 = 300s = 5 minutes total
```

---

## Best Practices & Recommendations

### 1. **Job Submission Best Practices**
- Validate input parameters before calling Gemini
- Test reference solutions locally before submission
- Provide tight constraints matching expected complexity
- Use meaningful question styles for better generation

### 2. **Error Handling**
- Always check `ok` field in responses
- Log API failures and retry with exponential backoff
- Implement timeout for long-running operations
- Store raw Gemini responses for debugging

### 3. **Monitoring & Observability**
- Track queue depth: `SELECT COUNT(*) FROM jobs WHERE status='queued'`
- Monitor job completion rate: `SELECT COUNT(*) / 24 as jobs_per_hour FROM jobs WHERE createdAt > datetime('now', '-1 hour')`
- Alert on jobs stuck in 'running' status for > 2 hours
- Log execution times and resource usage

### 4. **Scaling Strategies**
- Deploy multiple worker instances with process managers
- Migrate SQLite to PostgreSQL for concurrent access
- Use message queues (RabbitMQ, Redis) instead of direct database polling
- Implement result caching to avoid re-computation
- Use CDN for downloaded artifacts

### 5. **Infrastructure**
- Run API server and CEEngine workers separately
- Monitor Docker daemon health
- Set up log aggregation (ELK, Splunk)
- Implement health checks on all endpoints
- Use Docker resource constraints (memory, CPU)

---

## Summary

**AutoCraft** is an intelligent, end-to-end system for automated competitive programming problem creation:

1. **Problem Generation**: Uses Gemini API to create diverse, well-constrained problems
2. **Test Generation**: Generates diverse test cases (sample, edge, large, generic)
3. **Code Execution**: Safely executes Python code in Docker containers
4. **Job Queue**: SQLite-based queue for asynchronous processing
5. **Artifact Packaging**: Creates zipped results with problem.md and testcases

**Key Technical Strengths**:
- ✅ Fully automated, no manual intervention needed
- ✅ Docker isolation for safe code execution
- ✅ Comprehensive problem and testcase generation
- ✅ Asynchronous job processing with status tracking

**Key Limitations**:
- ⚠️ Single-threaded worker (serial processing)
- ⚠️ SQLite locks under concurrent load
- ⚠️ Limited error recovery and observability
- ⚠️ No resource limits or timeout enforcement
- ⚠️ JSON parsing fragility with Gemini responses

**Immediate Improvements**:
1. Add PM2 for worker process management & auto-restart
2. Implement structured logging with Winston
3. Add multiple worker instances
4. Migrate to PostgreSQL for better concurrency
5. Implement input validation before code execution
6. Add monitoring and alerting dashboards
