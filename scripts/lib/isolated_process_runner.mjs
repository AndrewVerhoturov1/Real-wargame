import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';

const DEFAULT_TIMEOUT_MS = 120_000;
const TIMEOUT_EXIT_CODE = 124;

export async function runIsolatedChecks(checks, options = {}) {
  if (!Array.isArray(checks) || checks.length === 0) {
    throw new TypeError('runIsolatedChecks requires at least one check.');
  }

  const failFast = options.failFast ?? true;
  const streamOutput = options.streamOutput ?? true;
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const results = [];

  for (const check of checks) {
    const result = await runOneCheck(check, { cwd, env, streamOutput });
    results.push(result);
    if (failFast && result.status !== 'passed') break;
  }

  return {
    passed: results.length === checks.length && results.every((result) => result.status === 'passed'),
    results,
  };
}

async function runOneCheck(check, defaults) {
  validateCheck(check);
  const startedAt = Date.now();
  const timeoutMs = check.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const commandText = formatCommand(check.command, check.args ?? []);

  if (defaults.streamOutput) {
    console.log(`\n[isolated-check] start name=${check.name}`);
    console.log(`[isolated-check] command=${commandText}`);
    console.log(`[isolated-check] timeout_ms=${timeoutMs}`);
  }

  return await new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const child = spawn(check.command, check.args ?? [], {
      cwd: check.cwd ?? defaults.cwd,
      env: { ...defaults.env, ...(check.env ?? {}) },
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (defaults.streamOutput) process.stdout.write(text);
    });

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (defaults.streamOutput) process.stderr.write(text);
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child.pid);
    }, timeoutMs);
    timeout.unref?.();

    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(buildResult({
        check,
        commandText,
        startedAt,
        status: timedOut ? 'timed_out' : 'failed',
        exitCode: timedOut ? TIMEOUT_EXIT_CODE : null,
        signal: null,
        stdout,
        stderr,
        error: timedOut
          ? `Check timed out: ${check.name} after ${timeoutMs} ms.`
          : `Failed to start ${check.name}: ${error.message}`,
      }));
    });

    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const status = timedOut ? 'timed_out' : code === 0 ? 'passed' : 'failed';
      const exitCode = timedOut ? TIMEOUT_EXIT_CODE : code;
      const error = timedOut
        ? `Check timed out: ${check.name} after ${timeoutMs} ms.`
        : status === 'failed'
          ? `Check failed: ${check.name} exited with ${code ?? signal ?? 'unknown status'}.`
          : null;
      const result = buildResult({
        check,
        commandText,
        startedAt,
        status,
        exitCode,
        signal,
        stdout,
        stderr,
        error,
      });
      if (defaults.streamOutput) {
        console.log(`[isolated-check] finish name=${check.name} status=${status} duration_ms=${result.durationMs}`);
      }
      resolve(result);
    });
  });
}

function buildResult({ check, commandText, startedAt, status, exitCode, signal, stdout, stderr, error }) {
  return {
    name: check.name,
    command: commandText,
    status,
    exitCode,
    signal,
    durationMs: Date.now() - startedAt,
    stdout,
    stderr,
    error,
  };
}

function validateCheck(check) {
  if (!check || typeof check !== 'object') throw new TypeError('Each check must be an object.');
  if (typeof check.name !== 'string' || check.name.trim() === '') throw new TypeError('Each check requires a name.');
  if (typeof check.command !== 'string' || check.command.trim() === '') throw new TypeError(`${check.name} requires a command.`);
  if (check.args !== undefined && !Array.isArray(check.args)) throw new TypeError(`${check.name} args must be an array.`);
  if (check.timeoutMs !== undefined && (!Number.isFinite(check.timeoutMs) || check.timeoutMs <= 0)) {
    throw new TypeError(`${check.name} timeoutMs must be a positive number.`);
  }
}

function terminateProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      return;
    }
  }

  const killer = setTimeout(() => {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Process already exited.
      }
    }
  }, 1_000);
  killer.unref?.();
}

function formatCommand(command, args) {
  return [command, ...args].map((part) => JSON.stringify(String(part))).join(' ');
}
