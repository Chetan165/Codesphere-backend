// runInDocker.js
// Utility to run a Python script in a Docker container and capture output

import { exec } from "child_process";
import path from "path";

/**
 * Runs a Python script in Docker.
 * @param {string} jobDir - Directory to mount (absolute path recommended)
 * @param {string} scriptName - Name of the Python file to run (e.g., inputCode.py)
 * @param {object} options - { timeoutMs, memoryLimit, cpuLimit }
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number, error?: string}>}
 */
export default function runInDocker(jobDir, scriptName, options = {}) {
  return new Promise((resolve) => {
    const absJobDir = path.resolve(jobDir);
    let dockerCmd = `docker run --rm`;
    if (options.memoryLimit) dockerCmd += ` --memory=${options.memoryLimit}`;
    if (options.cpuLimit) dockerCmd += ` --cpus=${options.cpuLimit}`;
    dockerCmd += ` -v "${absJobDir}:/workspace"`;
    dockerCmd += ` -w /workspace python:3.11-slim python /workspace/${scriptName}`;

    exec(
      dockerCmd,
      { timeout: options.timeoutMs || 10000 },
      (error, stdout, stderr) => {
        resolve({
          stdout,
          stderr,
          exitCode: error && error.code ? error.code : 0,
          error:
            error && error.killed ? "Timeout or resource limit exceeded" : null,
        });
      },
    );
  });
}
