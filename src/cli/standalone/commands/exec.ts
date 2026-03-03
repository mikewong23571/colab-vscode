/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';

import { handleError } from '../errors';
import { ExecutionOutputMode } from '../exec-types';
import {
  createKernelSession,
  dispatchKernelCodeNoWait,
  deleteKernelSession,
  executeKernelCode,
} from '../exec-runtime';
import { printExecHelp } from '../help';
import { startKeepAliveLoop } from '../keepalive';
import { resolveAssignmentConnection } from '../runtime';
import { RuntimeProxyToken } from '../../../colab/api';

export async function cmdExec(
  positionalArgs: string[],
  options: {
    assign?: string;
    code?: string;
    file?: string;
    timeout?: string;
    output?: string;
    noWait?: string;
    help?: string;
  },
): Promise<void> {
  if (options.help !== undefined) {
    printExecHelp();
    return;
  }

  const timeoutSec = parseTimeout(options.timeout);
  const output = parseOutputMode(options.output);
  const noWait = parseBooleanFlag(options.noWait);
  const code = resolveCodeInput(options.code, options.file, positionalArgs);

  if (!code) {
    console.error('Error: code input is required');
    printExecHelp();
    process.exit(1);
  }

  let stopKeepAlive: (() => void) | undefined;
  let sessionId: string | undefined;
  let kernelId: string | undefined;
  let runtimeProxy: RuntimeProxyToken | undefined;

  try {
    const assignmentConnection = await resolveAssignmentConnection({
      assign: options.assign,
    });
    const endpoint = assignmentConnection.endpoint;
    runtimeProxy = assignmentConnection.runtimeProxy;

    if (!noWait) {
      stopKeepAlive = startKeepAliveLoop({ endpoint });
    }

    const session = await createKernelSession(runtimeProxy);
    sessionId = session.sessionId;
    kernelId = session.kernelId;

    if (noWait) {
      const dispatchResult = await dispatchKernelCodeNoWait({
        runtimeProxy,
        kernelId: session.kernelId,
        code,
      });
      if (output === 'json') {
        process.stdout.write(
          `${JSON.stringify(
            {
              endpoint,
              sessionId,
              kernelId,
              timeoutSec,
              noWait: true,
              dispatched: true,
              executeSessionId: dispatchResult.executeSessionId,
              executeMessageId: dispatchResult.executeMessageId,
            },
            null,
            2,
          )}\n`,
        );
      } else {
        process.stdout.write(
          `Dispatched execution to ${endpoint} (session=${sessionId}, kernel=${kernelId}, msg=${dispatchResult.executeMessageId}).\n`,
        );
      }
      return;
    }

    const result = await executeKernelCodeWithRetry({
      runtimeProxy,
      kernelId: session.kernelId,
      endpoint,
      code,
      timeoutSec,
    });

    if (output === 'json') {
      process.stdout.write(
        `${JSON.stringify(
          {
            endpoint,
            sessionId,
            timeoutSec,
            ...result,
          },
          null,
          2,
        )}\n`,
      );
    } else {
      if (result.stdout) {
        process.stdout.write(result.stdout);
      }
      if (result.stderr) {
        process.stderr.write(result.stderr);
      }
      if (result.timedOut) {
        process.stderr.write(
          `[colab-cli] Execution timed out after ${String(timeoutSec)}s.\n`,
        );
      }
    }

    if (result.exitCode !== 0) {
      process.exit(result.exitCode);
    }
  } catch (error) {
    handleError(error);
    process.exit(1);
  } finally {
    stopKeepAlive?.();

    if (sessionId && runtimeProxy && !noWait) {
      try {
        await deleteKernelSession(runtimeProxy, sessionId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`[colab-cli] Warning: failed to delete session: ${message}\n`);
      }
    }
  }
}

function parseTimeout(rawTimeout?: string): number {
  if (!rawTimeout) {
    return 300;
  }
  const parsed = Number(rawTimeout);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid timeout value: ${rawTimeout}`);
  }
  return parsed;
}

function parseOutputMode(rawOutput?: string): ExecutionOutputMode {
  const normalized = (rawOutput ?? 'text').toLowerCase();
  if (normalized === 'json' || normalized === 'text') {
    return normalized;
  }
  throw new Error(`Invalid output mode: ${rawOutput}`);
}

function parseBooleanFlag(rawValue?: string): boolean {
  if (rawValue === undefined) {
    return false;
  }
  const normalized = rawValue.toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === '') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  throw new Error(`Invalid boolean flag value: ${rawValue}`);
}

function resolveCodeInput(
  codeOption: string | undefined,
  fileOption: string | undefined,
  positionalArgs: string[],
): string {
  if (codeOption?.length) {
    return codeOption;
  }

  if (fileOption?.length) {
    if (!fs.existsSync(fileOption)) {
      throw new Error(`Code file not found: ${fileOption}`);
    }
    return fs.readFileSync(fileOption, 'utf8');
  }

  if (positionalArgs.length > 0) {
    return positionalArgs.join(' ');
  }

  return '';
}

async function executeKernelCodeWithRetry(options: {
  runtimeProxy: RuntimeProxyToken;
  kernelId: string;
  endpoint: string;
  code: string;
  timeoutSec: number;
}): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await executeKernelCode(options);
    } catch (error) {
      lastError = error;
      if (!isRetryableExecutionError(error) || attempt === 3) {
        throw error;
      }
      await sleep(1500);
    }
  }

  throw lastError;
}

function isRetryableExecutionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes('closed before the connection was established') ||
    message.includes('econnreset') ||
    message.includes('socket hang up')
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
