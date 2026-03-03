/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'crypto';
import { URL } from 'url';
import { Headers, type RequestInit } from 'node-fetch';
import WebSocket from 'ws';
import { z } from 'zod';

import { AuthType, RuntimeProxyToken } from '../../colab/api';
import {
  ACCEPT_JSON_HEADER,
  COLAB_CLIENT_AGENT_HEADER,
  COLAB_RUNTIME_PROXY_TOKEN_HEADER,
  CONTENT_TYPE_JSON_HEADER,
} from '../../colab/headers';
import { handleEphemeralAuth } from './ephemeral-auth';
import { ExecutionResult } from './exec-types';
import { fetchWithTimeout, stripXssiPrefix } from './http';

const SessionResponseSchema = z.object({
  id: z.string(),
  kernel: z.object({
    id: z.string(),
  }),
});

const ColabAuthEphemeralRequestSchema = z.object({
  header: z.object({
    msg_type: z.literal('colab_request'),
  }),
  content: z.object({
    request: z.object({
      authType: z.enum(AuthType),
    }),
  }),
  metadata: z.object({
    colab_request_type: z.literal('request_auth'),
    colab_msg_id: z.number(),
  }),
});

const ExecuteResultTextSchema = z.union([z.string(), z.array(z.string())]);

export interface KernelSession {
  sessionId: string;
  kernelId: string;
}

export interface DispatchResult {
  executeSessionId: string;
  executeMessageId: string;
}

export async function createKernelSession(
  runtimeProxy: RuntimeProxyToken,
  startupTimeoutSec = 180,
): Promise<KernelSession> {
  const deadline = Date.now() + startupTimeoutSec * 1000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const payload = await issueRuntimeProxyRequest(
        runtimeProxy,
        new URL('/api/sessions', runtimeProxy.url),
        {
          method: 'POST',
          headers: {
            [CONTENT_TYPE_JSON_HEADER.key]: CONTENT_TYPE_JSON_HEADER.value,
          },
          body: JSON.stringify({
            kernel: { name: 'python3' },
            name: 'colab-cli',
            path: `colab-cli-${randomUUID()}`,
            type: 'notebook',
          }),
        },
        SessionResponseSchema,
      );

      return {
        sessionId: payload.id,
        kernelId: payload.kernel.id,
      };
    } catch (error) {
      lastError = error;
      await sleep(3000);
    }
  }

  throw new Error(`Timed out creating kernel session: ${String(lastError)}`);
}

export async function deleteKernelSession(
  runtimeProxy: RuntimeProxyToken,
  sessionId: string,
): Promise<void> {
  const encodedSessionId = encodeURIComponent(sessionId);
  await issueRuntimeProxyRequestVoid(
    runtimeProxy,
    new URL(`/api/sessions/${encodedSessionId}`, runtimeProxy.url),
    {
      method: 'DELETE',
    },
  );
}

