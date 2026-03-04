---
name: colab-cli
description: Run Google Colab CLI commands from a GitHub fork/branch/tag/commit with npx and no local install. Use when asked to run `colab-cli` from terminal, verify CLI behavior on specific Git refs, test fork changes quickly, or avoid local workspace drift. Prefer `npx --yes --package=git+https://... colab-cli -- ...`; use local `npm run cli -- ...` only when explicitly requested.
---

# Colab CLI

## Overview

Execute Colab CLI commands directly from a remote Git ref with `npx`.
Prefer `npx + git` over local runtime to keep execution reproducible and tied to an explicit commit/branch.
For a repo-agnostic collaboration pattern, read `references/local-colab-git-workflow.md`.
For config-driven bootstrap runs, read `references/colab-run-yaml-spec.md`.

## Config-Driven Bootstrap

Use `scripts/colab_bootstrap.py` when the user asks for a single reusable entrypoint
that reads `colab-run.yaml` and runs clone/fetch/checkout/install/run in sequence.

```bash
# Validate and preview commands
python skills/colab-cli/scripts/colab_bootstrap.py --config colab-run.yaml --dry-run --print-config

# Execute
python skills/colab-cli/scripts/colab_bootstrap.py --config colab-run.yaml
```

If `PyYAML` is missing, install it first:

```bash
pip install pyyaml
```

## Execution Workflow

1. Resolve source and ref.
- Prefer `git+https://github.com/mikewong23571/colab-vscode.git#main`.
- Use `#main` by default; replace it with a tag or commit SHA when needed.

2. Build the command with `npx`.

```bash
npx --yes --package=git+https://github.com/mikewong23571/colab-vscode.git#main colab-cli -- <command> [args]
```

3. Optionally use SSH package URL if SSH access is configured.

```bash
npx --yes --package=git+ssh://git@github.com/mikewong23571/colab-vscode.git#main colab-cli -- <command> [args]
```

4. Load OAuth env for auth-required commands (`login`, `me`, `quota`, `assign`, `terminal`, `exec`, `fs`).

```bash
source ~/.zsh.secrets
```

5. Execute and report.
- Show the exact command used.
- Summarize key output and errors.

## Command Patterns

```bash
# Help
npx --yes --package=git+https://github.com/mikewong23571/colab-vscode.git#main colab-cli -- help

# Login
npx --yes --package=git+https://github.com/mikewong23571/colab-vscode.git#main colab-cli -- login

# User and quota
npx --yes --package=git+https://github.com/mikewong23571/colab-vscode.git#main colab-cli -- me
npx --yes --package=git+https://github.com/mikewong23571/colab-vscode.git#main colab-cli -- quota

# Assignments
npx --yes --package=git+https://github.com/mikewong23571/colab-vscode.git#main colab-cli -- assign list
npx --yes --package=git+https://github.com/mikewong23571/colab-vscode.git#main colab-cli -- assign add --variant GPU --accelerator T4
npx --yes --package=git+https://github.com/mikewong23571/colab-vscode.git#main colab-cli -- assign rm <endpoint>
```

## Decision Rules

- Default to `npx + git`.
- Prefer HTTPS Git URL first; use SSH URL only when SSH access is configured.
- Use local `npm run cli -- ...` only when user explicitly asks to run the local checkout.
- If a local run fails due to generated-file drift (for example missing `src/colab-config.ts`), use `npx + git` to isolate from local build state.

## Troubleshooting

- `Permission denied (publickey)`: switch package URL from `git+ssh://` to `git+https://`.
- `OAuth credentials not configured`: source secrets and verify `COLAB_EXTENSION_CLIENT_ID` and `COLAB_EXTENSION_CLIENT_NOT_SO_SECRET`.
- Wrong behavior on `main`: pin to a tag or commit SHA and rerun.
- Browser does not open during `login`: use the printed URL manually.
