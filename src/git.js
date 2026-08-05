// git.js — thin synchronous git runner. The protocol IS git; this is the
// only place we shell out to it.

import { spawnSync } from 'child_process';

export function git(args, cwd, input) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', input });
  return {
    status: r.status ?? 1,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

export function gitOk(args, cwd, input) {
  const r = git(args, cwd, input);
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout || `exit ${r.status}`}`);
  }
  return r.stdout;
}

// push with one pull --rebase retry (§9). Returns true if the mail branch
// reached the relay, false if it stayed local (no remote / offline).
export function pushWithRetry(cwd, branch = 'mail', tries = 6) {
  if (git(['remote'], cwd).stdout.length === 0) return false; // no relay configured
  // Bounded retry LOOP, not a single retry: under N-way contention a racer can
  // be rejected again on its retry (another peer pushed during its rebase). Loop
  // push→rebase until it lands or we exhaust `tries`. Adds are conflict-free
  // (§6), so a rebase never conflicts — it just replays our commit on top.
  for (let i = 0; i < tries; i++) {
    if (git(['push', '-q', 'origin', branch], cwd).status === 0) return true;
    if (git(['pull', '-q', '--rebase', 'origin', branch], cwd).status !== 0) return false; // offline / real divergence
  }
  return false; // still contended after `tries` — caller surfaces "local only"
}
