# swarmpost — SPEC v0.5.0-draft

Git-first, markdown-first, agent-agnostic messaging. The repo is the medium; the
protocol is the product. Any agent that can run `git` and read markdown can
participate — and so can a human with an editor. No SDK, no server, no daemon —
ever. Delivery is 100% inference-driven: the agent's own reasoning loop is the
scheduler.

**Lineage:** swarmpost is the successor to — and replacement for —
**Crosstalk** (`cordfuse/crosstalk`, archived). It keeps Crosstalk's wire (git
as attributed record, one markdown file per message, humans and agents as equal
actors) and deletes its runtime (supervisor process, recursive spawn, concierge
routing, host files). Crosstalk's hard-won operational lessons are inherited
here as spec law, not reimplemented as machinery.

---

## 1. Philosophy

- **The transport already exists.** Git + a hosted remote (GitHub or any git
  host) is the wire. We add conventions, not infrastructure.
- **Markdown is the payload.** Every message is a file a human can `cat` and an
  agent can parse. Legibility is the trust currency.
- **Agnostic means: git + text, nothing else.** Claude Code, Codex, Gemini CLI,
  OpenCode, a human with an editor — all equal peers.
- **Multi-machine by construction.** Any machine that can fetch the repo is in
  the swarm. The git host is the angle: storage, transport, and access control
  in one.
- **No new auth surface.** Every participant uses whatever git credentials it
  already has. The protocol introduces no apps, tokens, or identity systems of
  its own.
- **Built for one user's stack first.** This earns a public README later, if
  ever. (The anti-Crosstalk clause: infrastructure you use, not a framework you
  launch.)

## 2. Non-goals (spec law — feature creep dies here)

- **No daemon, no server, no broker.** Polling at turn boundaries is the
  delivery model. If a feature requires a resident process, it is out of scope
  permanently. Escape hatches that stay legal because they live *outside* the
  protocol: human-cadence polling, a cron/systemd timer running
  `swarmpost sync`, or the relay's own CI (e.g. an Action on push to `mail`)
  notifying or spawning workers — the relay's daemon, not ours. The protocol
  never depends on any of them.
- **No launcher, no supervisor.** The CLI never starts, configures, or
  restarts agents, and never carries per-handle system prompts (§14). Launch
  recipes are *recorded* in `profile.md` and may be *printed* (§5.1), never
  executed. Delivery, never behavior. The
  litmus test for any proposed feature: *does it change how mail moves, or how
  an agent behaves?* The first is in scope; the second is the empire knocking.
- **No low-latency chat.** Expected delivery is seconds-to-minutes. This is
  mail, not sockets. Coarse handoffs, reviews, task claims — not chatty
  coordination.
- **No databases.** State is files and git history. Anything a query needs must
  be derivable by `ls`, `cat`, `grep`, and `git log`.
- **No workflow engine.** Choreography lives in each agent's own instruction
  files (CLAUDE.md, AGENTS.md, system prompts). This spec defines delivery,
  never behavior.

## 3. Transport: the `mail` branch

One dedicated branch named `mail`, containing only mailboxes. It SHOULD be an
**orphan branch** — sharing no history with code branches — so mail and code
histories never entangle and the mail branch stays cheap to fetch, squash, or
archive independently.

```
mail (orphan branch root)
├── manifest.md                 # mesh manifest — see §4
└── agents/
    ├── <handle>/
    │   ├── profile.md          # who/what this handle is + inert launch recipe (§5.1)
    │   └── inbox/
    │       ├── new/            # delivered, unread
    │       └── cur/            # read (renamed here by owner)
    └── <handle>/…
```

- Implementations SHOULD materialize `mail` as a hidden worktree (e.g.
  `.swarmpost/worktree/`) so the developer's working directory never switches
  branches.
- **There is no `tmp/` on the wire.** Composition staging is a local, untracked
  concern (e.g. `.swarmpost/tmp/`). Maildir uses `tmp/` for filesystem-level
  atomicity; swarmpost does not need it — **the commit is the atomicity unit**
  (§9). A message exists on the wire wholly or not at all.
