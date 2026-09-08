import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const target=resolve('release/xiaohongshu-game');
await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});
for(const name of ['index.html','style.css','game-core.js','game.js','icon.svg'])await cp(resolve('public/observation-game',name),resolve(target,name));
console.log(`小红书 ZIP 内容目录：${target}`);