export async function executeKernelCode(options: {
  runtimeProxy: RuntimeProxyToken;
  kernelId: string;
  endpoint: string;
  code: string;
  timeoutSec: number;
}): Promise<ExecutionResult> {
  const executeSessionId = randomUUID().replace(/-/g, '');
  const executeMsgId = randomUUID().replace(/-/g, '');
  const wsUrl = buildKernelChannelsWebSocketUrl(
    options.runtimeProxy.url,
    options.kernelId,
    executeSessionId,
  );

  const stdout: string[] = [];
  const stderr: string[] = [];

  let hadError = false;
  let sawIdle = false;
  let timedOut = false;
  let settled = false;

  const ws = new WebSocket(wsUrl, {
    headers: {
      [COLAB_RUNTIME_PROXY_TOKEN_HEADER.key]: options.runtimeProxy.token,
      [COLAB_CLIENT_AGENT_HEADER.key]: COLAB_CLIENT_AGENT_HEADER.value,
    },
  });

  return await new Promise<ExecutionResult>((resolve, reject) => {
    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      const stderrCombined = stderr.join('');
      const stdoutCombined = stdout.join('');
      const exitCode = hadError || timedOut || !sawIdle ? 1 : 0;
      resolve({
        stdout: stdoutCombined,
        stderr: stderrCombined,
        exitCode,
        timedOut,
      });
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      hadError = true;
      stderr.push(
        `[colab-cli] ERROR: Timed out waiting for kernel execution to finish after ${String(options.timeoutSec)}s.\n`,
      );
      ws.close();
    }, options.timeoutSec * 1000);

    ws.on('open', () => {
      const executeMessage = createExecuteRequestMessage({
        executeMessageId: executeMsgId,
        executeSessionId,
        code: options.code,
      });
      ws.send(JSON.stringify(executeMessage));
    });

    ws.on('message', (rawData: WebSocket.Data) => {
      const text =
        typeof rawData === 'string' ? rawData : (rawData as Buffer).toString();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        return;
      }

      const authRequest = ColabAuthEphemeralRequestSchema.safeParse(parsed);
      if (authRequest.success) {
        void handleColabAuthRequest({
          endpoint: options.endpoint,
          executeSessionId,
          request: authRequest.data,
          ws,
          stderr,
        });
        return;
      }

      const parsedMessage = KernelMessageSchema.safeParse(parsed);
      if (!parsedMessage.success) {
        return;
      }

      const message = parsedMessage.data;
      if ((message.parent_header?.msg_id ?? '') !== executeMsgId) {
        return;
      }

      const msgType = message.msg_type ?? message.header?.msg_type;
      const content = message.content ?? {};

      if (msgType === 'stream') {
        const stream = KernelStreamContentSchema.safeParse(content);
        if (stream.success) {
          if (stream.data.name === 'stdout') {
            stdout.push(stream.data.text);
          } else {
            stderr.push(stream.data.text);
          }
        }
        return;
      }

      if (msgType === 'execute_result' || msgType === 'display_data') {
        const textResult = KernelResultContentSchema.safeParse(content);
        if (textResult.success) {
          const plain = textResult.data.data['text/plain'];
          const normalized = ExecuteResultTextSchema.parse(plain);
          if (Array.isArray(normalized)) {
            stdout.push(normalized.join('') + '\n');
          } else {
            stdout.push(normalized + '\n');
          }
        }
        return;
      }

      if (msgType === 'error') {
        hadError = true;
        const error = KernelErrorContentSchema.safeParse(content);
        if (error.success) {
          stderr.push(`\n${error.data.ename}: ${error.data.evalue}\n`);
          for (const line of error.data.traceback) {
            stderr.push(stripAnsi(line) + '\n');
          }
        }
        return;
      }

      if (msgType === 'status') {
        const status = KernelStatusContentSchema.safeParse(content);
        if (status.success && status.data.execution_state === 'idle') {
          sawIdle = true;
          ws.close();
        }
      }
    });

    ws.on('error', (error: Error) => {
      if (settled) {
        return;
      }
      hadError = true;
      stderr.push(`[colab-cli] ERROR: WebSocket error: ${error.message}\n`);
      reject(error);
    });

    ws.on('close', () => {
      finish();
    });
  });
}

export async function dispatchKernelCodeNoWait(options: {
  runtimeProxy: RuntimeProxyToken;
  kernelId: string;
  code: string;
  connectTimeoutSec?: number;
}): Promise<DispatchResult> {
  const executeSessionId = randomUUID().replace(/-/g, '');
  const executeMessageId = randomUUID().replace(/-/g, '');
  const wsUrl = buildKernelChannelsWebSocketUrl(
    options.runtimeProxy.url,
    options.kernelId,
    executeSessionId,
  );

  const ws = new WebSocket(wsUrl, {
    headers: {
      [COLAB_RUNTIME_PROXY_TOKEN_HEADER.key]: options.runtimeProxy.token,
      [COLAB_CLIENT_AGENT_HEADER.key]: COLAB_CLIENT_AGENT_HEADER.value,
    },
  });

  return await new Promise<DispatchResult>((resolve, reject) => {
    let settled = false;
    const connectTimeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      ws.close();
      reject(
        new Error(
          `Timed out connecting to kernel channels after ${String(options.connectTimeoutSec ?? 20)}s`,
        ),
      );
    }, (options.connectTimeoutSec ?? 20) * 1000);

    ws.on('open', () => {
      const message = createExecuteRequestMessage({
        executeMessageId,
        executeSessionId,
        code: options.code,
      });
      ws.send(JSON.stringify(message), (error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(connectTimeout);
        ws.close();
        if (error) {
          reject(error);
          return;
        }
        resolve({
          executeSessionId,
          executeMessageId,
        });
      });
    });

    ws.on('error', (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(connectTimeout);
      reject(error);
    });
  });
}

async function handleColabAuthRequest(options: {
  endpoint: string;
  executeSessionId: string;
  request: z.infer<typeof ColabAuthEphemeralRequestSchema>;
  ws: WebSocket;
  stderr: string[];
}): Promise<void> {
  const { request, endpoint, executeSessionId, ws, stderr } = options;
  let errMessage: string | undefined;

  try {
    await handleEphemeralAuth(endpoint, request.content.request.authType);
  } catch (error) {
    errMessage = error instanceof Error ? error.message : String(error);
    stderr.push(`[colab-cli] Warning: ${errMessage}\n`);
  }

  const reply = makeColabInputReply(
    executeSessionId,
    request.metadata.colab_msg_id,
    errMessage,
  );
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(reply));
  }
}

