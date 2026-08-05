// Integration test — the real git choreography end to end, over a bare relay
// and two working clones ("machines"), driving the actual CLI. This is the
// core regression guard: if the wire breaks, this fails.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMessage } from '../src/envelope.js';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'swarmpost.js');
const GITENV = {
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
};

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GITENV } });
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}
// run the CLI in `cwd`; identity comes from that clone's .swarmpost/config
function sp(cwd, args) {
  const r = spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...GITENV } });
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'sp-it-'));
  git(root, ['init', '-q', '--bare', 'relay.git']);
  const relay = join(root, 'relay.git');
  for (const name of ['A', 'B']) git(root, ['clone', '-q', relay, name]);
  const A = join(root, 'A'), B = join(root, 'B');
  git(A, ['commit', '-q', '--allow-empty', '-m', 'init']);
  git(A, ['push', '-q', '-u', 'origin', 'HEAD:main']);
  return { root, relay, A, B };
}

test('full loop: init, join, send, inbox, read/receipt, reply', () => {
  const { relay, A, B } = setup();

  assert.equal(sp(A, ['init']).status, 0, 'init');
  assert.equal(sp(A, ['join', 'steve']).status, 0, 'A joins steve');
  assert.ok(existsSync(join(A, '.swarmpost', 'config')), 'identity persisted locally');
  assert.equal(sp(B, ['join', 'claude-code']).status, 0, 'B joins claude-code');

  // A (steve) sends a task to claude-code
  const sent = sp(A, ['send', 'claude-code', '--kind', 'task', '-s', 'review auth', '-m', 'please review']);
  assert.equal(sent.status, 0, 'send');
  const id = sent.stdout.replace(/^Sent:\s*/, '');
  assert.match(id, /^[0-9A-Z]{26}$/, 'send returns a ULID');

  // B sees it (inbox syncs first)
  const inbox = sp(B, ['inbox']);
  assert.equal(inbox.status, 0);
  assert.match(inbox.stdout, new RegExp(id), 'B inbox shows the task');
  assert.match(inbox.stdout, /\[task\] steve: review auth/);

  // B reads it -> body printed + receipt (new/ -> cur/)
  const read = sp(B, ['read', id]);
  assert.equal(read.status, 0);
  assert.match(read.stdout, /please review/, 'read prints the body');
  assert.equal(sp(B, ['inbox']).stdout, '(no mail)', 'inbox empty after receipt');
  const withAll = sp(B, ['inbox', '--all']);
  assert.match(withAll.stdout, new RegExp(`${id}.*\\(cur\\)`), 'read message now in cur/');

  // B replies -> A sees it
  assert.equal(sp(B, ['reply', id, '-m', 'LGTM']).status, 0, 'reply');
  const aInbox = sp(A, ['inbox']);
  assert.match(aInbox.stdout, /\[info\] claude-code: Re: review auth/, 'steve sees the reply');

  // roster enforcement (§4): sending to an unknown handle fails locally
  const bad = sp(A, ['send', 'ghost', '-m', 'x']);
  assert.notEqual(bad.status, 0, 'send to non-roster handle rejected');
  assert.match(bad.stderr, /roster/);

  // audit trail is legible
  const verify = join(dirname(relay), 'verify');
  git(dirname(relay), ['clone', '-q', relay, 'verify']);
  git(verify, ['checkout', '-q', 'mail']);
  const log = git(verify, ['log', '--oneline']).stdout;
  assert.match(log, /mail: steve -> claude-code task/);
  assert.match(log, /mail: claude-code read 1/);
});

test('conflict-freedom: concurrent sends to the SAME inbox merge clean', () => {
  const { relay, A, B } = setup();
  sp(A, ['init']); sp(A, ['join', 'steve']); sp(B, ['join', 'claude-code']);

  // both machines diverge from the same base, each adds a distinct message
  const wtA = join(A, '.swarmpost', 'worktree'), wtB = join(B, '.swarmpost', 'worktree');
  for (const wt of [wtA, wtB]) { git(wt, ['fetch', '-q', 'origin', 'mail']); git(wt, ['reset', '-q', '--hard', 'origin/mail']); }
  const box = (wt) => join(wt, 'agents', 'claude-code', 'inbox', 'new');
  writeFileSync(join(box(wtA), '01AAA.steve.md'), '---\nid: 01AAA\nfrom: steve\nto: claude-code\n---\nA\n');
  git(wtA, ['add', '-A']); git(wtA, ['commit', '-q', '-m', 'mail: steve -> claude-code info']);
  writeFileSync(join(box(wtB), '01BBB.claude-code.md'), '---\nid: 01BBB\nfrom: claude-code\nto: claude-code\n---\nB\n');
  git(wtB, ['add', '-A']); git(wtB, ['commit', '-q', '-m', 'mail: cc -> cc info']);

  // A pushes first; B is now behind -> rebase-retry, must NOT conflict
  assert.equal(git(wtA, ['push', '-q', 'origin', 'mail']).status, 0, 'A pushes');
  assert.notEqual(git(wtB, ['push', '-q', 'origin', 'mail']).status, 0, 'B rejected (behind)');
  assert.equal(git(wtB, ['pull', '-q', '--rebase', 'origin', 'mail']).status, 0, 'B rebases with NO conflict');
  assert.equal(git(wtB, ['push', '-q', 'origin', 'mail']).status, 0, 'B pushes after rebase');

  // both messages present on the relay
  const verify = join(dirname(relay), 'verify2');
  git(dirname(relay), ['clone', '-q', relay, 'verify2']);
  git(verify, ['checkout', '-q', 'mail']);
  const nd = join(verify, 'agents', 'claude-code', 'inbox', 'new');
  assert.ok(existsSync(join(nd, '01AAA.steve.md')), 'A message survived');
  assert.ok(existsSync(join(nd, '01BBB.claude-code.md')), 'B message survived');
});

