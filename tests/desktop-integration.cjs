// Run with the official Electron executable. A local fixture checks real compositor pixels.
const {app,BrowserWindow,ipcMain,nativeImage}=require('electron');
const {createServer}=require('node:http');
const assert=require('node:assert/strict');
const {resolve}=require('node:path');
const {createCaptureHandler}=require('../desktop/capture-policy.cjs');
let childServer,server,win;
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',r));
(async()=>{
  await app.whenReady();
  childServer=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<style>html,body{margin:0;width:100%;height:100%;background:#ee2233}body:after{content:"";display:block;position:absolute;left:50%;right:0;height:100%;background:#2266ee}</style>');});
  await listen(childServer);
  const childOrigin=`http://127.0.0.1:${childServer.address().port}`;
  server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<style>body{margin:0;background:#00cc00}[data-live-player]{position:absolute;left:80px;top:90px;width:480px;height:270px}iframe{border:0;width:100%;height:100%}</style><div data-live-player data-camera="fixture"><iframe class="stream" src="${childOrigin}/"></iframe></div>`);});
  await listen(server);
  const origin=`http://127.0.0.1:${server.address().port}`;
  win=new BrowserWindow({width:800,height:600,show:true,webPreferences:{preload:resolve(__dirname,'../desktop/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  ipcMain.handle('wild-window:capture',createCaptureHandler({windowFor:contents=>contents===win.webContents?win:undefined,origin}));
  await win.loadURL(origin+'/');
  for(const zoom of [1,1.25]) {
    win.webContents.setZoomFactor(zoom);
    await new Promise(r=>setTimeout(r,500));
    const captured=await win.webContents.executeJavaScript('window.wildWindowDesktop.captureLivePlayer()');
    const image=nativeImage.createFromDataURL(captured.image);
    const {width,height}=image.getSize();assert.ok(width>0&&height>0);assert.ok(Math.abs(width/height-480/270)<0.02);
    const pixels=image.toBitmap();
    const rgba=(x,y)=>{const i=(y*width+x)*4;return [pixels[i+2],pixels[i+1],pixels[i]];};
    // Display color profiles may shift a channel by a few levels.
    const near=(actual,expected)=>assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<=4), `${actual} != ${expected}`);
    near(rgba(Math.floor(width/4),Math.floor(height/2)),[238,34,51]);
    near(rgba(Math.floor(width*3/4),Math.floor(height/2)),[34,102,238]);
    console.log(`PASS: cross-origin iframe pixels, crop, preload IPC, zoom ${zoom}, PNG ${width}x${height}`);
  }
})().then(()=>{win?.destroy();server?.close();childServer?.close();app.exit(0);}).catch(error=>{console.error(error);win?.destroy();server?.close();childServer?.close();app.exit(1);});
