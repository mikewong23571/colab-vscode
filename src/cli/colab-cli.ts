/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { main } from './standalone/main';

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