test('reply de-dupes references when the parent id is re-added via --ref (B2)', () => {
  const { relay, A, B } = setup();
  sp(A, ['init']); sp(A, ['join', 'steve']); sp(B, ['join', 'claude-code']);
  const id = sp(A, ['send', 'claude-code', '--kind', 'task', '-m', 'x']).stdout.replace(/^Sent:\s*/, '');
  sp(B, ['read', id]);
  // reply AND explicitly --ref the same id: reply already injects orig.id, so
  // without de-dupe references would list it twice.
  assert.equal(sp(B, ['reply', id, '--ref', id, '-m', 'done']).status, 0, 'reply');
  const verify = join(dirname(relay), 'verify-refs');
  git(dirname(relay), ['clone', '-q', relay, 'verify-refs']);
  git(verify, ['checkout', '-q', 'mail']);
  const nd = join(verify, 'agents', 'steve', 'inbox', 'new');
  const file = readdirSync(nd).find((f) => f.endsWith('.md'));
  const { data } = parseMessage(readFileSync(join(nd, file), 'utf8'));
  assert.deepEqual(data.references, [id], 'parent id appears exactly once');
});

test('--mesh / SWARMPOST_MESH let sp run from outside the mesh dir (cross-repo)', () => {
  const { root, A, B } = setup();
  sp(A, ['init']); sp(A, ['join', 'steve']); sp(B, ['join', 'claude-code']);
  sp(A, ['send', 'claude-code', '--kind', 'task', '-m', 'hi']);
  // `root` holds relay.git + clones but is NOT itself a checkout — a stand-in for
  // "some other repo you're working in". Without an override, sp can't find a mesh here.
  const env = { ...process.env, ...GITENV, SWARMPOST_HANDLE: 'claude-code' };
  const bare = spawnSync('node', [BIN, 'inbox'], { cwd: root, encoding: 'utf8', env });
  assert.notEqual(bare.status, 0, 'no override from a foreign cwd fails');

  const viaFlag = spawnSync('node', [BIN, 'inbox', '--mesh', B], { cwd: root, encoding: 'utf8', env });
  assert.equal(viaFlag.status, 0, '--mesh resolves the mesh from a foreign cwd');
  assert.match(viaFlag.stdout, /\[task\] steve/);

  const viaEnv = spawnSync('node', [BIN, 'inbox'], { cwd: root, encoding: 'utf8', env: { ...env, SWARMPOST_MESH: B } });
  assert.equal(viaEnv.status, 0, 'SWARMPOST_MESH resolves the mesh from a foreign cwd');
  assert.match(viaEnv.stdout, /\[task\] steve/);
});

test('wait: matches waiting mail instantly, does not consume, times out with exit 3', () => {
  const { A, B } = setup();
  sp(A, ['init']); sp(A, ['join', 'steve']); sp(B, ['join', 'claude-code']);
  const id = sp(A, ['send', 'claude-code', '--kind', 'task', '-m', 'x']).stdout.replace(/^Sent:\s*/, '');
  // already-waiting mail -> wait returns immediately
  const w = sp(B, ['wait', '--kind', 'task', '--timeout', '5']);
  assert.equal(w.status, 0, 'wait matched');
  assert.match(w.stdout, new RegExp(id));
  // wait is a peek: no read receipt filed, still unread
  assert.match(sp(B, ['inbox']).stdout, new RegExp(id), 'wait did not consume');
  // no match within the window -> bounded timeout, exit 3
  const t = sp(B, ['wait', '--from', 'nobody', '--timeout', '1', '--interval', '1']);
  assert.equal(t.status, 3, 'wait times out with exit 3');
});
