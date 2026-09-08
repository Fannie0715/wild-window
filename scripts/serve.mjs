import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createVisionHandler } from './vision.mjs';
import { createRuntimeManager } from './ollama-runtime.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2', '.ico':'image/x-icon' };
export function makeServer(directory, visionOptions) {
  const root = resolve(directory);
  const handleVision = createVisionHandler(visionOptions);
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    response.setHeader('Cache-Control','no-cache');
    if (await handleVision(request, response)) return;
    if(!['GET','HEAD'].includes(request.method)) {response.writeHead(405,{'Allow':'GET, HEAD'});response.end();return;}
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let file = resolve(root, '.' + (pathname.endsWith('/') ? pathname+'index.html' : pathname));
      if(file !== root && !file.startsWith(root+sep)) {response.writeHead(403);response.end();return;}
      // Resolve symlinks as well as ../ traversal; this server must only expose the build.
      const realRoot = await realpath(root);file = await realpath(file);
      if(!file.startsWith(realRoot+sep)) {response.writeHead(403);response.end();return;}
      const info = await stat(file);if(!info.isFile())throw new Error('not a file');
      response.writeHead(200, {'Content-Type':mime[extname(file)] || 'application/octet-stream','Content-Length':info.size});
      if(request.method==='HEAD')response.end();else createReadStream(file).on('error',()=>response.destroy()).pipe(response);
    } catch {response.writeHead(404);response.end('Not found');}
  });
}
async function start() {
  try {await stat(resolve(project,'dist/index.html'));} catch {console.error('还没有构建网页。请先运行 npm install 和 npm run build，或下载包含 dist 的本地安装包。');process.exitCode=1;return;}
  const requested = Number(process.env.PORT || 4191);
  if(!Number.isInteger(requested)||requested<1||requested>65535)throw new Error('PORT must be 1–65535');
  const runtime = createRuntimeManager();
  const server = makeServer(resolve(project,'dist'), { ensureRuntime: () => runtime.ensure() });
  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true; server.closeAllConnections(); if (server.listening) server.close();
    await runtime.stop(); process.exit(0);
  }
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal, () => void shutdown());
  try { await runtime.ensure(); } catch (error) { console.log(error.message); }
  if (stopping) return;
  let port=requested;
  server.on('error', error => {if(error.code==='EADDRINUSE' && port<requested+10 && port<65535){port++;server.listen(port,'127.0.0.1');}else{console.error(error.message);void runtime.stop().finally(()=>{process.exitCode=1;});}});
  server.on('listening',()=>{
    const url=`http://127.0.0.1:${port}/`;
    console.log(`\n野外值班已启动：${url}\n关闭终端或按 Ctrl+C 退出。\n`);
    if(!process.argv.includes('--no-open')){const [command,args]=process.platform==='darwin'?['open',[url]]:process.platform==='win32'?['cmd',['/c','start','',url]]:['xdg-open',[url]];const child=spawn(command,args,{stdio:'ignore'});child.on('error',()=>{});child.unref();}
  });
  server.listen(port,'127.0.0.1');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))void start();
