/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fetch, { type RequestInit, type Response } from 'node-fetch';

import { REQUEST_TIMEOUT_MS, XSSI_PREFIX } from './constants';

export async function fetchWithTimeout(
  url: URL,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Request timed out after ${String(REQUEST_TIMEOUT_MS)}ms: ${url.toString()}`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function stripXssiPrefix(v: string): string {
  if (!v.startsWith(XSSI_PREFIX)) {
    return v;
  }
  return v.slice(XSSI_PREFIX.length);
}
