import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeManager } from '../scripts/ollama-runtime.mjs';

test('concurrent startup is shared and shutdown cleans a late owned child', async () => {
  let resolveStartup, starts = 0, stops = 0;
  const delayed = new Promise(resolve => { resolveStartup = resolve; });
  const manager = createRuntimeManager({ ensureImpl: () => { starts++; return delayed; } });
  const first = manager.ensure(), second = manager.ensure();
  const closing = manager.stop();
  resolveStartup({ owned: true, stop() { stops++; } });
  await Promise.all([first, second, closing]);
  assert.equal(starts, 1); assert.equal(stops, 1);
  assert.equal(await manager.ensure(), null);
  await manager.stop(); assert.equal(stops, 1);
});

test('an existing Ollama service is never stopped by the app', async () => {
  let stops = 0;
  const manager = createRuntimeManager({ ensureImpl: async () => ({ owned: false, stop() { stops++; } }) });
  await manager.ensure(); await manager.stop(); assert.equal(stops, 0);
});
