/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os';
import * as path from 'path';
import { config as loadDotEnv } from 'dotenv';

loadDotEnv();

type ColabEnvironment = 'production' | 'sandbox' | 'local';

function getDefaultDomains(environment: string): {
  colabDomain: string;
  colabGapiDomain: string;
} {
  switch (environment as ColabEnvironment) {
    case 'sandbox':
      return {
        colabDomain: 'https://colab.sandbox.google.com',
        colabGapiDomain: 'https://staging-colab.sandbox.googleapis.com',
      };
    case 'local':
      return {
        colabDomain: 'https://localhost:8888',
        // Colab GAPI does not have a fully local endpoint.
        colabGapiDomain: 'https://staging-colab.sandbox.googleapis.com',
      };
    case 'production':
    default:
      return {
        colabDomain: 'https://colab.research.google.com',
        colabGapiDomain: 'https://colab.pa.googleapis.com',
      };
  }
}

const environment = process.env.COLAB_EXTENSION_ENVIRONMENT ?? 'production';
const defaultDomains = getDefaultDomains(environment);

export const COLAB_DOMAIN =
  process.env.COLAB_EXTENSION_API_DOMAIN ?? defaultDomains.colabDomain;
export const COLAB_GAPI_DOMAIN =
  process.env.COLAB_EXTENSION_GAPI_DOMAIN ?? defaultDomains.colabGapiDomain;
export const OAUTH_CLIENT_ID = process.env.COLAB_EXTENSION_CLIENT_ID;
export const OAUTH_CLIENT_SECRET =
  process.env.COLAB_EXTENSION_CLIENT_NOT_SO_SECRET;
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

export const XSSI_PREFIX = ")]}'";
export const TUN_ENDPOINT = '/tun/m';
export const REQUEST_TIMEOUT_MS = 30_000;
