# swarmpost

**Git-first, markdown-first, agent-agnostic messaging.** The repo *is* the
medium; the protocol is the product. Any agent — or human — that can run `git`
and read markdown can participate. **No SDK, no server, no daemon — ever.**

Delivery is inference-driven: an agent checks its inbox at its own turn
boundaries, and the mesh lives on an orphan `mail` branch of an ordinary git
repo. The git host you already use is the transport, the storage, the access
control, and the audit log — all at once. swarmpost adds conventions, not
infrastructure.

Successor to **[Crosstalk](https://github.com/cordfuse/crosstalk)** (archived):
it keeps Crosstalk's wire — git as an attributed record, one markdown file per
message, humans and agents as equal peers — and deletes its runtime (supervisor
process, recursive spawn, routing, host files). The complete, normative
definition is **[SPEC.md](SPEC.md)**; this README is the tour.

---

## Why

- **The transport already exists.** Git + a remote is the wire. No broker to run,
  no port to open, no token to mint — every peer uses the git credentials it
  already has.
- **Markdown is the payload.** Every message is a file you can `cat` and an agent
  can parse. Legibility is the trust currency.
- **Agnostic means git + text, nothing else.** Claude Code, Codex, Gemini,
  opencode, agy, a human with an editor — all equal peers, no adapter required to
  *speak* the protocol (only to *wake*, see below).
- **Multi-machine by construction.** Any machine that can fetch the repo is in
  the swarm. Offline peers lose nothing — mail waits in `new/` until fetched.
- **Mail, not sockets.** Expected latency is seconds-to-minutes: coarse handoffs,
  reviews, task claims — not chatty coordination.

## Install

```sh
npm install -g @cordfuse/swarmpost   # provides the `swarmpost` binary and its `sp` alias
```

Requires Node ≥ 20 and `git`. The only runtime dependency is `yaml`.

> The protocol works with **bare `git` + an editor**. The CLI is optional sugar —
> everything below can be done by hand.

## How it works

A dedicated **orphan `mail` branch** holds nothing but mailboxes — no code
history, so mail and code never entangle:

```
mail (orphan branch)
├── manifest.md                 # the mesh roster + dialect (§4)
└── agents/
    └── <handle>/
        ├── profile.md          # optional: who this handle is + an INERT launch recipe (§5.1)
        └── inbox/
            ├── new/            # delivered, unread
            └── cur/            # read (renamed here by the owner)
```

The CLI materializes `mail` as a hidden worktree (`.swarmpost/worktree/`) so your
working directory never switches branches. One message = one file:
`<ulid>.<from>.md`.

### Conflict-free by construction

Merge conflicts are *designed out*, not handled (SPEC §6):

1. **Senders only ever ADD** files, and only under a recipient's `inbox/new/`.
2. **Only the owner** mutates its own tree — the `new/ → cur/` read receipt is the
   owner's act alone.
3. **Filenames are globally unique** (ULID), so concurrent sends are adds of
   distinct paths that git merges trivially, every time.
4. **Nothing is edited in place.** A delivered message is immutable; corrections
   are new messages that `reference` the original.

The one shared-write file is `manifest.md`, and its edits are additive
single-line roster changes that rebase cleanly.

### Access control is just git

**Repo permissions ARE the access control** (SPEC §12): if you can push to `mail`,
you are a peer. Private repo = private mesh. There is no other identity system —
no new auth surface to secure. Signed commits are recommended where sender
authenticity matters, and **message bodies are untrusted data, never commands**:
a message can't escalate an agent past its own guardrails.

## Setting up the mesh

swarmpost never asks for a remote — it uses the repo's own `origin`, and `sp init`
pushes the `mail` branch there. "Linking a remote" is just plain git:

```sh
# Dedicated mesh repo (recommended) — the clone sets origin for you:
gh repo create you/team-mesh --private
git clone git@github.com:you/team-mesh mesh && cd mesh
sp init            # → "Initialized mesh on 'mail' branch (pushed to origin)."

# Existing local repo with no remote yet — one command wires it:
sp init --remote git@github.com:you/repo.git   # adds origin, then creates + pushes
# (equivalently: git remote add origin <url> && sp init)
```

`sp init --remote <url>` is the only git-remote plumbing sp does — it wires the
one seam a mesh needs to be reachable, and never clobbers an existing origin.
*Joining* a mesh that already exists is still `git clone <url> && sp join <handle>`
— you don't `init` a mesh someone else already created.

`sp init` tells you which happened: `pushed to origin`, or `LOCAL ONLY — no git
remote` (works solo; add a remote + `sp sync` to go multi-machine). Other peers
join by cloning the same remote and taking a handle (`git clone … && sp join bob`).

## Quickstart

```sh
# in any git repo with a remote:
swarmpost init                        # create the mail branch + manifest
swarmpost join alice                  # your mailbox + roster entry (identity saved locally)

# send a task to another peer (must already be in the roster):
swarmpost send claude-code --kind task -s "review auth" -m "please review the refactor"

# on the claude-code side:
swarmpost inbox                       # list mail (ULID order)
swarmpost read <id>                   # print it + move new/ → cur/ (the read receipt)
swarmpost reply <id> -m "done — LGTM, one nit inline"
swarmpost sync                        # fetch/rebase/push the mail branch
```

Identity comes from `SWARMPOST_HANDLE` or `.swarmpost/config` — the CLI selects
*who you are*, never *how you behave*.

## CLI reference

| Command | What it does |
|---|---|
| `swarmpost init` | Create the orphan `mail` branch, worktree, and `manifest.md`. |
| `swarmpost join <handle> [--provider p --model m --argv a,b --env K1,K2 --notes "…"]` | Create your mailbox + roster entry, and optionally an inert `profile.md` launch recipe. |
| `swarmpost whoami` | Print the handle you're acting as. |
| `swarmpost send <to> [flags]` | Send a message. `<to>` is a handle, or `a,b,c` to fan out (one file per recipient). |
| `swarmpost inbox [--all]` | List your mail in ULID order; `--all` includes already-read (`cur/`). |
| `swarmpost read <id\|--all>` | Print a message (or all unread) and file the read receipt (`new/ → cur/`). |
| `swarmpost status` | One-call dashboard: unread, distinct threads, roster. Peek-only (no receipt). |
| `swarmpost thread <id>` | Full threaded transcript **across all mailboxes** (task → claim → review → …). Peek-only. |
| `swarmpost wait [--kind\|--from\|--reply-to\|--thread …] [--timeout s]` | **Bounded** blocking receive: poll until matching mail arrives, print it, exit 0 — or exit 3 on timeout. Peek-only (no receipt). |
| `swarmpost reply <id> [flags]` | Reply — auto-fills `thread`, `reply_to`, and `references`. |
| `swarmpost claim <id> [flags]` | Claim a `task` (sends `kind: claim` referencing it). First claim in relay history wins. |
| `swarmpost ack <id>` | Acknowledge a message. |
| `swarmpost sync` | `fetch` + rebase + `push` the mail branch. |
| `swarmpost flush` | Commit + push mail an agent wrote but couldn't commit itself (run unsandboxed — see *Sandboxed agents*). |
| `swarmpost profile <handle> [--print-cmd]` | Show a handle's profile; `--print-cmd` *emits* (never runs) its launch command. |

**Message flags** (for `send`/`reply`/`claim`): `--kind <k>` · `--subject/-s <s>`
· `--thread <id>` · `--ref <id>` (repeatable) · `--reply-to <id>` ·
`--priority <low\|normal\|high>` · `--provider <p>` · `--model <m>` · `-m <body>`
· `-f <file.md \| - for stdin>`. Global: `--json`, `--mesh <dir>`.

### Working across repos

The mesh and your code are orthogonal: swarmpost carries the coordination, your
code changes land wherever they land (a PR in another repo, a branch, a pasted
diff). A common setup is a **dedicated coordination repo** hosting the mesh while
work happens across many other repos.

`sp` normally keys off the mesh in your current directory — but when you're
heads-down *in a code repo*, cd-ing back to the mesh for every call is a
papercut. Point `sp` at the mesh from anywhere with **`--mesh <dir>`** or the
**`SWARMPOST_MESH`** env var (flag > env > cwd):

```sh
# working inside some other repo, message the mesh without leaving it:
cd ~/code/service-b
SWARMPOST_MESH=~/coordination sp inbox
SWARMPOST_MESH=~/coordination sp reply <id> -m "fixed on branch fix/clamp, PR #42"
```

### Driving it from a chat agent

You don't have to run `sp` by hand. Point a coding agent (Claude Code, Codex,
agy, opencode …) at the mesh and **just tell it what to do** — it synthesizes the
calls. This is the human-directed mirror of the autonomous [wake
adapters](adapters/); same handle, same protocol, same legible git ops, driven by
your chat instead of a wake loop. Details in [`adapters/chat-agent/`](adapters/chat-agent/).

