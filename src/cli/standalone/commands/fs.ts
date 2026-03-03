/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';

import { handleError } from '../errors';
import { printFsSubcommandHelp } from '../help';
import { printContentsEntry } from '../output';
import {
  decodeContentsFile,
  ensureLocalFileExists,
  getContents,
  normalizeRemotePath,
  putFileContents,
  resolveAssignmentConnection,
  writeLocalFile,
} from '../runtime';

export async function cmdFs(
  subcommand: string | undefined,
  positionalArgs: string[],
  options: { assign?: string },
): Promise<void> {
  switch (subcommand) {
    case 'ls':
      await cmdFsLs(positionalArgs[0], options);
      return;
    case 'cat':
      await cmdFsCat(positionalArgs[0], options);
      return;
    case 'pull':
      await cmdFsPull(positionalArgs[0], positionalArgs[1], options);
      return;
    case 'push':
      await cmdFsPush(positionalArgs[0], positionalArgs[1], options);
      return;
    default:
      printFsSubcommandHelp();
      process.exit(1);
  }
}

async function cmdFsLs(
  remotePath: string | undefined,
  options: { assign?: string },
): Promise<void> {
  try {
    const { endpoint, runtimeProxy } = await resolveAssignmentConnection({
      assign: options.assign,
    });
    const targetPath = normalizeRemotePath(remotePath);
    const response = await getContents(runtimeProxy, targetPath);

    console.log(`Assignment: ${endpoint}`);
    console.log(`Path: /${targetPath}`);
    if (response.type !== 'directory') {
      printContentsEntry({
        name: response.name ?? path.basename(response.path),
        path: response.path,
        type: response.type,
        size: undefined,
      });
      return;
    }

    const entries = Array.isArray(response.content) ? response.content : [];
    if (entries.length === 0) {
      console.log('(empty)');
      return;
    }
    for (const entry of entries) {
      printContentsEntry(entry);
    }
  } catch (error) {
    handleError(error);
    process.exit(1);
  }
}

async function cmdFsCat(
  remotePath: string | undefined,
  options: { assign?: string },
): Promise<void> {
  if (!remotePath) {
    console.error('Error: Remote path is required');
    console.error(
      '  Usage: colab-cli fs cat <remote-path> [--assign <endpoint>]',
    );
    process.exit(1);
  }

  try {
    const { runtimeProxy } = await resolveAssignmentConnection({
      assign: options.assign,
    });
    const response = await getContents(
      runtimeProxy,
      normalizeRemotePath(remotePath),
    );
    if (response.type === 'directory') {
      throw new Error(`Path is a directory: ${remotePath}`);
    }
    const fileData = decodeContentsFile(response);
    process.stdout.write(fileData);
  } catch (error) {
    handleError(error);
    process.exit(1);
  }
}

async function cmdFsPull(
  remotePath: string | undefined,
  localPath: string | undefined,
  options: { assign?: string },
): Promise<void> {
  if (!remotePath) {
    console.error('Error: Remote path is required');
    console.error(
      '  Usage: colab-cli fs pull <remote-path> [local-path] [--assign <endpoint>]',
    );
    process.exit(1);
  }

  const resolvedLocalPath = localPath?.trim().length
    ? localPath
    : path.basename(normalizeRemotePath(remotePath));

  try {
    const { runtimeProxy } = await resolveAssignmentConnection({
      assign: options.assign,
    });
    const response = await getContents(
      runtimeProxy,
      normalizeRemotePath(remotePath),
    );
    if (response.type === 'directory') {
      throw new Error(`Path is a directory: ${remotePath}`);
    }
    const fileData = decodeContentsFile(response);
    writeLocalFile(resolvedLocalPath, fileData);
    console.log(`✓ Pulled ${remotePath} -> ${resolvedLocalPath}`);
  } catch (error) {
    handleError(error);
    process.exit(1);
  }
}

async function cmdFsPush(
  localPath: string | undefined,
  remotePath: string | undefined,
  options: { assign?: string },
): Promise<void> {
  if (!localPath) {
    console.error('Error: Local path is required');
    console.error(
      '  Usage: colab-cli fs push <local-path> [remote-path] [--assign <endpoint>]',
    );
    process.exit(1);
  }

  try {
    ensureLocalFileExists(localPath);
  } catch (error) {
    handleError(error);
    process.exit(1);
  }

  const resolvedRemotePath = remotePath?.trim().length
    ? normalizeRemotePath(remotePath)
    : path.basename(localPath);

  try {
    const { runtimeProxy } = await resolveAssignmentConnection({
      assign: options.assign,
    });
    const fileData = fs.readFileSync(localPath);
    await putFileContents(runtimeProxy, resolvedRemotePath, fileData);
    console.log(`✓ Pushed ${localPath} -> /${resolvedRemotePath}`);
  } catch (error) {
    handleError(error);
    process.exit(1);
  }
}
