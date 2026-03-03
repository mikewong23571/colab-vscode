/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Assignment,
  ConsumptionUserInfo,
  ListedAssignment,
  Shape,
  SubscriptionTier,
  UserInfo,
  Variant,
} from '../../colab/api';

interface ContentsEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'notebook';
  size?: number | null;
}

export function printUserInfo(info: UserInfo): void {
  console.log('User Information:');
  console.log('─────────────────────────────────────');
  console.log(
    `  Subscription Tier: ${formatSubscriptionTier(info.subscriptionTier)}`,
  );

  if (info.paidComputeUnitsBalance !== undefined) {
    console.log(
      `  Paid CCU Balance:  ${info.paidComputeUnitsBalance.toFixed(2)}`,
    );
  }

  if (info.eligibleAccelerators.length > 0) {
    console.log('  Eligible Accelerators:');
    for (const acc of info.eligibleAccelerators) {
      const models = acc.models.length > 0 ? acc.models.join(', ') : 'None';
      console.log(`    - ${acc.variant}: ${models}`);
    }
  }

  if (info.ineligibleAccelerators.length > 0) {
    console.log('  Ineligible Accelerators:');
    for (const acc of info.ineligibleAccelerators) {
      const models = acc.models.length > 0 ? acc.models.join(', ') : 'None';
      console.log(`    - ${acc.variant}: ${models}`);
    }
  }
}

export function printQuotaInfo(info: ConsumptionUserInfo): void {
  console.log('Quota Information:');
  console.log('─────────────────────────────────────');
  console.log(
    `  Subscription Tier:     ${formatSubscriptionTier(info.subscriptionTier)}`,
  );
  console.log(
    `  Paid CCU Balance:      ${info.paidComputeUnitsBalance.toFixed(2)}`,
  );
  console.log(
    `  Hourly Consumption:    ${info.consumptionRateHourly.toFixed(2)} CCU/h`,
  );
  console.log(`  Active Assignments:    ${String(info.assignmentsCount)}`);

  if (info.freeCcuQuotaInfo) {
    console.log(
      `  Free CCU Remaining:    ${(info.freeCcuQuotaInfo.remainingTokens / 1000).toFixed(2)} CCU`,
    );
    const nextRefill = new Date(
      info.freeCcuQuotaInfo.nextRefillTimestampSec * 1000,
    );
    console.log(`  Next Refill:           ${nextRefill.toISOString()}`);
  }
}

export function printAssignments(assignments: ListedAssignment[]): void {
  for (const assignment of assignments) {
    printAssignment(assignment);
    console.log();
  }
}

export function printAssignment(assignment: ListedAssignment | Assignment): void {
  const endpoint =
    'endpoint' in assignment ? assignment.endpoint : 'Unknown endpoint';
  const accelerator =
    'accelerator' in assignment && assignment.accelerator
      ? assignment.accelerator
      : 'N/A';
  const variant =
    'variant' in assignment ? assignment.variant : Variant.DEFAULT;
  const machineShape =
    'machineShape' in assignment ? assignment.machineShape : 0;
  const runtimeProxyInfo = assignment.runtimeProxyInfo;

  console.log(`  Endpoint:        ${endpoint}`);
  console.log(`  Accelerator:     ${accelerator}`);
  console.log(`  Variant:         ${variant}`);
  console.log(`  Machine Shape:   ${formatShape(machineShape)}`);

  if (runtimeProxyInfo?.url) {
    const ttlSeconds =
      typeof runtimeProxyInfo.tokenExpiresInSeconds === 'number' &&
      runtimeProxyInfo.tokenExpiresInSeconds > 0
        ? runtimeProxyInfo.tokenExpiresInSeconds
        : 3600;
    console.log(`  Proxy URL:       ${runtimeProxyInfo.url}`);
    const expiry = new Date(Date.now() + ttlSeconds * 1000);
    console.log(
      `  Token Expires:   ${expiry.toISOString()} (${String(ttlSeconds)}s)`,
    );
  }

  if ('idleTimeoutSec' in assignment && assignment.idleTimeoutSec) {
    console.log(`  Idle Timeout:    ${String(assignment.idleTimeoutSec)}s`);
  }
}

export function printContentsEntry(entry: ContentsEntry): void {
  const typeMarker = entry.type === 'directory' ? 'd' : 'f';
  const size = entry.size ?? 0;
  console.log(
    `${typeMarker} ${String(size).padStart(10, ' ')} ${entry.path || entry.name}`,
  );
}

function formatSubscriptionTier(tier: SubscriptionTier | number): string {
  const tiers: Record<number, string> = {
    0: 'FREE',
    1: 'PRO',
    2: 'PRO+',
  };
  return tiers[tier] ?? `UNKNOWN(${String(tier)})`;
}

function formatShape(shape?: Shape | number): string {
  if (shape === undefined) return 'N/A';
  const shapes: Record<number, string> = {
    0: 'STANDARD',
    1: 'HIGHMEM',
  };
  return shapes[shape] ?? `UNKNOWN(${String(shape)})`;
}
