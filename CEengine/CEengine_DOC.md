# CEengine Documentation

## Context: AI-Powered Problem Creation & CE Pipeline Endpoints

This platform supports automated, AI-powered coding problem creation and seamless integration with the CE (Remote Code Execution) pipeline. The workflow and endpoints are as follows:

### 1. AI-Powered Problem Creation Endpoints

- **POST /genai/problem**
  - Description: Uses an LLM (e.g., Gemini) to generate a new coding problem based on tags, difficulty, and a reference solution.
  - Request body: `{ tags, difficulty, expectedComplexity, solution }`
  - Response: `{ ok, sessionId, genaiResponse }` (includes generated problem statement, input/output format, constraints, samples, and solution)

- **POST /genai/testcaseGeneration**
  - Description: Uses the LLM to generate Python scripts for test case and output generation, based on the previously generated problem.
  - Request body: `{ sessionId, numTestcases, testcaseTypes, expectedComplexity }`
  - Response: `{ ok, inputGenCode, outputGenCode }` (Python code for generating testcases and outputs)

### 2. CE Pipeline Endpoint

- **POST /CEPipeline**
  - Description: Submits a job to the CE engine, including input/output code and problem metadata.
  - Request body: `{ jobid, inputCode, outputCode, MetaData }`
  - Response: `{ ok }` (job is queued for execution)

### 3. Pipeline Orchestration Endpoint

- **GET /routeCE/pipeline/:id**
  - Description: Orchestrates the process of sending generated code and metadata to the CE pipeline for execution and artifact generation.
  - Path parameter: `id` (session/job identifier)

---

## Overview

The **CEengine** (Remote Code Execution Engine) is a Node.js-based microservice designed to safely execute user-submitted Python code in isolated Docker containers, manage job queues, and generate problem documentation and test artifacts. It is typically used in coding platforms for automated code evaluation, such as online judges or coding contest systems.

---

## Directory Structure

- **CreateMdFile.js**: Generates a Markdown file summarizing the coding problem, including statement, input/output formats, constraints, samples, and solution.
- **runInDocker.js**: Utility to execute Python scripts inside Docker containers with resource limits.
- **server.js**: Express server exposing API endpoints to submit jobs, fetch jobs, and clear the job queue.
- **sqliteDB.js**: Sets up and manages the SQLite database for job storage and status tracking.
- **worker.js**: Main job processor. Continuously polls for queued jobs, executes code, generates artifacts, zips results, and updates job status.
- **jobs.db**: SQLite database file storing job records.
- **package.json**: Node.js dependencies and scripts for the CEengine.
- **node_modules/**: Installed Node.js packages.
- **package-lock.json**: Lock file for npm dependencies.
- **[jobid]/**: Temporary folders created per job, containing code, results, and artifacts.
- **[jobid].zip**: Zipped archive of all job artifacts for download or archival.

---

## Main Components

### 1. server.js

- **POST /CEPipeline**: Accepts job submissions (input/output code, metadata), stores them in the database.
- **GET /getJobs**: Returns all jobs in the database.
- **GET /deleteJobs**: Clears all jobs from the database.
- Runs on port 3000.

### 2. worker.js

- Continuously fetches the next queued job, marks it as running.
- Creates a working directory for the job, writes input/output Python code files.
- Executes both input and output code in Docker containers using `runInDocker.js`.
- Generates a Markdown problem statement using `CreateMdFile.js`.
- Copies testcases, zips testcases and the entire job folder.
- Updates job status to completed or error, cleans up temporary files.

### 3. runInDocker.js

- Runs a specified Python script in a Docker container (`python:3.11-slim` image).
- Supports resource limits (memory, CPU, timeout).
- Returns stdout, stderr, exit code, and error info.

### 4. CreateMdFile.js

- Reads job metadata (problem statement, input/output format, constraints, samples, solution).
- Generates a well-formatted Markdown file (`problem.md`) for the job.

### 5. sqliteDB.js

- Initializes a SQLite database (`jobs.db`) with a `jobs` table.
- Stores job ID, status, input/output code, metadata, and timestamps.
- Exports a database instance for use in other modules.

---

## Workflow

1. **Job Submission**: A job is submitted via the `/CEPipeline` endpoint with code and metadata.
2. **Job Queueing**: The job is stored in the SQLite database with status 'queued'.
3. **Job Processing**: The worker process claims the next queued job, marks it as 'running', and processes it:
   - Writes code files
   - Executes code in Docker
   - Generates Markdown documentation
   - Packages testcases and results
   - Updates job status
   - Cleans up temporary files
4. **Result Retrieval**: Artifacts (e.g., zipped job folder) can be accessed for download or further processing.

---

## Security & Best Practices

- **Docker Isolation**: All user code runs in Docker containers to prevent host compromise.
- **Resource Limits**: Memory, CPU, and timeout limits are enforced during code execution.
- **Cleanup**: Temporary files and folders are removed after job completion.
- **Error Handling**: Job status is updated to 'error' on failure, with logs for debugging.

---

## Dependencies

- express
- better-sqlite3
- archiver
- fs-extra

---

## Extending CEengine

- Add new endpoints to `server.js` for more job management features.
- Enhance `worker.js` to support more languages or custom grading logic.
- Integrate with external storage or messaging systems for scalability.

---

## Example Job Metadata (MetaData field)

```json
{
  "problemStatement": "Sum two numbers.",
  "inputFormat": "Two integers a and b.",
  "outputFormat": "Single integer, the sum.",
  "constraints": "1 <= a, b <= 1000",
  "sampleInput": "2 3",
  "sampleOutput": "5",
  "solution": "print(sum(map(int, input().split())))"
}
```

---
