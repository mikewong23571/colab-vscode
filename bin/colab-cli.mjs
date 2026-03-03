#!/usr/bin/env node

import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

// Register TS transpilation at runtime for CLI source files.
await import('tsx/esm');

const thisFile = fileURLToPath(import.meta.url);
const thisDir = path.dirname(thisFile);
const entryPath = path.resolve(thisDir, '../src/cli/colab-cli.ts');
await import(pathToFileURL(entryPath).href);
