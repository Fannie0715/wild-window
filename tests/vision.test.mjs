import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { makeServer } from '../scripts/serve.mjs';
import { isLocalRequest, validateResult, VISION_MODEL } from '../scripts/vision.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const image = 'data:image/png;base64,iVBORw0KGgo=';
const valid = { animalPresent: true, name: '猫', scientificName: '', certainty: 'clear', visibleFeatures: ['尖耳朵'], description: '一只猫。', habitat: '多种环境', diet: '肉食', fact: '猫有胡须。' };
const answer = () => Response.json({ message: { content: JSON.stringify(valid) }, done: true });

async function serverFor(t, options) {
  const server = makeServer(process.cwd(), options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('reject cross-origin and DNS-rebinding requests', () => {
  const local = { host: '127.0.0.1:4191', origin: 'http://127.0.0.1:4191', 'sec-fetch-site': 'same-origin' };
  assert.equal(isLocalRequest({ headers: local }), true);
  for (const headers of [
    { ...local, host: 'evil.example:4191' },
    { ...local, origin: 'http://evil.example' },
    { ...local, origin: 'http://127.0.0.1:7777' },
    { ...local, 'sec-fetch-site': 'cross-site' },
    { ...local, origin: 'null' },
  ]) assert.equal(isLocalRequest({ headers }), false);
});

test('validate every result field, strip extra keys, reject unbounded output', () => {
  assert.deepEqual(validateResult({ ...valid, injected: 'ignored' }), valid);
  for (const value of [null, {}, { ...valid, name: '' }, { ...valid, certainty: '99%' }, { ...valid, visibleFeatures: [42] }, { ...valid, description: 'a'.repeat(2001) }]) {
    assert.throws(() => validateResult(value));
  }
});

test('only fixed local model is called; REST uses bare base64 and validated JSON', async t => {
  let calls = 0;
  const base = await serverFor(t, { fetchImpl: async (url, init) => {
    calls++;
    assert.equal(url, 'http://127.0.0.1:11434/api/chat');
    const body = JSON.parse(init.body);
    assert.equal(body.model, VISION_MODEL);
    assert.equal(body.stream, false);
    assert.equal(body.messages[1].images[0], image.split(',')[1]);
    assert.equal(body.options.num_ctx, 4096);
    assert.equal(body.format.additionalProperties, false);
    assert.equal(JSON.stringify(body).includes('attacker.example'), false);
    return answer();
  } });
  const response = await fetch(`${base}/api/vision/identify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image, model: 'attacker.example', url: 'https://attacker.example', prompt: 'attacker.example' }) });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).result, valid);
  assert.equal(calls, 1);
});

test('invalid image and oversized body never reach the model', async t => {
  let calls = 0;
  const base = await serverFor(t, { fetchImpl: async () => { calls++; return answer(); } });
  for (const body of ['{}', '{', JSON.stringify({ image: 'data:image/png;base64,SGVsbG8=' })]) {
    const result = await fetch(`${base}/api/vision/identify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    assert.equal(result.status, 400);
  }
  const result = await fetch(`${base}/api/vision/identify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'a'.repeat(8 * 1024 * 1024 + 1) });
  assert.equal(result.status, 413);
  assert.equal(calls, 0);
});

test('cancelled inference releases concurrency and aborts upstream fetch', async t => {
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  let upstreamAborted = false;
  const base = await serverFor(t, { fetchImpl: async (url, init) => {
    if (url.endsWith('/api/tags')) return Response.json({ models: [{ name: VISION_MODEL }] });
    entered();
    return new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => { upstreamAborted = true; reject(new DOMException('aborted', 'AbortError')); }, { once: true });
    });
  } });
  const controller = new AbortController();
  const first = fetch(`${base}/api/vision/identify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image }), signal: controller.signal }).catch(error => error);
  await started;
  const second = await fetch(`${base}/api/vision/identify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image }) });
  assert.equal(second.status, 409);
  controller.abort();
  await first;
  await delay(30);
  const status = await (await fetch(`${base}/api/vision/status`)).json();
  assert.equal(upstreamAborted, true);
  assert.equal(status.busy, false);
});

test('inference timeout returns 504 and releases concurrency', async t => {
  const base = await serverFor(t, { timeoutMs: 20, fetchImpl: async (url, init) => {
    if (url.endsWith('/api/tags')) return Response.json({ models: [{ name: VISION_MODEL }] });
    return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }));
  } });
  const response = await fetch(`${base}/api/vision/identify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image }) });
  assert.equal(response.status, 504);
  const status = await (await fetch(`${base}/api/vision/status`)).json();
  assert.equal(status.busy, false);
});

test('timeout must also release the lock while request body is unfinished', async t => {
  const base = await serverFor(t, { timeoutMs: 20, fetchImpl: async url => {
    if (url.endsWith('/api/tags')) return Response.json({ models: [{ name: VISION_MODEL }] });
    throw new Error('Unfinished input must not reach model');
  } });
  const slow = http.request(`${base}/api/vision/identify`, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': 1024 } });
  slow.on('error', () => {});
  slow.on('response', response => response.resume());
  t.after(() => slow.destroy());
  slow.write('{"image":');
  await delay(120);
  const status = await (await fetch(`${base}/api/vision/status`)).json();
  assert.equal(status.busy, false, 'An upload that exceeds timeoutMs must not keep the global recognition lock');
});

test('status restarts an installed local runtime only when unavailable', async t => {
  let online = false, starts = 0;
  const base = await serverFor(t, {
    ensureRuntime: async () => { starts++; online = true; },
    fetchImpl: async () => { if (!online) throw new TypeError('connection refused'); return Response.json({ models: [{ name: VISION_MODEL }] }); },
  });
  assert.equal((await (await fetch(`${base}/api/vision/status`)).json()).ready, true);
  assert.equal((await (await fetch(`${base}/api/vision/status`)).json()).ready, true);
  assert.equal(starts, 1);
});

test('malformed or truncated model output is never presented as success', async t => {
  const base = await serverFor(t, { fetchImpl: async () => Response.json({ message: { content: '{"animalPresent":true' }, done: true }) });
  const response = await fetch(`${base}/api/vision/identify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image }) });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /完整/);
});