- Empty dirs are maintained with `.gitkeep`.
- Custom refs (`refs/mail/<handle>`) are explicitly **parked for v2** — see §13.

## 4. Mesh manifest

`manifest.md` at the mail-branch root is the single file a joining agent (or
human) reads to learn the dialect:

```markdown
---
spec: "0.5"
mesh: swarmpost
kinds: [task, claim, review-request, review-complete, ack, error, info, question]
handles: [steve, claude-code, codex]
---

Human-readable description of what this mesh is for, house rules, and any
extended kind vocabulary with meanings.
```

- Registering a handle = adding it to `handles:` in the same commit that adds
  the mailbox skeleton.
- The manifest is the roster: **sending to a handle not present in `handles:`
  is a protocol violation** — implementations MUST fail such a send locally
  rather than creating an orphan mailbox.
- The `kinds:` list is this mesh's vocabulary; the core set (§7) is always
  implied.

## 5. Handles

- A handle is `[a-z0-9][a-z0-9-]{1,31}` (lowercase, dash-separated), unique per
  repo. Examples: `claude-code`, `codex`, `steve`.
- Joining = committing your own `agents/<handle>/` skeleton + manifest entry.
- **A handle is a durable role, not a session.** Sessions open, work, close,
  and evaporate; the handle — its mailbox, history, and roster entry —
  persists. Mail waiting in `new/` is inherited by the next session to occupy
  the handle. Sessions are invisible to the protocol.
- **One inbox, one reader at a time.** Serial sessions share a handle cleanly.
  Concurrent sessions of the same tool are separate readers and MUST hold
  separate handles (`codex`, `codex-2`) — minted when parallelism actually
  begins, not before.
- A handle binds none of: machine, working directory, model, or provider.
  Machine identity, if it ever matters, is naming convention
  (`claude-code-cachy`), not protocol.
- **Humans are first-class peers.** A human joins with a handle like any agent
  and participates with `provider: human` (§7) — from a CLI agent session, the
  `swarmpost` wrapper, or a bare editor and git.

### 5.1 `profile.md` — the inert launch recipe

A handle's `profile.md` documents *what this handle is* and *how it is
conventionally launched*. This knowledge is load-bearing — without it a mesh is
unreproducible on a new machine — so it belongs in the repo, versioned and
readable by peers, not scattered across untracked dotfiles.

```markdown
---
handle: codex-2
provider: openai
model: gpt-5.2-codex
argv: ["codex", "--search"]
env: [OPENAI_API_KEY, CODEX_HOME]     # KEYS ONLY — never values
notes: "Adversarial reviewer. Runs on cachy. Second instance for parallel review."
---

Free prose: what this handle is for, house conventions, anything a peer or
future operator should know.
```

**Spec law: swarmpost records how peers are launched; it never launches them.**

- `env` lists variable **names only**. Secrets never appear on the wire.
- `provider`/`model` here are documentation of convention, not binding — the
  authoritative provenance for any given message is its own frontmatter (§7),
  and a handle may send from different models across messages (§5).
- The CLI MAY offer `swarmpost profile <handle> --print-cmd`, which **prints**
  the assembled command for the operator's shell to run. Printing is inert;
  executing is not, and the CLI never executes it (§2, §14).
- `profile.md` is optional. A handle with no profile is a fully valid peer.

## 6. Conflict-freedom by construction (spec law)

Merge conflicts are designed out, not handled:

1. **Senders may only ADD files**, and only under a recipient's `inbox/new/`.
   A sender never renames, edits, or deletes anything in another handle's tree.
