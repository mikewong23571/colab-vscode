# Local + Colab Git Workflow (Minimal)

Use this workflow to keep local development and Colab execution consistent.

## Core Rules

1. Keep code in Git only.
2. Use one entrypoint script (for example `scripts/run.py`).
3. Run Colab jobs from a pinned commit SHA.
4. Keep data and model artifacts outside Git (Drive/GCS/etc.).

## Local Flow

```bash
git add .
git commit -m "your change"
git push origin main
```

## Colab Flow

```bash
# One-time clone in runtime (or reuse existing repo dir)
git clone https://github.com/<owner>/<repo>.git
cd <repo>

# Always pin to an exact version
git fetch --all --tags
git checkout <commit-sha>

# Reproducible environment + single entrypoint
pip install -r requirements.txt
python scripts/run.py --config configs/train.yaml
```

## Collaboration Contract

- Edit code locally, not directly in Colab runtime.
- Use pull requests and commit SHAs for review and reruns.
- Record run metadata: commit SHA, params, timestamp, key metrics.

## Optional: Trigger Through Colab CLI

Use Colab CLI only as an execution trigger layer; keep business logic in the repository entrypoint.
