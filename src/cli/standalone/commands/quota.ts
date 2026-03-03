/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '../auth';
import { handleError } from '../errors';
import { printQuotaInfo } from '../output';

export async function cmdQuota(): Promise<void> {
  try {
    const client = createClient();
    const quotaInfo = await client.getConsumptionUserInfo();
    printQuotaInfo(quotaInfo);
  } catch (error) {
    handleError(error);
    process.exit(1);
  }
}
