/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import open from 'open';

import { AuthType } from '../../colab/api';
import { createClient } from './auth';

export async function handleEphemeralAuth(
  endpoint: string,
  authType: AuthType,
): Promise<void> {
  const client = createClient();

  const dryRunResult = await client.propagateCredentials(endpoint, {
    authType,
    dryRun: true,
  });

  if (dryRunResult.success) {
    await propagateCredentials(endpoint, authType);
    return;
  }

  if (!dryRunResult.unauthorizedRedirectUri) {
    throw new Error(
      `[${authType}] Credentials propagation dry run returned unexpected result: ${JSON.stringify(dryRunResult)}`,
    );
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      `[${authType}] Requires interactive authorization: ${dryRunResult.unauthorizedRedirectUri}`,
    );
  }

  console.error(
    `[${authType}] Authorization is required. Opening browser: ${dryRunResult.unauthorizedRedirectUri}`,
  );
  await open(dryRunResult.unauthorizedRedirectUri);
  await waitForEnter(
    `[${authType}] Complete authorization in browser, then press Enter to continue...`,
  );

  await propagateCredentials(endpoint, authType);
}

async function propagateCredentials(
  endpoint: string,
  authType: AuthType,
): Promise<void> {
  const client = createClient();
  const propagationResult = await client.propagateCredentials(endpoint, {
    authType,
    dryRun: false,
  });

  if (!propagationResult.success) {
    throw new Error(`[${authType}] Credentials propagation unsuccessful`);
  }
}

async function waitForEnter(prompt: string): Promise<void> {
  await new Promise<void>((resolve) => {
    process.stderr.write(`${prompt}\n`);
    process.stdin.resume();
    process.stdin.once('data', () => {
      resolve();
    });
  });
}
