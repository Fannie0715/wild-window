import { access, mkdir, open, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { release } from 'node:os';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = resolve(project, '.runtime');
const endpoint = 'http://127.0.0.1:11434';
const archiveUrl = 'https://github.com/ollama/ollama/releases/download/v0.33.3/ollama-darwin.tgz';
const archiveSha = '342db03df80bb9db84ff64246031bd5f70c09b59ff52fa5cc9aaae3476cc4a9d';
const localCli = resolve(runtime, 'ollama', process.platform === 'win32' ? 'ollama.exe' : 'ollama');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function online() {
  try { const response = await fetch(endpoint + '/api/tags', { signal: AbortSignal.timeout(1200) }); const data = await response.json(); return response.ok && Array.isArray(data.models); }
  catch { return false; }
}
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', ...options });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}
async function findCli() {
  const candidates = [localCli, process.platform === 'darwin' ? '/Applications/Ollama.app/Contents/Resources/ollama' : process.platform === 'win32' && process.env.LOCALAPPDATA ? resolve(process.env.LOCALAPPDATA, 'Programs/Ollama/ollama.exe') : '', 'ollama'].filter(Boolean);
  for (const candidate of candidates) {
    try { if (candidate.includes('/') || candidate.includes('\\')) await access(candidate); else await run(candidate, ['--version']); return candidate; }
    catch { /* Try the next ordinary installation location. */ }
  }
  return null;
}
async function installMacCli() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('请先从 https://ollama.com/download 安装并打开 Ollama，再重新运行本脚本。');
  if (Number(release().split('.')[0]) < 23) throw new Error('Ollama 需要 macOS 14 或更新版本。');
  await mkdir(resolve(runtime, 'ollama'), { recursive: true });
  const archive = resolve(runtime, 'ollama-darwin.tgz');
  console.log('正在下载官方 Ollama 本地运行程序（约 152MB）…');
  const response = await fetch(archiveUrl, { signal: AbortSignal.timeout(15 * 60 * 1000) });
  if (!response.ok || !response.body) throw new Error('Ollama 下载失败，请检查网络后重试。');
  const file = await open(archive, 'w');
  try { for await (const chunk of response.body) await file.write(chunk); } finally { await file.close(); }
  const hash = createHash('sha256'); for await (const chunk of createReadStream(archive)) hash.update(chunk);
  if (hash.digest('hex') !== archiveSha) { await rm(archive); throw new Error('下载校验失败，请重试。'); }
  await run('tar', ['-xzf', archive, '-C', resolve(runtime, 'ollama')]);
  await rm(archive);
  return localCli;
}
export async function ensureOllama({ install = false, log = console.log } = {}) {
  if (await online()) return { owned: false, stop() {} };
  const cli = await findCli() || (install ? await installMacCli() : null);
  if (!cli) return null;
  await mkdir(runtime, { recursive: true });
  const output = await open(resolve(runtime, 'ollama.log'), 'a');
  const env = { ...process.env, OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_NO_CLOUD: '1', OLLAMA_NUM_PARALLEL: '1', OLLAMA_MAX_LOADED_MODELS: '1', OLLAMA_CONTEXT_LENGTH: '4096' };
  // A bundled CLI keeps downloaded weights out of the source and release archive.
  if (cli === localCli) env.OLLAMA_MODELS = resolve(runtime, 'models');
  const child = spawn(cli, ['serve'], { env, stdio: ['ignore', output.fd, output.fd] });
  let failed = false; child.on('error', () => { failed = true; }); child.on('exit', () => { failed = true; });
  await output.close();
  for (let attempt = 0; attempt < 60 && !failed; attempt++) {
    if (await online()) { log('Ollama 本地服务已启动。'); return { owned: true, stop() { child.kill(); } }; }
    await delay(500);
  }
  child.kill();
  if (await online()) return { owned: false, stop() {} };
  throw new Error('Ollama 未能启动，请查看 .runtime/ollama.log 或打开已安装的 Ollama。');
}

export function createRuntimeManager({ ensureImpl = ensureOllama } = {}) {
  const owned = new Set();
  let starting, stopped = false;
  return {
    async ensure() {
      if (stopped) return null;
      if (!starting) starting = ensureImpl().then(runtime => { if (runtime?.owned) owned.add(runtime); return runtime; }).finally(() => { starting = undefined; });
      return starting;
    },
    async stop() { stopped = true; await starting?.catch(() => null); for (const runtime of owned) runtime.stop(); owned.clear(); },
  };
}