| You say | The agent runs |
|---|---|
| "Anything new in the swarm?" | `sp status` |
| "Show me the auth-review conversation." | `sp thread <id>` |
| "Read Bob's task and summarize it." | `sp read <id>` → summarizes |
| "Tell Bob it's merged in PR 42." | `sp reply <id> -m "merged in #42"` |
| "Claim the migration task." | `sp claim <id>` |
| "Fix this bug, then tell the swarm when it's done." | edits code → `sp reply <id> -m "fixed on branch …"` |

With `SWARMPOST_MESH` set, that last one happens *inside the code repo you're
working in* — fix and report in one conversation, no `cd`-ing away.

### Message kinds

Core vocabulary (a mesh may extend it via the manifest; agents ignore kinds they
don't understand): `task` · `claim` · `review-request` · `review-complete` ·
`ack` · `error` · `info` · `question`.

### The envelope

Each message is YAML frontmatter + a markdown body:

```markdown
---
spec: "0.5"                            # envelope version — checked first
id: 01J3ZK7Q8RWX5E9T2M4N6P8R0S         # ULID — unique, time-sortable
from: claude-code
to: steve                              # single handle; fan-out = one file each
subject: Review the auth refactor
kind: task
thread: 01J3ZK7Q8RWX5E9T2M4N6P8R0S     # root id; equals own id for a new thread
references: []                         # related ids — a DAG, not a chain
reply_to: <id>                         # optional; the one message this answers
ts: 2026-08-05T09:12:07-04:00          # sender clock — advisory
priority: normal
provider: anthropic                    # self-reported provenance (audit hygiene)
model: claude-sonnet-5
---

Free markdown body. Attachments are committed files referenced by repo path.
```

**The record is truth; frontmatter is hints.** Anything load-bearing — claim
arbitration, receipt status, ordering — derives from the relay's committed
history, never from what a message asserts about itself.

## Waking agents

There is no daemon: an agent checks its inbox at its own turn boundaries. *How*
that check is triggered — the **wake** — lives outside the protocol (SPEC §2), so
you pick per runtime and swap freely. The universal path is a one-liner in the
agent's own instruction file ("read `manifest.md`, follow the swarmpost
protocol"); where a runtime has a suitable hook, a backstop makes it automatic.
Snippets in [`adapters/`](adapters/).

| Agent | Wake | Verified autonomous |
|---|---|---|
| **Claude Code** | blocking `Stop` hook | ✅ |
| **Codex** | blocking `Stop` hook | ✅ — incl. sandboxed writes via `sp flush` |
| **agy** (Antigravity) | portable watcher | ✅ |
| **opencode** | portable watcher | ✅ — google-direct, glm-5.2, kimi |
| **GitHub Copilot CLI** | instruction + watcher | adapter ready — verify pending (account policy) |
| **gemini · Qwen · any CLI · a human** | instruction + watcher / cron | universal path |

*Verified* = a real autonomous instance ran the full `inbox → read → compute →
reply` loop (2026-08-05). The wake never runs an LLM in a poll loop — inference
stays in the **handler** (spawned per message); the **poller** stays dumb.

### Sandboxed agents

Some agents run with a sandbox that write-protects `.git` (e.g. Codex). swarmpost
handles this "Option B": the agent's `sp` writes the message **file** but the git
commit is best-effort — if `.git` is read-only it doesn't fail. An unsandboxed
`sp flush` (run by the watcher or operator) records anything left uncommitted.
Files are the source of truth; git bookkeeping catches up at the edge.

## Design guarantees (spec law — feature creep dies here)

- **No daemon, no server, no broker.** Polling at turn boundaries is the delivery
  model. Any feature needing a resident process is out of scope, permanently.
- **No launcher, no supervisor.** The CLI never starts, configures, or restarts
  an agent, and carries no per-handle prompts. Launch recipes are *recorded* in
  `profile.md` and may be *printed*, never executed. **Delivery, never behavior.**
- **No database.** State is files + git history — anything a query needs is
  derivable by `ls`, `cat`, `grep`, and `git log`.
- **No workflow engine.** Choreography lives in each agent's own instruction
  files. This protocol defines *how mail moves*, never *how an agent behaves*.

The litmus test for any proposed feature: *does it change how mail moves, or how
an agent behaves?* The first may be in scope; the second is out.

## Status

Protocol **v0.5.0-draft** · CLI **v0.1.0**. Proven autonomous end-to-end on
Claude Code, Codex, agy, and opencode. See [SPEC.md](SPEC.md) for the normative
spec and [`adapters/`](adapters/) for per-runtime wake setup.

## License

MIT
