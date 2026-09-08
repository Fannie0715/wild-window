import { ensureOllama } from './ollama-runtime.mjs';
import { VISION_MODEL } from './vision.mjs';
let runtime;
try {
  console.log('启用 Qwen3-VL 4B 本地识图。首次需要下载约 3.3GB 模型，请保持网络连接。');
  runtime = await ensureOllama({ install: true });
  const tags = await (await fetch('http://127.0.0.1:11434/api/tags')).json();
  if (!tags.models?.some(model => model.name === VISION_MODEL)) {
    const response = await fetch('http://127.0.0.1:11434/api/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: VISION_MODEL, stream: true }) });
    if (!response.ok || !response.body) throw new Error('模型下载未能开始，请检查网络。');
    let pending = '', lastProgress = '', completed = false;
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const item = JSON.parse(line); if (item.error) throw new Error(item.error);
        if (item.status === 'success') completed = true;
        const progress = item.total ? `${item.status}: ${Math.floor((item.completed || 0) / item.total * 20) * 5}%` : item.status;
        if (progress && progress !== lastProgress) { console.log(progress); lastProgress = progress; }
      }
    }
    if (!completed) throw new Error('下载中断。重新运行本脚本即可继续下载。');
  }
  console.log('\n本地识图已就绪！打开野外值班，点击“识别动物”。\n本窗口可关闭；启动网页时会自动连接或启动本地模型。');
} catch (error) { console.error('\n' + error.message); process.exitCode = 1; }
finally { runtime?.stop(); }
