/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Variant } from '../../colab/api';

const SUPPORTED_VARIANTS = Object.values(Variant);
const SUPPORTED_ACCELERATORS = [
  'T4',
  'G4',
  'V100',
  'A100',
  'L4',
  'H100',
  'V28',
  'V5E1',
  'V6E1',
];

export function printAssignSubcommandHelp(): void {
  console.error('Usage: colab-cli assign <list|add|rm> [options]');
  console.error('  list                    - List all assignments');
  console.error('  add [options]           - Create new assignment');
  console.error('  rm <endpoint>           - Remove assignment');
  console.error('  add options:');
  console.error(
    `    --variant <${SUPPORTED_VARIANTS.join('|')}>`,
  );
  console.error(
    `    --accelerator <${SUPPORTED_ACCELERATORS.join('|')}>`,
  );
  console.error('    --shape <STANDARD|HIGHMEM>');
  console.error('  Run "colab-cli assign add --help" for details.');
}

export function printAssignAddHelp(): void {
  console.log('Usage: colab-cli assign add [options]');
  console.log('  --variant <DEFAULT|GPU|TPU>');
  console.log(
    `  --accelerator <${SUPPORTED_ACCELERATORS.join('|')}>`,
  );
  console.log('  --shape <STANDARD|HIGHMEM>');
  console.log('');
  console.log('Examples:');
  console.log('  colab-cli assign add --variant GPU --accelerator T4');
  console.log('  colab-cli assign add --variant TPU --accelerator V5E1');
}

export function printFsSubcommandHelp(): void {
  console.error(
    'Usage: colab-cli fs <ls|cat|pull|push> [args] [--assign ENDPOINT]',
  );
  console.error('  ls [path]               - List files in remote directory');
  console.error('  cat <remote-path>       - Print remote file to stdout');
  console.error('  pull <remote> [local]   - Download remote file');
  console.error('  push <local> [remote]   - Upload local file');
}

export function printExecHelp(): void {
  console.log('Usage: colab-cli exec [options] [code]');
  console.log('  --code <python-code>    Execute inline Python code');
  console.log('  --file <path>           Execute Python from local file');
  console.log('  --timeout <seconds>     Execution timeout (default: 300)');
  console.log('  --output <text|json>    Output format (default: text)');
  console.log('  --no-wait               Dispatch execution and return immediately');
  console.log('  --assign <endpoint>     Target assignment endpoint');
  console.log('');
  console.log('Examples:');
  console.log('  colab-cli exec --code "print(1)"');
  console.log('  colab-cli exec --file ./train.py --timeout 900 --output json');
  console.log('  colab-cli exec --code "import time; time.sleep(60)" --no-wait');
}

export function printHelp(): void {
  console.log(`
Colab CLI - Manage Colab servers from the command line

Usage:
  colab-cli <command> [options]

Commands:
  login                    OAuth login to Google
  logout                   Logout and clear credentials
  me                       Show current user info
  quota                    Show remaining CCU quota
  terminal [--assign ENDPOINT]  Open terminal session
  exec [options] [code]    Execute Python code via Jupyter kernel
  fs <subcommand>          File operations on assigned runtime
    ls [path]                  List files in remote directory
    cat <remote-path>          Print remote file to stdout
    pull <remote> [local]      Download remote file
    push <local> [remote]      Upload local file
  assign list              List all active assignments
  assign add [options]     Create a new assignment
    --variant <${SUPPORTED_VARIANTS.join('|')}>   Machine variant (default: DEFAULT)
    --accelerator <${SUPPORTED_ACCELERATORS.join('|')}>   Specific accelerator
    --shape <STANDARD|HIGHMEM>    Machine shape
  assign rm <endpoint>     Remove an assignment

Examples:
  colab-cli login
  colab-cli me
  colab-cli quota
  colab-cli terminal
  colab-cli terminal --assign m-s-abc123
  colab-cli exec --code "print(1)"
  colab-cli fs ls /content
  colab-cli fs pull /content/test.txt ./test.txt
  colab-cli fs push ./local.txt /content/local.txt
  colab-cli assign list
  colab-cli assign add --variant GPU
  colab-cli assign rm m-s-abc123
`);
}
