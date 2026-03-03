/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os';
import * as path from 'path';
import { config as loadDotEnv } from 'dotenv';

import { CONFIG } from '../../colab-config';

loadDotEnv();

export const COLAB_DOMAIN =
  process.env.COLAB_EXTENSION_API_DOMAIN ?? CONFIG.ColabApiDomain;
export const COLAB_GAPI_DOMAIN =
  process.env.COLAB_EXTENSION_GAPI_DOMAIN ?? CONFIG.ColabGapiDomain;
export const OAUTH_CLIENT_ID =
  process.env.COLAB_EXTENSION_CLIENT_ID ?? CONFIG.ClientId;
export const OAUTH_CLIENT_SECRET =
  process.env.COLAB_EXTENSION_CLIENT_NOT_SO_SECRET ?? CONFIG.ClientNotSoSecret;
export const OAUTH_SCOPES = [
  'email',
  'profile',
  'https://www.googleapis.com/auth/colaboratory',
];

export const CREDENTIALS_FILE = path.join(
  os.homedir(),
  '.colab-cli',
  'credentials.json',
);

export const XSSI_PREFIX = ")]}'\n";
export const TUN_ENDPOINT = '/tun/m';
export const REQUEST_TIMEOUT_MS = 30_000;
