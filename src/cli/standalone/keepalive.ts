/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from './auth';

interface KeepAliveOptions {
  endpoint: string;
  intervalMs?: number;
}

export function startKeepAliveLoop(options: KeepAliveOptions): () => void {
  const client = createClient();
  const intervalMs = options.intervalMs ?? 60_000;
  let stopped = false;
  let inFlight = false;

  const tick = async (): Promise<void> => {
    if (stopped || inFlight) {
      return;
    }
    inFlight = true;
    try {
      await client.sendKeepAlive(options.endpoint);
    } catch {
      // Keep-alive failures should not terminate active execution.
    } finally {
      inFlight = false;
    }
  };

  // Trigger one immediate keep-alive to reduce early idle timeouts.
  void tick();
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  return (): void => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearInterval(timer);
  };
}
