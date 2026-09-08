import { chmod, cp, mkdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
const target=resolve('release/wild-window');
await stat('dist/index.html');
await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});
for(const file of ['dist','docs','desktop','scripts/launch-desktop.mjs','scripts/serve.mjs','scripts/vision.mjs','scripts/ollama-runtime.mjs','scripts/setup-ai.mjs','README.md','LICENSE','THIRD_PARTY_NOTICES.md','Start Global Wildlife Monitor.command','Start Global Wildlife Monitor.cmd','启用本地识图.command','启用本地识图.cmd'])await cp(file,resolve(target,file),{recursive:true});
if(process.platform!=='win32') for(const file of ['Start Global Wildlife Monitor.command','启用本地识图.command']) await chmod(resolve(target,file),0o755);
console.log(`本地安装目录：${target}`);
