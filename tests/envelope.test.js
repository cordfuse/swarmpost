import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ulid, filename, serialize, parseMessage } from '../src/envelope.js';

test('ulid is 26 Crockford chars, unique, time-sortable', () => {
  const a = ulid(1000);
  const b = ulid(1000);
  assert.match(a, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.notEqual(a, b); // random tail differs
  assert.ok(ulid(2000) > ulid(1000)); // later time sorts after
});

test('filename is <ulid>.<from>.md', () => {
  assert.equal(filename('01ABC', 'claude-code'), '01ABC.claude-code.md');
});

test('serialize -> parseMessage round-trips frontmatter + body', () => {
  const fm = { spec: '0.5', id: '01ABC', from: 'steve', to: 'codex', kind: 'task', references: [] };
  const text = serialize(fm, 'the body\nline two');
  const { data, body } = parseMessage(text);
  assert.equal(data.id, '01ABC');
  assert.equal(data.from, 'steve');
  assert.equal(data.kind, 'task');
  assert.deepEqual(data.references, []);
  assert.equal(body.trim(), 'the body\nline two');
});

test('serialize emits fields in stable, scannable order', () => {
  const text = serialize({ model: 'x', id: '01A', spec: '0.5', from: 'a' }, 'b');
  const order = text.split('\n').filter((l) => /^\w+:/.test(l)).map((l) => l.split(':')[0]);
  assert.deepEqual(order.slice(0, 3), ['spec', 'id', 'from']);
});

test('parseMessage rejects a message with no frontmatter', () => {
  assert.throws(() => parseMessage('just a body, no fence'), /frontmatter/);
});

test('parseMessage handles CRLF line endings (Windows checkout, core.autocrlf)', () => {
  // same message an LF checkout produces, but every newline is CRLF
  const lf = serialize({ spec: '0.5', id: '01CRLF', from: 'steve', kind: 'info' }, 'hello\nworld');
  const crlf = lf.replace(/\n/g, '\r\n');
  const { data, body } = parseMessage(crlf);
  assert.equal(data.id, '01CRLF');
  assert.equal(data.kind, 'info');
  assert.equal(body.replace(/\r/g, '').trim(), 'hello\nworld');
});