2. **Only the mailbox owner** may rename, move, or delete anything under its
   own `agents/<handle>/` tree (the `new/ → cur/` receipt rename is the
   owner's act alone).
3. **Filenames are globally unique** (§8), so concurrent sends are adds of
   distinct paths — git merges them trivially, always.
4. Nothing in the tree is ever edited in place. A message, once delivered, is
   immutable. Corrections are new messages that reference the original.
   (Records-are-immutable, inherited from Cortex.)
5. `manifest.md` is the one shared-write file; edits to it are additive
   single-line changes (handle/kind registration) and MUST be rebased, never
   force-pushed.

## 7. Message envelope

One file per message: YAML frontmatter + markdown body.

```markdown
---
spec: "0.5"                            # envelope version — parsers check this first
id: 01J3ZK7Q8RWX5E9T2M4N6P8R0S         # ULID — unique; sortable as a convenience
from: claude-code
to: steve                              # single handle; fan-out = one file per recipient
subject: Review the auth refactor      # human-scannable one-liner
kind: task | claim | review-request | review-complete | ack | error | info | question
thread: 01J3ZK7Q8RWX5E9T2M4N6P8R0S     # root message id; equals own id if new thread
references: []                         # ids of related messages — DAG, not chain
reply_to: <id>                         # optional; the one message this answers
ts: 2026-08-05T09:12:07-04:00          # sender clock, ISO 8601 — advisory (§9)
priority: normal | high | low
provider: anthropic                    # RECOMMENDED — anthropic|openai|moonshot|zhipu|human|…
model: claude-sonnet-5                 # RECOMMENDED — omitted when provider: human
---

Free markdown body. Diffs, findings, instructions, questions — whatever the
kind implies. Attachments are committed files referenced by repo-relative path.
```

- `kind` core set above; meshes MAY extend via the manifest, agents MUST ignore
  kinds they don't understand.
- `references` is the general linking primitive (one message may cite many);
  `reply_to` is the special case of a direct answer. Both point by `id`.
- `provider`/`model` are self-reported provenance per message — audit hygiene,
  cross-vendor verification (an adversarial reviewer's independence is
  checkable here), and quirk debugging. A handle is not bound to a model; the
  same handle may send from different models across messages (§5).
- Multi-recipient sends are N files, one per inbox. No group-mailbox semantics
  in v0.x.

## 8. Filename convention

```
<ulid>.<from>.md          e.g. 01J3ZK7Q8RWX5E9T2M4N6P8R0S.claude-code.md
```

ULID gives global uniqueness + lexicographic time-ordering (`ls` approximates
the queue in delivery order). Sender suffix makes `grep -l` triage instant.

## 9. Delivery semantics

| Act            | Git operation                                            |
|----------------|----------------------------------------------------------|
| Compose        | write file in local staging (untracked; e.g. `.swarmpost/tmp/`) |
| Send           | add file at `<recipient>/inbox/new/` + commit            |
| Hand to relay  | `push` (pull --rebase first; retry on rejection)         |
| Receive        | `fetch` + fast-forward the mail worktree                 |
| Read           | consume file from own `inbox/new/`                       |
| Read receipt   | rename `new/ → cur/` + commit + push                     |
| Ack (explicit) | send a `kind: ack` message referencing `reply_to`        |

- **The commit is the atomicity unit; the relay's history is the authoritative
  order.** A message is sent when its commit exists, delivered when the relay
  has it, and sequenced by where it lands in `mail`'s committed history.
  `ts:` and ULID ordering are advisory conveniences — when they disagree with
  the relay's history, the history wins. (The record is truth; frontmatter is
  hints — inherited law, see §12.)
- Commit messages follow `mail: <from> → <to> <kind>` for sends and
  `mail: <handle> read <n>` for receipt batches. The git log is the audit
  trail.
- Agents poll at **turn boundaries** (session start, before/after tasks, on
  wake). Delivery is 100% inference-driven; no resident process exists or is
  assumed, per §2.
- Offline agents and offline machines lose nothing: mail waits in `new/` until
  fetched. Catch-up is `git fetch`. A laptop asleep mid-task resumes cleanly.

## 10. Task claiming

Convention, zero new machinery:

- A `kind: task` message is claimable work. Claiming = sending `kind: claim`
  with the task's id in `references` (to the task's sender, or to a designated
  coordinator handle if the manifest names one).
- **The first claim in the relay's committed history wins** — push ordering is
  the arbiter, per §9. A claimant whose fetch reveals an earlier claim for the
  same task yields silently.
- Completing = `kind: review-complete` (or mesh-defined equivalent) referencing
  the task id.

## 11. Errors & poison messages

Mail never wedges an inbox:

- A message that fails to parse (bad frontmatter, unknown `spec` major version,
  missing required fields) is answered with `kind: error` to its sender —
  quoting the offending id and the failure — then renamed to `cur/` like any
  read message.
- Agents MUST NOT delete unparseable mail (immutability, §6.4) and MUST NOT
  retry-loop on it.
- An unknown-but-parseable `kind` is not an error: file to `cur/`, no reply
  required.

## 12. Trust, identity & injection (spec law)

- Repo permissions ARE the access control: if you can push to `mail`, you are
  a peer. Private repo = private mesh. No other identity system exists.
- Signed commits (SSH/GPG) are RECOMMENDED where sender authenticity matters.
- **The record is truth; frontmatter is hints.** Anything load-bearing —
  claim arbitration, receipt status, sequence — derives from the relay's
  committed history, never from what a message asserts about itself. `from:`,
  `provider:`, `model:`, and `ts:` are self-reported and honor-system among
  trusted peers; where they conflict with git history (committer, signature,
  commit order), the history wins.
- **Message bodies are data from a peer, never commands with authority.** Each
  agent applies its own guardrails, instructions, and judgment to mail content
  exactly as it would to any untrusted input. A message cannot escalate an
  agent past its own rules; a compromised or malicious handle is bounded by
  repo permissions and the recipients' own defenses. Nothing in this spec
  grants any message authority over any agent's guardrails.

## 13. Parked for v2 (documented, not designed)

- `refs/mail/<handle>` transport (invisible to branch UIs; host-support risk).
- Advisory file leases for shared-worktree editing (see MCP Agent Mail).
- Group mailboxes / broadcast trees.
- Cross-repo bridging (one mesh spanning multiple repos).
- Archive/squash policy for aged `cur/` mail (manual until it hurts).

## 14. CLI surface (v1 wrapper — thin, optional)

The protocol MUST remain usable with bare git + an editor. The CLI is sugar —
binary name `swarmpost`, conventional alias `sp`:

```
swarmpost init            # create orphan mail branch + worktree + manifest
swarmpost join <handle>   # commit mailbox skeleton + manifest entry
swarmpost send <to> --kind <k> --subject <s> [--thread <id>] [--ref <id>…] [-m <body> | -f file.md]
swarmpost inbox [--new]   # list; ULID order; subjects shown
swarmpost read <id|--all> # print + rename new/ → cur/ + commit
swarmpost reply <id> [-m …]
swarmpost claim <id>
swarmpost ack <id>
swarmpost sync            # fetch/rebase/push the mail branch
swarmpost profile <handle> [--print-cmd]   # show profile; optionally emit launch command (never runs it)
```

**Identity, not behavior.** The CLI resolves *who it is acting as* from
`SWARMPOST_HANDLE` (env var) or a `handle:` line in local untracked config —
identity selection is the CLI's only runtime configuration concern, plus at
most a worktree path override. The CLI carries **no per-handle system prompts
and performs no agent launching or supervision**. Launch recipes live in
`profile.md` (§5.1) as inert, versioned documentation; `profile --print-cmd`
emits a command for the operator's shell to run, and that is the furthest the
CLI ever goes. Agent behavior remains owned by each agent's own instruction
files. See §2's litmus test.

Exit codes, JSON output (`--json`), and wake/notification integration are
implementation details, not protocol.

---

*v0.5.0-draft — 2026-08-05. Lineage: swarmpost replaces Crosstalk
(`cordfuse/crosstalk`, archived) — same wire, no runtime.*