function makeColabInputReply(
  clientSessionId: string,
  colabMessageId: number,
  errorText?: string,
): {
  header: {
    msg_id: string;
    msg_type: 'input_reply';
    session: string;
    date: string;
    username: string;
    version: string;
  };
  content: {
    value: {
      type: 'colab_reply';
      colab_msg_id: number;
      error?: string;
    };
  };
  channel: 'stdin';
  metadata: Record<string, never>;
  parent_header: Record<string, never>;
} {
  const value: {
    type: 'colab_reply';
    colab_msg_id: number;
    error?: string;
  } = {
    type: 'colab_reply',
    colab_msg_id: colabMessageId,
  };

  if (errorText) {
    value.error = errorText;
  }

  return {
    header: {
      msg_id: randomUUID().replace(/-/g, ''),
      msg_type: 'input_reply',
      session: clientSessionId,
      date: new Date().toISOString(),
      username: 'username',
      version: '5.0',
    },
    content: { value },
    channel: 'stdin',
    metadata: {},
    parent_header: {},
  };
}

function buildKernelChannelsWebSocketUrl(
  runtimeProxyUrl: string,
  kernelId: string,
  sessionId: string,
): string {
  const url = new URL(runtimeProxyUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = new URL(`/api/kernels/${kernelId}/channels`, url).pathname;
  url.searchParams.set('session_id', sessionId);
  return url.toString();
}

function createExecuteRequestMessage(options: {
  executeMessageId: string;
  executeSessionId: string;
  code: string;
}): {
  header: {
    msg_id: string;
    msg_type: 'execute_request';
    username: string;
    session: string;
    version: string;
  };
  parent_header: Record<string, never>;
  metadata: Record<string, never>;
  content: {
    code: string;
    silent: false;
    store_history: true;
    user_expressions: Record<string, never>;
    allow_stdin: false;
    stop_on_error: true;
  };
  channel: 'shell';
} {
  return {
    header: {
      msg_id: options.executeMessageId,
      msg_type: 'execute_request',
      username: 'colab-cli',
      session: options.executeSessionId,
      version: '5.3',
    },
    parent_header: {},
    metadata: {},
    content: {
      code: options.code,
      silent: false,
      store_history: true,
      user_expressions: {},
      allow_stdin: false,
      stop_on_error: true,
    },
    channel: 'shell',
  };
}

async function issueRuntimeProxyRequest<T extends z.ZodType>(
  runtimeProxy: RuntimeProxyToken,
  url: URL,
  init: RequestInit,
  schema: T,
): Promise<z.infer<T>> {
  const headers = new Headers(init.headers);
  headers.set(ACCEPT_JSON_HEADER.key, ACCEPT_JSON_HEADER.value);
  headers.set(COLAB_CLIENT_AGENT_HEADER.key, COLAB_CLIENT_AGENT_HEADER.value);
  headers.set(COLAB_RUNTIME_PROXY_TOKEN_HEADER.key, runtimeProxy.token);

  const response = await fetchWithTimeout(url, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `Runtime request failed: ${String(response.status)} ${response.statusText}\n${errorBody}`,
    );
  }

  const body = await response.text();
  return schema.parse(JSON.parse(stripXssiPrefix(body)) as unknown);
}

async function issueRuntimeProxyRequestVoid(
  runtimeProxy: RuntimeProxyToken,
  url: URL,
  init: RequestInit,
): Promise<void> {
  const headers = new Headers(init.headers);
  headers.set(ACCEPT_JSON_HEADER.key, ACCEPT_JSON_HEADER.value);
  headers.set(COLAB_CLIENT_AGENT_HEADER.key, COLAB_CLIENT_AGENT_HEADER.value);
  headers.set(COLAB_RUNTIME_PROXY_TOKEN_HEADER.key, runtimeProxy.token);

  const response = await fetchWithTimeout(url, {
    ...init,
    headers,
  });
  if (!response.ok && response.status !== 404) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `Runtime request failed: ${String(response.status)} ${response.statusText}\n${errorBody}`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, '');
}

const KernelMessageSchema = z.object({
  msg_type: z.string().optional(),
  header: z.object({ msg_type: z.string().optional() }).optional(),
  parent_header: z.object({ msg_id: z.string().optional() }).optional(),
  content: z.unknown().optional(),
});

const KernelStreamContentSchema = z.object({
  name: z.enum(['stdout', 'stderr']).or(z.string()),
  text: z.string(),
});

const KernelResultContentSchema = z.object({
  data: z.object({
    'text/plain': z.union([z.string(), z.array(z.string())]).optional(),
  }),
});

const KernelErrorContentSchema = z.object({
  ename: z.string(),
  evalue: z.string(),
  traceback: z.array(z.string()).default([]),
});

const KernelStatusContentSchema = z.object({
  execution_state: z.string(),
});
