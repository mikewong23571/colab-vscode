/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';
import { Headers, type RequestInit } from 'node-fetch';
import WebSocket from 'ws';
import { z } from 'zod';

import { RuntimeProxyToken } from '../../colab/api';
import {
  ACCEPT_JSON_HEADER,
  COLAB_CLIENT_AGENT_HEADER,
  COLAB_RUNTIME_PROXY_TOKEN_HEADER,
  CONTENT_TYPE_JSON_HEADER,
} from '../../colab/headers';
import { createClient } from './auth';
import { fetchWithTimeout, stripXssiPrefix } from './http';

const TerminalDataMessageSchema = z.object({
  data: z.string(),
});

const ContentsEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(['file', 'directory', 'notebook']),
  size: z.number().nullable().optional(),
  last_modified: z.string().optional(),
});

const ContentsResponseSchema = z.object({
  name: z.string().optional(),
  path: z.string(),
  type: z.enum(['file', 'directory', 'notebook']),
  format: z.enum(['text', 'base64', 'json']).nullable().optional(),
  content: z
    .union([z.string(), z.array(ContentsEntrySchema), z.null()])
    .optional(),
});

type ContentsResponse = z.infer<typeof ContentsResponseSchema>;

export async function runTerminalSession(
  endpoint: string,
  runtimeProxy: RuntimeProxyToken,
): Promise<void> {
  const wsUrl = buildTerminalWebSocketUrl(runtimeProxy.url);
  const ws = new WebSocket(wsUrl, {
    headers: {
      [COLAB_RUNTIME_PROXY_TOKEN_HEADER.key]: runtimeProxy.token,
    },
  });

  const stdout = process.stdout;
  const stdin = process.stdin;
  const restoreRawMode = stdin.isTTY ? stdin.isRaw : false;
  let cleaned = false;

  const cleanup = (): void => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    stdout.off('resize', onResize);
    stdin.off('data', onInput);
    if (stdin.isTTY) {
      stdin.setRawMode(restoreRawMode);
    }
    stdin.pause();
  };

  const onResize = (): void => {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(
      JSON.stringify({
        cols: stdout.columns,
        rows: stdout.rows,
      }),
    );
  };

  const onInput = (chunk: Buffer): void => {
    const data = chunk.toString('utf8');
    if (data.includes('\u001d')) {
      ws.close();
      return;
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ data }));
    }
  };

  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => {
      stdout.write(
        `Connected to assignment ${endpoint}. Press Ctrl+] to disconnect.\\r\\n`,
      );
      if (stdin.isTTY) {
        stdin.setRawMode(true);
      }
      stdin.resume();
      stdin.on('data', onInput);
      stdout.on('resize', onResize);
      onResize();
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
      const payload = TerminalDataMessageSchema.safeParse(parsed);
      if (payload.success) {
        stdout.write(payload.data.data);
      }
    });

    ws.on('close', () => {
      cleanup();
      stdout.write('\\r\\nDisconnected from terminal.\\r\\n');
      resolve();
    });

    ws.on('error', (error: Error) => {
      cleanup();
      reject(error);
    });
  });
}

export async function resolveAssignmentConnection(options: {
  assign?: string;
}): Promise<{ endpoint: string; runtimeProxy: RuntimeProxyToken }> {
  const client = createClient();
  const assignments = await client.listAssignments();
  if (assignments.length === 0) {
    throw new Error('No active assignments. Run "colab-cli assign add" first.');
  }
  if (assignments.length !== 1) {
    throw new Error(
      `Expected exactly 1 active assignment, found ${String(assignments.length)}. Remove extra assignments with "colab-cli assign rm <endpoint>".`,
    );
  }

  const onlyEndpoint = assignments[0].endpoint;
  const requestedEndpoint = options.assign?.trim();
  if (requestedEndpoint && requestedEndpoint !== onlyEndpoint) {
    throw new Error(
      `Requested assignment ${requestedEndpoint} does not match the only active assignment ${onlyEndpoint}.`,
    );
  }

  const runtimeProxy = await client.getRuntimeProxyToken(onlyEndpoint);
  return { endpoint: onlyEndpoint, runtimeProxy };
}

export async function getContents(
  runtimeProxy: RuntimeProxyToken,
  remotePath: string,
): Promise<ContentsResponse> {
  const url = buildContentsUrl(runtimeProxy.url, remotePath);
  url.searchParams.set('content', '1');
  return await issueRuntimeProxyRequest(
    runtimeProxy,
    url,
    { method: 'GET' },
    ContentsResponseSchema,
  );
}

export async function putFileContents(
  runtimeProxy: RuntimeProxyToken,
  remotePath: string,
  fileData: Buffer,
): Promise<void> {
  const url = buildContentsUrl(runtimeProxy.url, remotePath);
  const body = {
    type: 'file',
    format: 'base64',
    content: fileData.toString('base64'),
  };
  await issueRuntimeProxyRequest(
    runtimeProxy,
    url,
    {
      method: 'PUT',
      headers: {
        [CONTENT_TYPE_JSON_HEADER.key]: CONTENT_TYPE_JSON_HEADER.value,
      },
      body: JSON.stringify(body),
    },
    ContentsResponseSchema,
  );
}

export function normalizeRemotePath(remotePath?: string): string {
  if (!remotePath) {
    return '';
  }
  return remotePath.replace(/^\/+/, '').trim();
}

export function decodeContentsFile(response: {
  content?: string | null | unknown[];
  format?: 'text' | 'base64' | 'json' | null;
  path: string;
}): Buffer {
  if (typeof response.content !== 'string') {
    throw new Error(`File content not returned for path: ${response.path}`);
  }
  if (response.format === 'base64') {
    return Buffer.from(response.content, 'base64');
  }
  return Buffer.from(response.content, 'utf8');
}

export function ensureLocalFileExists(localPath: string): void {
  if (!fs.existsSync(localPath)) {
    throw new Error(`Local file not found: ${localPath}`);
  }
}

export function writeLocalFile(localPath: string, fileData: Buffer): void {
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, fileData);
}

function buildTerminalWebSocketUrl(runtimeProxyUrl: string): string {
  const url = new URL(runtimeProxyUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = new URL('/colab/tty', url).pathname;
  return url.toString();
}

function buildContentsUrl(runtimeProxyUrl: string, remotePath: string): URL {
  const baseUrl = new URL(runtimeProxyUrl);
  const apiBase = new URL('/api/contents', baseUrl);
  const normalized = normalizeRemotePath(remotePath);
  if (!normalized) {
    return apiBase;
  }
  const encodedPath = normalized
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return new URL(`/api/contents/${encodedPath}`, baseUrl);
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
      `Runtime request failed: ${String(response.status)} ${response.statusText}\\n${errorBody}`,
    );
  }

  const body = await response.text();
  return schema.parse(JSON.parse(stripXssiPrefix(body)) as unknown);
}
