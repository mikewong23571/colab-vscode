/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { cmdAssignAdd, cmdAssignList, cmdAssignRm } from './commands/assign';
import { cmdExec } from './commands/exec';
import { cmdFs } from './commands/fs';
import { cmdLogin, cmdLogout } from './commands/login';
import { cmdMe } from './commands/me';
import { cmdQuota } from './commands/quota';
import { cmdTerminal } from './commands/terminal';
import { printAssignAddHelp, printAssignSubcommandHelp, printHelp } from './help';

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const options: Record<string, string> = {};
  const positionalArgs: string[] = [];

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        options[key] = next;
        i++;
      } else {
        options[key] = 'true';
      }
    } else {
      positionalArgs.push(args[i]);
    }
  }

  switch (command) {
    case 'login':
      await cmdLogin();
      break;

    case 'logout':
      cmdLogout();
      break;

    case 'me':
      await cmdMe();
      break;

    case 'quota':
      await cmdQuota();
      break;

    case 'terminal':
      await cmdTerminal({ assign: options.assign });
      break;

    case 'exec':
      await cmdExec(positionalArgs, {
        assign: options.assign,
        code: options.code,
        file: options.file,
        timeout: options.timeout,
        output: options.output,
        noWait: options['no-wait'],
        help: options.help,
      });
      break;

    case 'fs':
      await cmdFs(positionalArgs[0], positionalArgs.slice(1), {
        assign: options.assign,
      });
      break;

    case 'assign': {
      const subcommand = positionalArgs[0];
      switch (subcommand) {
        case 'list':
          await cmdAssignList();
          break;
        case 'add':
          if (Object.hasOwn(options, 'help')) {
            printAssignAddHelp();
            break;
          }
          await cmdAssignAdd({
            variant: options.variant,
            accelerator: options.accelerator,
            shape: options.shape,
          });
          break;
        case 'rm':
        case 'remove':
          await cmdAssignRm(positionalArgs[1]);
          break;
        default:
          printAssignSubcommandHelp();
          process.exit(1);
      }
      break;
    }

    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;

    default:
      console.error('Unknown command:', command);
      printHelp();
      process.exit(1);
  }
}
