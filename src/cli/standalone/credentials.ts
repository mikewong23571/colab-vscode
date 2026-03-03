/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';

import { CREDENTIALS_FILE } from './constants';
import { StoredCredentials } from './types';

function ensureCredentialsDir(): void {
  const dir = path.dirname(CREDENTIALS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadCredentials(): StoredCredentials | null {
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    return null;
  }
  try {
    const content = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(content) as StoredCredentials;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: StoredCredentials): void {
  ensureCredentialsDir();
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), {
    mode: 0o600,
  });
}

export function clearCredentials(): void {
  if (fs.existsSync(CREDENTIALS_FILE)) {
    fs.unlinkSync(CREDENTIALS_FILE);
  }
}
