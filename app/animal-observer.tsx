'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react';
import { ArrowUpRight, Camera, Check, Copy, Download, ImagePlus, LoaderCircle, ScanLine, Square, X } from 'lucide-react';
import { desktopBridge, type DesktopCapture } from '@/lib/desktop';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

type Props = { open: boolean; onOpenChange: (value: boolean) => void; location: string; captureTarget: RefObject<HTMLDivElement | null>; enabled: boolean };
export type AnimalObserverHandle = { captureCurrent: () => void };
type CroppableTrack = MediaStreamTrack & { cropTo?: (target: object) => Promise<void> };
type RegionWindow = Window & { CropTarget?: { fromElement: (element: Element) => Promise<object> } };
const DIRECT_CAPTURE_HELP = '当前浏览器不支持直接截取播放器。请用桌面版 Chrome 打开本页，或截图后直接粘贴到这里。';
type ModelState = 'checking' | 'ready' | 'offline' | 'model_missing' | 'local_only';
type Observation = { animalPresent: boolean; name: string; scientificName: string; certainty: 'clear' | 'uncertain' | 'unknown'; visibleFeatures: string[]; description: string; habitat: string; diet: string; fact: string };

const AnimalObserver = forwardRef<AnimalObserverHandle, Props>(function AnimalObserver({ open, onOpenChange, location, captureTarget, enabled }, ref) {
  const [picture, setPicture] = useState('');
  const [status, setStatus] = useState('');
  const [captureBusy, setCaptureBusy] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [canCapture, setCanCapture] = useState(false);
  const [nativeCapture, setNativeCapture] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [modelState, setModelState] = useState<ModelState>('checking');
  const [result, setResult] = useState<Observation | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const captureStream = useRef<MediaStream | null>(null);
  const captureVideo = useRef<HTMLVideoElement | null>(null);
  const captureVersion = useRef(0);
  const captureLock = useRef(false);
  const modelCheck = useRef<Promise<ModelState> | null>(null);
  const ready = modelState === 'ready';
  const busy = captureBusy || identifying;

  function stopSharing() {
    captureVersion.current++; setCaptureBusy(false);
    captureStream.current?.getTracks().forEach(track => track.stop());
    if (captureVideo.current) captureVideo.current.srcObject = null;
    captureStream.current = null; captureVideo.current = null; setSharing(false);
  }
  function cancelRecognition() {
    activeRequest.current?.abort(); activeRequest.current = null; setIdentifying(false);
  }
  function checkModel(): Promise<ModelState> {
    if (modelCheck.current) return modelCheck.current;
    setModelState('checking');
    const request = (async (): Promise<ModelState> => {
      let state: ModelState;
      try {
        const response = await fetch('/api/vision/status', { signal: AbortSignal.timeout(6000) });
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) state = 'local_only';
        else { const data = await response.json(); state = data.ready ? 'ready' : data.state === 'model_missing' ? 'model_missing' : 'offline'; }
      } catch { state = 'offline'; }
      setModelState(state); return state;
    })();
    modelCheck.current = request;
    void request.finally(() => { if (modelCheck.current === request) modelCheck.current = null; });
    return request;
  }
  useEffect(() => {
    const native = !!desktopBridge();
    setNativeCapture(native);
    setCanCapture(native || (!!navigator.mediaDevices?.getDisplayMedia && !!(window as RegionWindow).CropTarget?.fromElement));
    void checkModel();
    return () => { captureVersion.current++; activeRequest.current?.abort(); captureStream.current?.getTracks().forEach(track => track.stop()); if (captureVideo.current) captureVideo.current.srcObject = null; };
  }, []);
  useEffect(() => { if (open && modelState !== 'ready') void checkModel(); }, [open]);
  useEffect(() => {
    captureVersion.current++; cancelRecognition(); setCaptureBusy(false); setResult(null); setPicture(''); setStatus('');
  }, [location]);
  useEffect(() => { if (!enabled) stopSharing(); }, [enabled]);
  useImperativeHandle(ref, () => ({ captureCurrent: () => { void capture(); } }));
  useEffect(() => {
    if (!open) return;
    function onPaste(event: ClipboardEvent) {
      if (captureLock.current) return;
      const file = Array.from(event.clipboardData?.items || []).find(item => item.type.startsWith('image/'))?.getAsFile();
      if (file) { event.preventDefault(); void loadFile(file); }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, ready]);

  async function identify(image: string) {
    cancelRecognition(); setResult(null); setStatus('');
    const controller = new AbortController(); activeRequest.current = controller; setIdentifying(true);
    const timer = setTimeout(() => controller.abort(), 190000);
    try {
      const response = await fetch('/api/vision/identify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }), signal: controller.signal,
      });
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('请在本地安装版中使用 Qwen3-VL 识图。');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '识别未完成，请重试。');
      if (!data.result || typeof data.result.name !== 'string' || !Array.isArray(data.result.visibleFeatures)) throw new Error('识别结果不完整，请重试。');
      if (activeRequest.current === controller) setResult(data.result);
    } catch (error) {
      if (activeRequest.current === controller) setStatus(controller.signal.aborted ? '识别超时，请重试。首次加载模型可能较慢。' : error instanceof Error ? error.message : '识别未完成，请重试。');
    } finally {
      clearTimeout(timer);
      if (activeRequest.current === controller) { activeRequest.current = null; setIdentifying(false); }
    }
  }
  async function acceptCanvas(canvas: HTMLCanvasElement, version: number) {
    await acceptImage(canvas.toDataURL('image/png'), version);
  }
  async function acceptImage(image: string, version: number) {
    if (version !== captureVersion.current) return;
    cancelRecognition(); setPicture(image); setResult(null); setStatus('');
    const state = ready ? 'ready' : await checkModel();
    if (version !== captureVersion.current) return;
    if (state === 'ready') void identify(image);
    else setStatus('截图已就绪。连接本地模型后，点击“识别这张图”。');
  }
  async function loadFile(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setStatus('请选择 JPG、PNG 或 WebP 图片。'); return; }
    if (file.size > 12 * 1024 * 1024) { setStatus('图片超过 12 MB，请先缩小后再上传。'); return; }
    const version = ++captureVersion.current;
    cancelRecognition(); setCaptureBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d'); if (!context) throw new Error('canvas');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      if (version === captureVersion.current) await acceptCanvas(canvas, version);
    } catch { if (version === captureVersion.current) setStatus('这张图片没有成功打开，请换一张截图。'); }
    finally { if (version === captureVersion.current) setCaptureBusy(false); if (input.current) input.current.value = ''; }
  }
  async function captureNative(native: DesktopCapture) {
    const version = ++captureVersion.current;
    captureLock.current = true; cancelRecognition(); setCaptureBusy(true); setStatus(''); onOpenChange(false);
    try {
      await new Promise(resolve => setTimeout(resolve, 150));
      if (version !== captureVersion.current) return;
      captureTarget.current?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
      await new Promise(resolve => setTimeout(resolve, 250));
      if (version !== captureVersion.current) return;
      const captured = await native.captureLivePlayer();
      if (!captured.image.startsWith('data:image/png;base64,') || !captured.width || !captured.height) throw new Error('没有截到直播画面，请重试。');
      if (version === captureVersion.current) await acceptImage(captured.image, version);
    } catch (error) {
      if (version === captureVersion.current) setStatus(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') : '截图失败，请等直播出画面后重试。');
    } finally {
      captureLock.current = false;
      if (version === captureVersion.current) { setCaptureBusy(false); onOpenChange(true); }
    }
  }
  async function capture() {
    if (captureLock.current) return;
    if (!enabled || !captureTarget.current) { setStatus('请先接通直播，再点击“识别动物”；也可以直接粘贴或上传图片。'); onOpenChange(true); return; }
    const native = desktopBridge();
    if (native) { await captureNative(native); return; }
    const region = (window as RegionWindow).CropTarget;
    if (!navigator.mediaDevices?.getDisplayMedia || !region?.fromElement) { setStatus(DIRECT_CAPTURE_HELP); onOpenChange(true); return; }
    const version = ++captureVersion.current;
    captureLock.current = true;
    cancelRecognition(); setCaptureBusy(true); setStatus(''); onOpenChange(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let acquired: MediaStream | null = null;
    try {
      if (!captureStream.current?.getVideoTracks().some(track => track.readyState === 'live')) {
        // Keep this call in the original click: awaiting model status first loses user activation.
        const options = { video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' };
        acquired = await navigator.mediaDevices.getDisplayMedia(options);
        if (version !== captureVersion.current) return;
        const track = acquired.getVideoTracks()[0] as CroppableTrack | undefined;
        if (!track?.cropTo) throw new Error(DIRECT_CAPTURE_HELP);
        // A failed crop must never fall back to sending an entire screen or another tab.
        try { await track.cropTo(await region.fromElement(captureTarget.current)); }
        catch { throw new Error('请选择“此标签页 / Global Wildlife Monitor”。未能定位直播区域，尚未截取或识别。'); }
        if (version !== captureVersion.current) return;
        captureStream.current = acquired;
        const stream = acquired;
        track.addEventListener('ended', () => { if (captureStream.current === stream) stopSharing(); }, { once: true });
        const video = document.createElement('video'); video.muted = true; video.srcObject = stream; captureVideo.current = video;
        await Promise.race([video.play(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('播放器截图准备超时，请重试。')), 12000); })]);
        if (version !== captureVersion.current) return;
        setSharing(true);
      }
      // Keep the target visible after dialog scroll-lock and focus restoration are removed.
      await new Promise(resolve => setTimeout(resolve, 150));
      if (version !== captureVersion.current) return;
      captureTarget.current.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      // The capture region follows layout changes; hide the dialog before taking a fresh frame.
      await new Promise(resolve => setTimeout(resolve, 250));
      const video = captureVideo.current;
      if (!video?.videoWidth || !video.videoHeight) throw new Error('没有截到直播画面，请确认播放器已出画面。');
      await new Promise<void>((resolve, reject) => {
        let frame: number | undefined;
        const fallback = setTimeout(() => { if (frame !== undefined) video.cancelVideoFrameCallback(frame); reject(new Error('没有收到新的直播画面，请保持页面可见后重试。')); }, 4000);
        if (video.requestVideoFrameCallback) frame = video.requestVideoFrameCallback(() => { clearTimeout(fallback); resolve(); });
      });
      if (version !== captureVersion.current) return;
      const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext('2d'); if (!context) throw new Error('当前浏览器无法生成截图。');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (version === captureVersion.current) await acceptCanvas(canvas, version);
    } catch (error) {
      if (version === captureVersion.current) {
        captureStream.current?.getTracks().forEach(track => track.stop());
        if (captureVideo.current) captureVideo.current.srcObject = null;
        captureStream.current = null; captureVideo.current = null; setSharing(false);
        setStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? '未获得画面共享许可，尚未截图。若当前小窗无法共享，请用桌面 Chrome 打开本页重试。' : error instanceof DOMException && error.name === 'InvalidStateError' ? '请让直播标签页保持在前台，再亲自点击一次“截取直播并识别”。' : error instanceof Error ? error.message : '未能截到画面，请粘贴或上传系统截图。');
      }
    } finally {
      clearTimeout(timer); captureLock.current = false;
      if (acquired && (version !== captureVersion.current || acquired !== captureStream.current)) {
        acquired.getTracks().forEach(track => track.stop());
        if (captureStream.current === acquired) { captureStream.current = null; if (captureVideo.current) captureVideo.current.srcObject = null; captureVideo.current = null; setSharing(false); }
      }
      if (version === captureVersion.current) { setCaptureBusy(false); onOpenChange(true); }
    }
  }
  async function copyPageAddress() {
    try { await navigator.clipboard.writeText(window.location.href); setStatus('本页地址已复制，请在桌面 Chrome 中粘贴打开。'); }
    catch { setStatus(`请在桌面 Chrome 打开：${window.location.href}`); }
  }
  async function copyImage() {
    try {
      if (!navigator.clipboard?.write || !window.ClipboardItem) throw new Error('unsupported');
      const bytes = Uint8Array.from(atob(picture.split(',')[1]), char => char.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'image/png' });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); setStatus('截图已复制。');
    } catch { setStatus('浏览器没有允许复制图片，可以保存图片。'); }
  }

  const modelLabel = { checking: '正在检查本地模型…', ready: 'Qwen3-VL 4B · 本地识图已就绪', offline: '本地模型尚未启动', model_missing: '需要下载 Qwen3-VL 4B', local_only: '本地安装版支持 Qwen3-VL 识图' }[modelState];
  return <>
    {captureBusy && !open && <div className="share-status" role="status"><LoaderCircle className="spin" size={15}/> 正在截取直播画面…<button onClick={() => { stopSharing(); setStatus(nativeCapture ? '截图已取消。' : '截图已取消。若共享选择窗口仍然打开，请先关闭它。'); onOpenChange(true); }}><Square size={13}/> 取消截图</button></div>}
    {sharing && !captureBusy && <div className="share-status" role="status"><span className="status-dot"/> 画面共享中<button onClick={stopSharing}><Square size={13}/> 停止共享</button></div>}
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="observer-dialog" showCloseButton={false}>
      <div className="observer-titlebar"><span><ScanLine size={18}/> FIELD GUIDE / 动物观察员</span><button className="icon-button" onClick={() => onOpenChange(false)} aria-label="关闭动物观察员"><X size={20}/></button></div>
      <div className="observer-content"><span className="eyebrow">保持好奇，慢慢认识。</span><DialogTitle className="observer-title">这位野外邻居，是谁？</DialogTitle><DialogDescription className="observer-description">自动截取直播画面，在这里查看动物介绍。</DialogDescription>
        <div className={'model-status ' + (ready ? 'is-ready' : '')}><span>{ready ? <Check size={15}/> : <ScanLine size={15}/>} {modelLabel}</span>{modelState !== 'checking' && <button onClick={checkModel} disabled={busy}>重新检测</button>}</div>
        {!ready && modelState !== 'checking' && <div className="model-setup">{modelState === 'local_only' ? <><p>请在自己电脑运行安装版，图片由本机处理。</p><a href="http://127.0.0.1:4191/" target="_blank" rel="noopener noreferrer">打开本地网页 <ArrowUpRight size={14}/></a></> : <><p>双击项目里的「启用本地识图」，首次会下载约 3.3GB 的模型。窗口提示就绪后，点击重新检测。</p><p>已有 Ollama：<code>ollama pull qwen3-vl:4b-instruct</code></p></>}</div>}
        <div className="capture-tools"><button onClick={capture} disabled={busy || !canCapture || !enabled}><Camera size={17}/>{captureBusy ? '正在准备…' : picture ? '再看一帧' : '截取直播并识别'}</button><button onClick={() => input.current?.click()} disabled={busy}><ImagePlus size={17}/>{picture ? '更换图片' : '上传图片识别'}</button><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void loadFile(e.target.files?.[0])} className="sr-only" aria-label="选择动物截图"/></div>
        {status && <p className="observer-status" role="status">{status}</p>}
        <p className="capture-tip">{nativeCapture ? '桌面窗口直接截取当前直播区域，无需共享屏幕。图片仅由本机 Qwen 处理。' : canCapture ? sharing ? '已连接直播区域，再点一次就能截取新画面。共享会持续到你点击“停止共享”。' : '首次请选择“此标签页 / Global Wildlife Monitor”并允许共享。之后点击“识别动物”就会自动截取直播区域，无需上传。' : DIRECT_CAPTURE_HELP}</p>
        {!canCapture && <button className="copy-page-address" onClick={copyPageAddress}><Copy size={14}/> 复制本页地址到 Chrome</button>}
        {sharing && <button className="stop-sharing" onClick={stopSharing}><Square size={13}/> 停止共享画面</button>}
        {picture ? <div className="capture-preview"><img src={picture} alt="正在识别的动物截图"/><div><span><Check size={13}/> 当前识别画面</span><button onClick={() => { captureVersion.current++; cancelRecognition(); setCaptureBusy(false); setPicture(''); setResult(null); setStatus(''); }} aria-label="移除截图"><X size={15}/></button></div></div> : <button className="upload-zone" onClick={() => input.current?.click()} disabled={busy}><ScanLine size={32}/><strong>看见它，认识它</strong><span>也可直接粘贴截图 · ⌘V / Ctrl+V</span></button>}
        {picture && <div className="image-actions">{identifying ? <button className="primary-action" onClick={() => { cancelRecognition(); setStatus('识别已取消。'); }}><Square size={15}/> 取消识别</button> : <button className="primary-action" onClick={() => void identify(picture)} disabled={!ready || captureBusy}><ScanLine size={16}/>{result ? '重新识别' : '识别这张图'}</button>}<a href={picture} download="wild-window-animal.png"><Download size={16}/> 保存图片</a></div>}
        {identifying && <div className="recognition-loading" role="status"><LoaderCircle className="spin" size={19}/><span>Qwen3-VL 正在观察…<small>首次加载模型可能需要稍等片刻。</small></span></div>}
        {result && <section className="animal-result" aria-label="动物识别结果" aria-live="polite"><div className="result-heading"><span className="eyebrow">OBSERVATION / 观察结果</span><span className={'certainty ' + result.certainty}>{result.certainty === 'clear' ? '特征较清楚' : result.certainty === 'uncertain' ? '可能是 · 待确认' : '暂无法确定'}</span></div><h3>{result.name}</h3>{result.scientificName && <p className="scientific-name">{result.scientificName}</p>}<p>{result.description}</p>{result.visibleFeatures.length > 0 && <div className="visible-features">{result.visibleFeatures.map((feature, i) => <span key={i}>{feature}</span>)}</div>}{result.animalPresent && <dl>{result.habitat && <><dt>栖息地</dt><dd>{result.habitat}</dd></>}{result.diet && <><dt>食性</dt><dd>{result.diet}</dd></>}{result.fact && <><dt>一个小知识</dt><dd>{result.fact}</dd></>}</dl>}<p className="result-note">AI 观察供参考；不确定的物种请结合更多清晰画面确认。</p></section>}
        <details className="prompt-details"><summary>也可以使用其他 AI</summary><p>手动复制图片，到常用 AI 粘贴或上传；打开链接不会自动传图。</p>{picture && <button onClick={copyImage}><Copy size={14}/> 复制图片</button>}<div className="assistant-links"><a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">ChatGPT <ArrowUpRight size={15}/></a><a href="https://www.qianwen.com/" target="_blank" rel="noopener noreferrer">千问 <ArrowUpRight size={15}/></a><a href="https://gemini.google.com/" target="_blank" rel="noopener noreferrer">Gemini <ArrowUpRight size={15}/></a></div></details>
        <p className="privacy-note">本地识别使用 Qwen3-VL 4B Instruct。截图不上传云端、不写入磁盘；关闭页面即清除当前结果。</p>
      </div>
    </DialogContent></Dialog>
  </>;
});
export default AnimalObserver;
