/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '../auth';
import { handleError } from '../errors';
import { printUserInfo } from '../output';

export async function cmdMe(): Promise<void> {
  try {
    const client = createClient();
    const userInfo = await client.getUserInfo();
    printUserInfo(userInfo);
  } catch (error) {
    handleError(error);
    process.exit(1);
  }
}
