import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { makeServer } from '../scripts/serve.mjs';

test('local distribution serves its build and does not expose files outside it', async t => {
  const root=await mkdtemp(join(tmpdir(),'wild-window-'));
  await writeFile(join(root,'index.html'),'<h1>Wild Window</h1>');
  await writeFile(join(root,'app.js'),'export const camera = 1;');
  const outside=await mkdtemp(join(tmpdir(),'wild-private-'));await writeFile(join(outside,'secret.txt'),'private');
  await symlink(join(outside,'secret.txt'),join(root,'escape.txt'));
  const server=makeServer(root);server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;
  const html=await fetch(base+'/?mini=1');assert.equal(html.status,200);assert.match(await html.text(),/Wild Window/);
  const script=await fetch(base+'/app.js');assert.match(script.headers.get('content-type'),/javascript/);
  assert.equal((await fetch(base+'/',{method:'HEAD'})).status,200);
  assert.equal((await fetch(base+'/escape.txt')).status,403);
  assert.equal((await fetch(base+'/not-found')).status,404);
  assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
});
