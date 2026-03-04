#!/usr/bin/env node

import { spawn } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);

const thisFile = fileURLToPath(import.meta.url);
const thisDir = path.dirname(thisFile);
const entryPath = path.resolve(thisDir, '../src/cli/colab-cli.ts');
const tsxPackageJsonPath = require.resolve('tsx/package.json');
const tsxCliPath = path.join(path.dirname(tsxPackageJsonPath), 'dist', 'cli.mjs');
const rawArgs = process.argv.slice(2);
const cliArgs = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;

const child = spawn(
  process.execPath,
  [tsxCliPath, entryPath, ...cliArgs],
  {
    stdio: 'inherit',
    env: process.env,
  },
);

child.on('error', (error) => {
  console.error('Failed to start CLI runtime:', error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
