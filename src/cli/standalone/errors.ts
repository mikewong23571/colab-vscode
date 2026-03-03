/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export function handleError(error: unknown): void {
  if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error('Error:', error);
  }
}
