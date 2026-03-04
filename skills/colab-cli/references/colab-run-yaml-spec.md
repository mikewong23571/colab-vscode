# colab-run.yaml Spec (Simple)

Use this file to define one reproducible Colab run.

## Schema

```yaml
schema_version: 1

repo:
  url: https://github.com/<owner>/<repo>.git
  ref: <commit-sha-or-branch-or-tag>
  local_dir: /content/workspace/repo

runtime:
  workdir: .
  env:
    EXAMPLE_FLAG: "1"

steps:
  install:
    - pip install -r requirements.txt
  run:
    - python scripts/run.py --config configs/train.yaml
```

## Fields

- `schema_version` (required): must be `1`.
- `repo.url` (required): Git clone URL (`https://...`, `ssh://...`, `file://...`).
- `repo.ref` (optional): target commit/branch/tag. Default: `main`.
- `repo.local_dir` (optional): absolute or relative path to local checkout. Default: `/content/workspace/repo`.
- `runtime.workdir` (optional): path inside `repo.local_dir` where commands run. Default: `.`.
- `runtime.env` (optional): map of environment variables injected into `install` and `run` steps.
- `steps.install` (optional): list of shell commands for environment setup.
- `steps.run` (required): list of shell commands for the actual job.

## Execution Contract

1. Clone repo if `repo.local_dir` does not exist; otherwise fetch updates.
2. Checkout `repo.ref`.
3. Run each `steps.install` command in order.
4. Run each `steps.run` command in order.
5. Stop immediately on first non-zero exit code.

## Minimal Example

```yaml
schema_version: 1
repo:
  url: https://github.com/<owner>/<repo>.git
  ref: 0123abcd
runtime:
  workdir: .
steps:
  run:
    - python scripts/run.py
```
