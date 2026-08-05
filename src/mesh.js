// mesh.js — resolve the repo, materialize the hidden `mail` worktree (§3),
// and read mesh state (roster, identity). No mesh content ever lives on the
// code branch; it lives on `mail`, checked out under .swarmpost/worktree/.

import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { git, gitOk } from './git.js';
import { parseMessage } from './envelope.js';

export const MAIL_BRANCH = 'mail';

export function repoRoot() {
  const r = git(['rev-parse', '--show-toplevel']);
  if (r.status !== 0) throw new Error('not inside a git repository');
  return r.stdout;
}

export function paths(root = repoRoot()) {
  const sp = join(root, '.swarmpost');
  return {
    root,
    sp,
    worktree: join(sp, 'worktree'),
    tmp: join(sp, 'tmp'),
    config: join(sp, 'config'),
  };
}

export const manifestFile = (p) => join(p.worktree, 'manifest.md');
export const agentDir = (p, h) => join(p.worktree, 'agents', h);
export const inboxNew = (p, h) => join(agentDir(p, h), 'inbox', 'new');
export const inboxCur = (p, h) => join(agentDir(p, h), 'inbox', 'cur');

// Materialize the mail branch as a hidden worktree so the developer's working
// directory never switches branches (§3). Idempotent.
export function ensureWorktree(p, { create = false } = {}) {
  mkdirSync(p.sp, { recursive: true });
  mkdirSync(p.tmp, { recursive: true });
  if (existsSync(p.worktree)) return; // already materialized

  git(['fetch', '-q', 'origin', MAIL_BRANCH], p.root);
  const hasLocal = git(['rev-parse', '--verify', '-q', MAIL_BRANCH], p.root).status === 0;
  const hasRemote = git(['rev-parse', '--verify', '-q', `origin/${MAIL_BRANCH}`], p.root).status === 0;

  if (hasLocal) {
    gitOk(['worktree', 'add', '-q', p.worktree, MAIL_BRANCH], p.root);
  } else if (hasRemote) {
    gitOk(['worktree', 'add', '-q', '--track', '-b', MAIL_BRANCH, p.worktree, `origin/${MAIL_BRANCH}`], p.root);
  } else if (create) {
    // Portable orphan-branch creation (the `git worktree add --orphan`
    // syntax varies across git versions): make an empty-tree root commit via
    // plumbing, point `mail` at it, then check it out as the worktree.
    const emptyTree = gitOk(['hash-object', '-t', 'tree', '--stdin'], p.root, '');
    const rootCommit = gitOk(['commit-tree', emptyTree, '-m', 'mail: root'], p.root);
    gitOk(['branch', MAIL_BRANCH, rootCommit], p.root);
    gitOk(['worktree', 'add', '-q', p.worktree, MAIL_BRANCH], p.root);
  } else {
    throw new Error(`no '${MAIL_BRANCH}' branch — run \`swarmpost init\` first`);
  }
}

// Fetch + fast-forward the mail worktree (§9 receive).
export function syncIn(p) {
  git(['fetch', '-q', 'origin', MAIL_BRANCH], p.worktree);
  // fast-forward if we can; otherwise rebase local (unpushed receipts) on top
  if (git(['merge', '-q', '--ff-only', `origin/${MAIL_BRANCH}`], p.worktree).status !== 0) {
    git(['rebase', '-q', `origin/${MAIL_BRANCH}`], p.worktree);
  }
}

// ── roster (§4) ──────────────────────────────────────────────────────
// Spec: the manifest `handles:` list is the roster of record. (Finding A:
// concurrent joins conflict on this shared line; deriving the roster from
// `ls agents/` is conflict-free. Kept as the manifest per spec for now;
// switching sources is a one-line change here.)
export function readManifest(p) {
  if (!existsSync(manifestFile(p))) return { data: {}, body: '' };
  return parseMessage(readFileSync(manifestFile(p), 'utf8'));
}

export function roster(p) {
  const h = readManifest(p).data.handles;
  return Array.isArray(h) ? h : [];
}

export function knownKinds(p) {
  const k = readManifest(p).data.kinds;
  return Array.isArray(k) ? k : [];
}

// ── identity (§14) ───────────────────────────────────────────────────
export function whoami(p) {
  if (process.env.SWARMPOST_HANDLE) return process.env.SWARMPOST_HANDLE;
  if (existsSync(p.config)) {
    const m = readFileSync(p.config, 'utf8').match(/^\s*handle:\s*(\S+)/m);
    if (m) return m[1];
  }
  throw new Error('no handle — set SWARMPOST_HANDLE or run `swarmpost join <handle>`');
}

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;
export function validHandle(h) {
  return typeof h === 'string' && HANDLE_RE.test(h);
}
