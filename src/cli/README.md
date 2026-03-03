# Colab CLI

Command-line tool for managing Google Colab servers.

## Quick Start

```bash
# 1. Configure OAuth credentials (only once)
cp .env.template .env
# Edit .env and add your OAuth credentials

# 2. Login
npm run cli -- login

# 3. Use CLI commands
npm run cli -- me
npm run cli -- quota
npm run cli -- assign list
npm run cli -- terminal
npm run cli -- exec --code "print('hello from colab')"
```

## Run via `npx` from GitHub

After you push CLI changes to your own GitHub fork, you can run the CLI directly
without cloning:

```bash
# SSH repo URL (your fork)
npx --yes --package=git+ssh://git@github.com/mikewong23571/colab-vscode.git#main colab-cli -- help

# Example command
npx --yes --package=git+ssh://git@github.com/mikewong23571/colab-vscode.git#main colab-cli -- me
```

Notes:

- `#main` can be replaced with any branch, tag, or commit SHA.
- This works based on the Git URL you pass to `npx`; your local git `origin`
  remote pointing to upstream does not affect execution.

## Configuration

The CLI uses OAuth 2.0 credentials to authenticate with Google. These must be configured before using the CLI.

### Step 1: Copy Environment Template

```bash
cp .env.template .env
```

### Step 2: Add OAuth Credentials

Edit `.env` and fill in your Google OAuth 2.0 credentials:

```bash
COLAB_EXTENSION_ENVIRONMENT=production
COLAB_EXTENSION_CLIENT_ID=your-client-id.apps.googleusercontent.com
COLAB_EXTENSION_CLIENT_NOT_SO_SECRET=your-client-secret
```

### Where to Get OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select an existing one
3. Enable the "Colab API" or use existing Colab credentials
4. Create OAuth 2.0 Client ID credentials
5. Set authorized redirect URIs to `http://localhost:8085/callback`
6. Copy the Client ID and Client Secret to your `.env` file

## Commands

### Login

Authenticate with Google to access Colab:

```bash
npm run cli -- login
```

This will:

1. Open your default browser
2. Prompt you to grant Colab CLI access to your Google account
3. Save OAuth credentials to `~/.colab-cli/credentials.json`

### Logout

Clear stored credentials:

```bash
npm run cli -- logout
```

### View User Info

Display current user information:

```bash
npm run cli -- me
```

Example output:

```
User Information:
─────────────────────────────────────
  Subscription Tier: PRO
  Paid CCU Balance:  10.50
  Eligible Accelerators:
    - GPU: T4, V100
    - TPU: V3
```

### View Quota

Display CCU (Colab Compute Units) quota information:

```bash
npm run cli -- quota
```

Example output:

```
Quota Information:
─────────────────────────────────────
  Subscription Tier:     PRO
  Paid CCU Balance:      10.50
  Hourly Consumption:    2.50 CCU/h
  Active Assignments:    2
  Free CCU Remaining:    5.00 CCU
  Next Refill:           2026-03-04T00:00:00.000Z
```

### List Assignments

View all active server assignments:

```bash
npm run cli -- assign list
```

Example output:

```
Found 2 assignment(s):

  Endpoint:        m-s-abc123
  Accelerator:     T4
  Variant:         GPU
  Machine Shape:   STANDARD
  Proxy URL:       https://8080-m-s-abc123.prod.colab.dev
  Token Expires:   2026-03-03T14:00:00.000Z (3600s)

  Endpoint:        m-s-def456
  Accelerator:     NONE
  Variant:         DEFAULT
  Machine Shape:   STANDARD
```

### Create Assignment

Allocate a new Colab server:

```bash
npm run cli -- assign add [options]
```

Options:

- `--variant <DEFAULT|GPU|TPU>` - Machine variant (default: DEFAULT)
- `--accelerator <T4|V100|A100|...>` - Specific accelerator type
- `--shape <STANDARD|HIGHMEM>` - Machine memory shape

Examples:

```bash
# Create a default CPU server
npm run cli -- assign add

# Create a GPU server with T4 accelerator
npm run cli -- assign add --variant GPU --accelerator T4

# Create a high-memory TPU server
npm run cli -- assign add --variant TPU --shape HIGHMEM
```

### Remove Assignment

Delete an existing server assignment:

```bash
npm run cli -- assign rm <endpoint>
```

