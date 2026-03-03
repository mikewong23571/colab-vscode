/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID, type UUID } from 'crypto';

import { Shape, Variant } from '../../../colab/api';
import { createClient } from '../auth';
import { handleError } from '../errors';
import { printAssignment, printAssignments } from '../output';

export async function cmdAssignList(): Promise<void> {
  try {
    const client = createClient();
    const assignments = await client.listAssignments();

    if (assignments.length === 0) {
      console.log('No active assignments');
      return;
    }

    console.log(`Found ${String(assignments.length)} assignment(s):\n`);
    printAssignments(assignments);
  } catch (error) {
    handleError(error);
    process.exit(1);
  }
}

export async function cmdAssignAdd(options: {
  variant?: string;
  accelerator?: string;
  shape?: string;
}): Promise<void> {
  try {
    const client = createClient();
    const variant = (options.variant?.toUpperCase() ?? 'DEFAULT') as Variant;
    const shape = options.shape
      ? options.shape.toUpperCase() === 'HIGHMEM'
        ? Shape.HIGHMEM
        : Shape.STANDARD
      : undefined;

    const notebookHash = randomUUID() as UUID;

    const result = await client.assign(notebookHash, {
      variant,
      accelerator: options.accelerator,
      shape,
    });

    console.log(
      result.isNew
        ? '\n✓ Created new assignment:'
        : '\n✓ Using existing assignment:',
    );
    printAssignment(result.assignment);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('412') || msg.includes('too many')) {
      console.error('Error: You have too many active assignments');
      console.error('  Run "colab-cli assign rm <endpoint>" to remove one');
    } else if (msg.includes('quota') || msg.includes('QUOTA')) {
      console.error('Error: Insufficient quota');
      console.error('  Run "colab-cli quota" to check your quota');
    } else if (msg.includes('denylist') || msg.includes('DENYLIST')) {
      console.error('Error: Account has been denylisted');
    } else {
      handleError(error);
    }
    process.exit(1);
  }
}

export async function cmdAssignRm(endpoint: string): Promise<void> {
  if (!endpoint) {
    console.error('Error: Endpoint is required');
    console.error('  Usage: colab-cli assign rm <endpoint>');
    console.error('  Run "colab-cli assign list" to see endpoints');
    process.exit(1);
  }

  try {
    const client = createClient();
    await client.unassign(endpoint);
    console.log(`✓ Removed assignment: ${endpoint}`);
  } catch (error) {
    handleError(error);
    process.exit(1);
  }
}
