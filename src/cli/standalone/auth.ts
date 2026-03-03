/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OAuth2Client } from 'google-auth-library';

import { OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET } from './constants';
import { loadCredentials, saveCredentials } from './credentials';
import { SimpleColabClient } from './client';

export async function getAccessToken(): Promise<string> {
  const credentialsStore = loadCredentials();

  if (
    !credentialsStore ||
    (!credentialsStore.refresh_token && !credentialsStore.access_token)
  ) {
    console.error('Error: Not logged in. Run "colab-cli login" first.');
    process.exit(1);
  }

  if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
    console.error('Error: OAuth credentials not configured');
    console.error(
      '  Please set COLAB_EXTENSION_CLIENT_ID and COLAB_EXTENSION_CLIENT_NOT_SO_SECRET',
    );
    console.error('  in your .env file or environment variables');
    process.exit(1);
  }

  const oauth2Client = new OAuth2Client(OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET);

  if (credentialsStore.refresh_token) {
    oauth2Client.setCredentials({
      refresh_token: credentialsStore.refresh_token,
    });
  } else if (credentialsStore.access_token) {
    oauth2Client.setCredentials({
      access_token: credentialsStore.access_token,
    });
  }

  if (
    credentialsStore.expiry_date &&
    Date.now() < credentialsStore.expiry_date - 5000 &&
    credentialsStore.access_token
  ) {
    return credentialsStore.access_token;
  }

  const { credentials } = await oauth2Client.refreshAccessToken();
  const refreshedAccessToken = credentials.access_token ?? undefined;
  if (!refreshedAccessToken) {
    throw new Error('Failed to refresh access token');
  }

  saveCredentials({
    refresh_token:
      credentials.refresh_token ?? credentialsStore.refresh_token ?? undefined,
    access_token: refreshedAccessToken,
    expiry_date: credentials.expiry_date ?? undefined,
  });

  return refreshedAccessToken;
}

export function createClient(): SimpleColabClient {
  return new SimpleColabClient(getAccessToken);
}
