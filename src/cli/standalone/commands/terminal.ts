/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { handleError } from '../errors';
import { resolveAssignmentConnection, runTerminalSession } from '../runtime';

export async function cmdTerminal(options: { assign?: string }): Promise<void> {
  try {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error('Terminal attach requires an interactive TTY');
    }

    const { endpoint, runtimeProxy } = await resolveAssignmentConnection({
      assign: options.assign,
    });
    await runTerminalSession(endpoint, runtimeProxy);
  } catch (error) {
    handleError(error);
    process.exit(1);
  }
}
