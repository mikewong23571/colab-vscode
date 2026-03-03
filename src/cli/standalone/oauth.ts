/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomBytes } from 'crypto';
import http from 'http';
import { URL } from 'url';
import { OAuth2Client } from 'google-auth-library';
import open from 'open';

import {
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  OAUTH_SCOPES,
} from './constants';
import { saveCredentials } from './credentials';

export async function login(): Promise<void> {
  if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
    console.error('Error: OAuth credentials not configured');
    console.error(
      '  Please set COLAB_EXTENSION_CLIENT_ID and COLAB_EXTENSION_CLIENT_NOT_SO_SECRET',
    );
    console.error('  in your .env file or environment variables');
    process.exit(1);
  }

  console.log('Starting OAuth2 login flow...');

  const oauth2Client = new OAuth2Client(
    OAUTH_CLIENT_ID,
    OAUTH_CLIENT_SECRET,
    'http://localhost:8085/callback',
  );

  const oauthState = randomBytes(32).toString('hex');
  const authCodeListener = startLocalServer(oauthState);
  await authCodeListener.waitUntilListening;

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: OAUTH_SCOPES,
    prompt: 'consent',
    state: oauthState,
  });

  console.log('Opening browser for authentication...');
  console.log(`If browser doesn't open, visit: ${authUrl}`);

  try {
    await open(authUrl);
  } catch {
    console.warn('Could not open browser automatically. Use the URL above.');
  }

  const authCode = await authCodeListener.waitForCode;

  console.log('Authorization code received, exchanging for tokens...');

  const { tokens } = await oauth2Client.getToken(authCode);

  if (!tokens.refresh_token) {
    console.error('Error: Did not receive refresh token');
    process.exit(1);
  }

  saveCredentials({
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token ?? undefined,
    expiry_date: tokens.expiry_date ?? undefined,
  });

  console.log('✓ Login successful!');
}

function startLocalServer(expectedState: string): {
  waitForCode: Promise<string>;
  waitUntilListening: Promise<void>;
} {
  let resolveListening!: () => void;
  let rejectListening!: (error: Error) => void;
  const waitUntilListening = new Promise<void>((resolve, reject) => {
    resolveListening = resolve;
    rejectListening = reject;
  });

  const waitForCode = new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      callback();
    };

    const server = http.createServer((req, res) => {
      if (!req.url) {
        res.writeHead(400);
        res.end('Invalid request');
        return;
      }

      const parsedUrl = new URL(req.url, 'http://localhost:8085');

      if (parsedUrl.pathname === '/callback') {
        const code = parsedUrl.searchParams.get('code');
        const error = parsedUrl.searchParams.get('error');
        const state = parsedUrl.searchParams.get('state');

        if (error) {
          res.writeHead(400);
          res.end('Authentication failed: ' + error);
          settle(() => {
            server.close(() => {
              reject(new Error(`OAuth error: ${error}`));
            });
          });
          return;
        }

        if (state !== expectedState) {
          res.writeHead(400);
          res.end('Invalid OAuth state');
          settle(() => {
            server.close(() => {
              reject(new Error('OAuth state mismatch'));
            });
          });
          return;
        }

        if (!code) {
          res.writeHead(400);
          res.end('No authorization code received');
          settle(() => {
            server.close(() => {
              reject(new Error('No authorization code'));
            });
          });
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h1>✓ Authentication Successful!</h1>
              <p>You can close this window and return to the CLI.</p>
            </body>
          </html>
        `);

        settle(() => {
          server.close((closeErr) => {
            if (closeErr) {
              reject(closeErr);
              return;
            }
            resolve(code);
          });
          server.closeAllConnections();
        });
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(8085, '127.0.0.1', () => {
      console.log('Local server listening on port 8085...');
      resolveListening();
    });

    server.on('error', (err) => {
      settle(() => {
        rejectListening(err);
        reject(err);
      });
    });
  });

  return {
    waitForCode,
    waitUntilListening,
  };
}