Example:

```bash
npm run cli -- assign rm m-s-abc123
```

### Terminal Access

Attach an interactive terminal session to an assigned runtime:

```bash
# Requires exactly one active assignment
npm run cli -- terminal

# Attach to a specific assignment
npm run cli -- terminal --assign m-s-abc123
```

### Code Execution

Execute Python code through the runtime's Jupyter kernel channel:

```bash
# Inline code
npm run cli -- exec --code "print('hello from colab')"

# Execute a local python file
npm run cli -- exec --file ./script.py --timeout 600

# Structured JSON output
npm run cli -- exec --code "import torch; print(torch.__version__)" --output json

# Dispatch and return immediately (no output wait)
npm run cli -- exec --code "import time; time.sleep(60)" --no-wait
```

`exec` requires exactly one active assignment (or `--assign` matching that assignment).
`--no-wait` only guarantees request dispatch; it does not stream or await output.

### File System Access

Operate on files inside the assigned runtime:

```bash
# List files
npm run cli -- fs ls /content

# Print file content
npm run cli -- fs cat /etc/hosts

# Download file
npm run cli -- fs pull /content/sample_data/README.md ./README.remote.md

# Upload file
npm run cli -- fs push ./local.txt /content/local.txt
```

All `fs` subcommands accept `--assign <endpoint>` to target a specific assignment.
`terminal`, `fs`, and `exec` require exactly one active assignment.

## Source Isolation Policy

To avoid conflicts with upstream product code, CLI feature development must stay isolated:

- Keep CLI implementation changes inside `src/cli/` (for example `src/cli/standalone/` and CLI docs).
- Do not modify upstream business modules for CLI-only behavior (for example `src/colab/`, `src/auth/`, `src/jupyter/`).
- Exceptions are limited to required dependency updates and strictly necessary shared contract changes.

## Credentials Storage

OAuth credentials are stored in `~/.colab-cli/credentials.json` with secure file permissions (0600).

The credentials include:

- `refresh_token` - Long-lived token for obtaining new access tokens
- `access_token` - Current access token
- `expiry_date` - Token expiration timestamp

## Error Handling

The CLI provides helpful error messages for common issues:

| Error                            | Solution                                             |
| -------------------------------- | ---------------------------------------------------- |
| Not logged in                    | Run `npm run cli -- login`                           |
| OAuth credentials not configured | Add credentials to `.env` file                       |
| Too many assignments             | Run `assign rm` to remove an existing assignment     |
| Insufficient quota               | Run `quota` to check your available CCU              |
| Account denylisted               | Your account has been blocked due to suspected abuse |

## Troubleshooting

### Browser doesn't open automatically

Copy the displayed URL and paste it into your browser manually.

### Token expired

The CLI automatically refreshes tokens. If you encounter auth errors, run `login` again.

### Too many assignments

Colab limits the number of concurrent assignments. Remove unused ones with `assign rm`.

### Invalid OAuth credentials

Make sure your `.env` file contains valid Client ID and Client Secret from Google Cloud Console.

## Environment Variables

| Variable                               | Required | Description                                              |
| -------------------------------------- | -------- | -------------------------------------------------------- |
| `COLAB_EXTENSION_CLIENT_ID`            | Yes      | OAuth 2.0 Client ID                                      |
| `COLAB_EXTENSION_CLIENT_NOT_SO_SECRET` | Yes      | OAuth 2.0 Client Secret                                  |
| `COLAB_EXTENSION_ENVIRONMENT`          | No       | One of: production, sandbox, local (default: production) |

## API Reference

The CLI uses the following Colab backend APIs:

| Endpoint                                      | Method   | Description                 |
| --------------------------------------------- | -------- | --------------------------- |
| `/v1/user-info`                               | GET      | Get user subscription info  |
| `/v1/user-info?get_ccu_consumption_info=true` | GET      | Get CCU quota details       |
| `/v1/assignments`                             | GET      | List all active assignments |
| `/v1/runtime-proxy-token`                     | GET      | Get runtime proxy token     |
| `/tun/m/assign`                               | GET/POST | Create or check assignment  |
| `/tun/m/unassign/{endpoint}`                  | GET/POST | Remove an assignment        |
| `/api/contents/*`                             | GET/PUT  | Runtime file operations     |

## License

Apache 2.0 - See [LICENSE](../LICENSE) for details.
