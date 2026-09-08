import { access, cp, mkdir, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, delimiter, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
async function npmCLI() {
  const executable = await realpath(process.execPath);
  const candidates = [process.env.npm_execpath,
    resolve(dirname(executable), '../lib/node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(executable), 'node_modules/npm/bin/npm-cli.js')];
  for (const entry of (process.env.PATH || '').split(delimiter).filter(Boolean)) {
    candidates.push(resolve(entry, 'node_modules/npm/bin/npm-cli.js'));
    if (process.platform !== 'win32') {
      try { candidates.push(await realpath(resolve(entry, 'npm'))); } catch { /* Next PATH entry. */ }
    }
  }
  for (const candidate of candidates.filter(Boolean)) {
    if (!candidate.endsWith('npm-cli.js')) continue;
    try { await access(candidate); return candidate; } catch { /* Next Node installation. */ }
  }
  throw new Error('没有找到 npm，请从 nodejs.org 安装完整的 Node.js 22.13 或更新版本。');
}
function run(command, args, options = {}) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { cwd: project, stdio: 'inherit', ...options });
    const stop = () => child.kill();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    const clean = () => { process.off('SIGINT', stop); process.off('SIGTERM', stop); };
    child.once('error', error => { clean(); reject(error); });
    child.once('exit', (code, signal) => { clean(); code === 0 ? done() : reject(new Error(signal ? `程序已停止（${signal}）。` : `程序退出（${code}）。`)); });
  });
}
async function start() {
  await access(resolve(project, 'dist/index.html')).catch(() => { throw new Error('请先执行 npm ci 和 npm run build，或下载已构建的桌面包。'); });
  let entry = resolve(project, 'node_modules/electron/index.js');
  try { await access(entry); } catch { entry = null; }
  if (!entry) {
    const cache = resolve(project, '.runtime/desktop');
    entry = resolve(cache, 'node_modules/electron/index.js');
    try { await access(entry); }
    catch {
      console.log('首次启动正在安装桌面运行环境，随后会下载官方 Electron（约 125–150MB）…');
      await mkdir(cache, { recursive: true });
      for (const name of ['package.json', 'package-lock.json']) await cp(resolve(project, 'desktop/runtime', name), resolve(cache, name));
      await run(process.execPath, [await npmCLI(), 'ci', '--omit=dev', '--no-fund', '--no-audit'], { cwd: cache });
    }
  }
  const projectRoot = await realpath(project);
  const withinProject = path => path.startsWith(projectRoot + sep);
  if (!withinProject(await realpath(entry))) throw new Error('桌面运行环境必须安装在当前项目目录内。');
  if (process.env.ELECTRON_OVERRIDE_DIST_PATH) throw new Error('请取消 ELECTRON_OVERRIDE_DIST_PATH 后使用项目内的官方 Electron 运行环境。');
  // Electron's official package checks and installs its platform-specific binary.
  const binary = await realpath(require(entry));
  if (!withinProject(binary)) throw new Error('桌面运行程序不在当前项目目录内。');
  if (process.platform === 'darwin') {
    const bundle = await realpath(resolve(dirname(binary), '../..'));
    if (!withinProject(bundle)) throw new Error('桌面应用包不在当前项目目录内。');
    const signature = await exec('/usr/bin/codesign', ['-dv', '--verbose=4', bundle]).catch(() => null);
    // Apple Silicon's linker signature omits bundle resources. Finish this local
    // development build, without replacing any Developer ID signature.
    if (signature?.stderr.includes('linker-signed') && signature.stderr.includes('Signature=adhoc')) {
      console.log('正在准备 macOS 本地开发签名…');
      await run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', bundle]);
      await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
    }
  }
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  await run(binary, process.argv.includes('--check') ? ['--version'] : [resolve(project, 'desktop/main.cjs')], { env });
}
start().catch(error => { console.error(error.message); process.exitCode = 1; });
