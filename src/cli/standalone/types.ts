/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface StoredCredentials {
  refresh_token?: string;
  access_token?: string;
  expiry_date?: number;
}
