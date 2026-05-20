// runInDocker.js
// Utility to run a Python script in a Docker container and capture output

import { exec } from "child_process";
import path from "path";

const DOCKER_IMAGE = "python:3.11-slim";
let ensureImagePromise = null;

/**
 * Ensures the Python Docker image is available locally.
 * Uses a cached promise so multiple calls don't trigger multiple pulls.
 */
export function ensureDockerImageReady() {
  if (ensureImagePromise) return ensureImagePromise;

  ensureImagePromise = new Promise((resolve) => {
    exec(`docker image inspect ${DOCKER_IMAGE}`, (inspectErr) => {
      if (!inspectErr) {
        resolve({ ready: true, pulled: false });
        return;
      }

      exec(`docker pull ${DOCKER_IMAGE}`, (pullErr) => {
        if (pullErr) {
          resolve({ ready: false, pulled: false });
          return;
        }
        resolve({ ready: true, pulled: true });
      });
    });
  });

  return ensureImagePromise;
}

/**
 * Runs a Python script in Docker.
 * @param {string} jobDir - Directory to mount (absolute path recommended)
 * @param {string} scriptName - Name of the Python file to run (e.g., inputCode.py)
 * @param {object} options - { timeoutMs, memoryLimit, cpuLimit }
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number, error?: string}>}
 */
export default async function runInDocker(jobDir, scriptName, options = {}) {
  await ensureDockerImageReady();

  return new Promise((resolve) => {
    const absJobDir = path.resolve(jobDir);

    // 1. Convert ms to seconds for the Linux command
    const timeoutSecs = Math.ceil((options.timeoutMs || 15000) / 1000);

    let dockerCmd = `docker run --rm`;
    if (options.memoryLimit) dockerCmd += ` --memory=${options.memoryLimit}`;
    if (options.cpuLimit) dockerCmd += ` --cpus=${options.cpuLimit}`;
    dockerCmd += ` -v "${absJobDir}:/workspace"`;

    // 2. Inject the 'timeout' command INSIDE the Docker container
    dockerCmd += ` -w /workspace ${DOCKER_IMAGE} timeout ${timeoutSecs}s python /workspace/${scriptName}`;

    // 3. Keep Node timeout as an absolute failsafe (+5 seconds buffer)
    const nodeTimeout = (options.timeoutMs || 15000) + 5000;

    exec(dockerCmd, { timeout: nodeTimeout }, (error, stdout, stderr) => {
      resolve({
        stdout,
        stderr,
        exitCode: error && error.code ? error.code : 0,
        error:
          error && error.killed ? "Timeout or resource limit exceeded" : null,
      });
    });
  });
}
