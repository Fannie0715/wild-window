'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Crosshair, ExternalLink, PawPrint, Maximize, Pause, PictureInPicture2, Play, Radio, RotateCw, ScanLine, Volume2 } from 'lucide-react';
import AnimalObserver, { type AnimalObserverHandle } from './animal-observer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { registerCameraTools } from '@/lib/camera-tools';
import { flushSync } from 'react-dom';

import { cameras } from '@/lib/cameras';
import { desktopBridge } from '@/lib/desktop';

export default function Home() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [connection, setConnection] = useState(0);
  const [nativeCapture, setNativeCapture] = useState(false);
  const [compact, setCompact] = useState(false);
  const [clock, setClock] = useState<Date | null>(null);
  const [notice, setNotice] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const monitor = useRef<HTMLDivElement>(null);
  const captureTarget = useRef<HTMLDivElement>(null);
  const observer = useRef<AnimalObserverHandle>(null);
  const camera = cameras[index];
  const stateRef = useRef({index:0,compact:false});
  stateRef.current={index,compact};
  useEffect(() => {
    const context = (document as Document & {modelContext?: Parameters<typeof registerCameraTools>[0]}).modelContext;
    if(!context) return;
    return registerCameraTools(context,cameras,() => ({cameraId:cameras[stateRef.current.index].id,compact:stateRef.current.compact}), id => {const next=cameras.findIndex(c=>c.id===id);flushSync(() => {setIndex(next);setPlaying(false);setNotice('');});}, () => {flushSync(() => setScanOpen(true));});
  }, []);
  useEffect(() => { setCompact(new URLSearchParams(location.search).has('mini')); setClock(new Date()); const timer = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(timer); }, []);
  function select(next: number) { const selected=(next + cameras.length) % cameras.length; setIndex(selected); setNotice(''); const url=new URL(location.href);url.searchParams.set('camera',cameras[selected].id);history.replaceState(history.state,'',url); }
  useEffect(() => { function onKey(e: KeyboardEvent) { if (e.target instanceof HTMLElement && (e.target.closest('input,textarea,select,[role=dialog]') || e.target.isContentEditable)) return; if(e.key === 'ArrowLeft') { e.preventDefault(); select(stateRef.current.index-1); } if(e.key === 'ArrowRight') { e.preventDefault(); select(stateRef.current.index+1); } } window.addEventListener('keydown',onKey); return () => window.removeEventListener('keydown',onKey); }, []);
  useEffect(() => { const list = document.querySelector('.camera-list'); const item = list?.querySelector<HTMLElement>('.camera-item.active'); if(list && item) { const top = item.getBoundingClientRect().top - list.getBoundingClientRect().top; if(top < 0) list.scrollTop += top; else if(top + item.offsetHeight > list.clientHeight) list.scrollTop += top + item.offsetHeight - list.clientHeight; } }, [index]);
  function connect() { if(camera.embed) setPlaying(true); else window.location.assign(camera.source); }
  function openMini() { const native = desktopBridge(); if (native) { void native.openMini(camera.id).catch(() => setNotice('小窗打开失败，请重试。')); return; } const target = new URL(location.href); target.searchParams.set('mini','1'); target.searchParams.set('camera', camera.id); const win = window.open(target.toString(), 'wild-window-mini', 'popup,width=540,height=570'); if(!win) { setCompact(true); setNotice('已切换为紧凑模式；允许弹出窗口后可独立显示。'); } }
  useEffect(() => { if (desktopBridge()) { setNativeCapture(true); setPlaying(true); } const id = new URLSearchParams(location.search).get('camera'); const found = cameras.findIndex(c => c.id === id); if(found >= 0) setIndex(found); }, []);
  async function fullscreen() { try { if(document.fullscreenElement) await document.exitFullscreen(); else await monitor.current?.requestFullscreen(); } catch { setNotice('此浏览器暂不支持全屏，可使用小窗模式。'); } }
  const stationTime = clock?.toLocaleString('sv-SE', { hour12: false }) || '---- -- --  --:--:--';
  const localTime = clock ? new Intl.DateTimeFormat('en-GB', {timeZone:camera.timezone, hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(clock) : '--:--:--';
  return <main className={compact ? 'app compact' : 'app'}>
    <header className="site-header">
      <a className="brand" href="./" aria-label="野外值班首页"><span className="brand-mark"><PawPrint size={27}/></span><span><strong>WILDLIFE MONITORING STATION</strong><small>野外值班 <span>/</span> 野生动物监控站</small></span></a>
      <div className="station-telemetry"><span className={'signal-meter ' + (playing ? 'connected' : '')} aria-hidden="true"><i/><i/><i/><i/></span><span className={'station-status ' + (playing ? 'connected' : '')}><span className="status-dot"/>{playing ? '已接通' : '待机中'}</span><time className="station-clock" dateTime={clock?.toISOString()}>{stationTime}</time></div>
      <button className="quiet-button" onClick={openMini}><PictureInPicture2 size={17}/><span>上班小窗</span><ArrowUpRight size={14}/></button>
    </header>
    <div className="workspace">
      <section className="main-column">
        <div className="section-heading"><div><span className="eyebrow">FIELD OBSERVATION / 现场观察</span><h1>给工位，开一扇野外的窗。</h1></div><span className="station-count">{String(cameras.length).padStart(2,'0')} <span>个机位 / 随时出走</span></span></div>
        <div className="monitor" ref={monitor}>
          <div className="monitor-top"><div><Radio size={15}/><span>WILD WINDOW</span><span className="muted"> / MONITOR {String(index+1).padStart(2,'0')}</span></div><div className="monitor-led"><span className="status-dot"/> {playing ? 'OFFICIAL PLAYER' : 'STANDBY'}</div></div>
          <div ref={captureTarget} data-live-player data-camera={camera.id} className={'screen ' + (playing ? 'is-playing' : '')}>
            {camera.image && !playing && <img className="scene" src={camera.image} alt={`${camera.name}机位资料图，非实时画面`} onError={e => { e.currentTarget.style.opacity = '0'; }}/>}
            {playing && camera.embed && <iframe key={`${camera.id}-${connection}`} className="stream" title={`${camera.name}官方直播播放器`} src={`${camera.embed}?autoplay=1&mute=1&playsinline=1&rel=0`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/>}
            {!playing && <><div className="screen-shade"/><div className="scanlines"/><div className="viewfinder"><span className="corner tl"/><span className="corner tr"/><span className="corner bl"/><span className="corner br"/><div className="viewfinder-top"><span><span className="amber-dot"/> {camera.image ? '机位预览 · 非实时' : '待接通信号'}</span><span>CAM {String(index+1).padStart(2,'0')} <span className="battery">▮▮▮</span></span></div><div className="focus-cross"><span/><span/></div><div className="viewfinder-bottom"><span>{camera.coordinates}</span><span>当地 {localTime}</span></div></div><>{camera.embed ? <button className="connect-button" onClick={connect}><Play size={18} fill="currentColor"/><span>接通信号</span></button> : <a className="connect-button" href={camera.source}><ArrowUpRight size={20}/><span>直接打开原站直播</span></a>}</><div className="screen-caption"><span>{camera.tag}</span><strong>{camera.name}</strong><p>{camera.country} · {camera.region}</p></div><span className="screen-serial">WW—{String(index+1).padStart(3,'0')}<br/>EARTH IS ON AIR</span></>}
          </div>
          <div className="camera-controls"><div className="channel-stepper"><button className="icon-button" aria-label="上一个机位" onClick={() => select(index-1)}><ChevronLeft size={21}/></button><span><b>{String(index+1).padStart(2,'0')}</b><span>/ {String(cameras.length).padStart(2,'0')}</span></span><button className="icon-button" aria-label="下一个机位" onClick={() => select(index+1)}><ChevronRight size={21}/></button></div><div className="control-divider"/><Select value={camera.id} onValueChange={value => { const next=cameras.findIndex(c => c.id === value); if(next >= 0)select(next); }}><SelectTrigger className="camera-select" aria-label="选择直播地址"><SelectValue>{camera.name}</SelectValue></SelectTrigger><SelectContent className="camera-select-popup">{cameras.map((cam,i) => <SelectItem value={cam.id} key={cam.id}>{String(i+1).padStart(2,'0')} · {cam.name}</SelectItem>)}</SelectContent></Select><div className="player-actions"><button className="icon-button" aria-label={playing ? '断开播放器' : '播放直播'} onClick={() => playing ? setPlaying(false) : connect()}>{playing ? <Pause size={17}/> : <Play size={17}/>}</button><button className="icon-button" aria-label="声音提示" onClick={() => setNotice('直播默认静音，请在官方播放器内打开声音。')}><Volume2 size={18}/></button><button className="icon-button" aria-label="全屏查看" onClick={fullscreen}><Maximize size={17}/></button><button className="identify-button" onClick={() => observer.current?.captureCurrent()}><ScanLine size={17}/><span>识别动物</span></button></div></div>
          <div className="monitor-bottom"><span><span className="tiny-cross">+</span> {playing ? nativeCapture ? '可直接截图识别 · 默认静音' : '接通后可直接切台 · 默认静音' : '直播里的相遇，值得等一等'}</span><div className="stream-links">{playing && <button onClick={() => setConnection(value => value + 1)} aria-label="重新连接当前直播"><RotateCw size={12}/> 重连</button>}<a href={camera.source} target="_blank" rel="noopener noreferrer" aria-label={`打开${camera.provider}原站直播`}>{camera.provider} <ExternalLink size={12}/></a></div></div>
        </div>

        {notice && <p className="notice" role="status">{notice}</p>}
      </section>
      <aside className="camera-panel"><div className="panel-heading"><span><Radio size={16}/> 切换机位</span><span className="eyebrow">CHANNELS / {String(cameras.length).padStart(2,'0')}</span></div><div className="camera-list" role="group" aria-label="全部直播机位">{cameras.map((cam,i) => <button className={'camera-item ' + (index === i ? 'active' : '')} key={cam.id} onClick={() => select(i)} aria-pressed={index === i}><span className="camera-number">{String(i+1).padStart(2,'0')}</span><span className="camera-details"><span className="camera-location">{cam.country}<span> / {cam.tag}</span></span><strong>{cam.name}</strong><span className="camera-en">{cam.en}</span></span><span className="camera-arrow">{index === i ? <span className="status-dot"/> : <ArrowUpRight size={16}/>}</span></button>)}</div><div className="channel-hint"><span className="keyboard-key">←</span><span className="keyboard-key">→</span><span>键盘也可以切换机位</span></div><div className="field-guide"><Crosshair size={24}/><span className="eyebrow">CURIOSITY, CONNECTED</span><h2>遇到不认识的邻居？</h2><p>截取当前画面，<br/>认识镜头里的动物。</p><button onClick={() => observer.current?.captureCurrent()}>识别动物 <ArrowUpRight size={16}/></button></div></aside>
    </div>
    <footer className="site-footer"><span><span className="status-dot"/> 地球照常运转，你可以发会儿呆。</span><a href="./observation-game/" className="game-link">离线观察挑战 <ArrowUpRight size={14}/></a></footer>
    {compact && <div className="compact-toolbar"><button onClick={() => setCompact(false)}><Maximize size={14}/> 展开控制台</button><button onClick={() => observer.current?.captureCurrent()}><ScanLine size={14}/> 识别动物</button></div>}
    <AnimalObserver ref={observer} captureTarget={captureTarget} enabled={playing} open={scanOpen} onOpenChange={setScanOpen} location={`${camera.country} · ${camera.name}`}/>
  </main>;
}
