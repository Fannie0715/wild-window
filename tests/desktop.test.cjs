const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertSender, captureRectangle, createCaptureHandler, isAppURL } = require('../desktop/capture-policy.cjs');
const origin = 'http://127.0.0.1:4172';
const bounds = {x:20,y:30,width:400,height:225,camera:'panda',source:'https://www.youtube.com/embed/test'};
function fixture() {
  const image = {isEmpty:()=>false,getSize:()=>({width:400,height:225}),toPNG:()=>Buffer.from('png')};
  const contents = {isDestroyed:()=>false,mainFrame:{url:origin+'/?mini=1'},getZoomFactor:()=>1,executeJavaScriptInIsolatedWorld:async()=>({...bounds}),capturePage:async()=>image};
  const window = {webContents:contents,isDestroyed:()=>false,isVisible:()=>true,isMinimized:()=>false,getContentBounds:()=>({width:800,height:600})};
  const event = {sender:contents,senderFrame:contents.mainFrame};
  const capture = createCaptureHandler({windowFor:()=>window,origin,timeoutMs:30});
  return {image,contents,window,event,capture};
}
test('desktop IPC accepts only the exact app main frame', () => {
  const f=fixture(); assert.doesNotThrow(()=>assertSender(f.event,f.window,origin));
  assert.throws(()=>assertSender({...f.event,senderFrame:{url:origin+'/'}},f.window,origin));
  assert.throws(()=>assertSender({...f.event,sender:{}},f.window,origin));
  f.contents.mainFrame.url='https://www.youtube.com/';
  assert.throws(()=>assertSender(f.event,f.window,origin));
  assert.equal(isAppURL(origin+'.evil.test/',origin),false);
  assert.equal(isAppURL(origin+'/observation-game/',origin),false);
});
test('crop rejects empty, clipped, nonfinite and excessive regions', () => {
  const viewport={width:800,height:600};
  for(const change of [{width:0},{height:0},{x:-1},{x:600},{width:NaN},{y:Infinity}]) assert.throws(()=>captureRectangle({...bounds,...change},1,viewport));
  assert.throws(()=>captureRectangle({x:0,y:0,width:5000,height:5000},1,{width:6000,height:6000}));
  assert.throws(()=>captureRectangle(bounds,0,viewport));
});
test('crop converts CSS zoom into DIP without applying devicePixelRatio', () => {
  assert.deepEqual(captureRectangle(bounds,1.25,{width:800,height:600}),{x:25,y:37,width:500,height:282});
});
test('native capture returns only the measured live region', async () => {
  const f=fixture();let actual;
  f.contents.capturePage=async rect=>{actual=rect;return f.image;};
  const result=await f.capture(f.event);
  assert.deepEqual(actual,{x:20,y:30,width:400,height:225});
  assert.equal(result.image,'data:image/png;base64,cG5n');
  assert.equal(result.width,400);
});
test('native capture rejects hidden windows, empty images and stale channels', async () => {
  let f=fixture();f.window.isMinimized=()=>true;await assert.rejects(f.capture(f.event),/显示/);
  f=fixture();f.image.isEmpty=()=>true;await assert.rejects(f.capture(f.event),/没有截到/);
  f=fixture();let call=0;f.contents.executeJavaScriptInIsolatedWorld=async()=>({...bounds,camera:++call===1?'panda':'albatross'});await assert.rejects(f.capture(f.event),/机位/);
});
test('navigation during native capture cannot return a screenshot', async () => {
  const f=fixture(); f.contents.capturePage=async()=>{f.contents.mainFrame.url='https://example.com/';return f.image;};
  await assert.rejects(f.capture(f.event),/本程序/);
});
test('timed-out native work stays locked until it settles and drops late output', async () => {
  const f=fixture();let finish;
  f.contents.capturePage=()=>new Promise(resolve=>{finish=resolve;});
  const first=f.capture(f.event);
  await assert.rejects(f.capture(f.event),/上一帧/);
  await assert.rejects(first,/超时/);
  await assert.rejects(f.capture(f.event),/上一帧/);
  finish(f.image); await new Promise(resolve=>setImmediate(resolve));
  f.contents.capturePage=async()=>f.image;
  assert.equal((await f.capture(f.event)).width,400);
});

test('layout changes during capture discard pixels from the old position', async () => {
  const f=fixture();let call=0;
  f.contents.executeJavaScriptInIsolatedWorld=async()=>({...bounds,x:++call===1?20:25});
  await assert.rejects(f.capture(f.event),/位置/);
});
