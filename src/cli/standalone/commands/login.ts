/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { clearCredentials } from '../credentials';
import { login } from '../oauth';

export async function cmdLogin(): Promise<void> {
  await login();
}

export function cmdLogout(): void {
  clearCredentials();
  console.log('✓ Logged out successfully');
}
