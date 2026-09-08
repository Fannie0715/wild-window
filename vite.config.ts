import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { defineConfig } from 'vite';
// Local Node middleware is shared with the dependency-free release server.
import { createVisionHandler } from './scripts/vision.mjs';
import { createRuntimeManager } from './scripts/ollama-runtime.mjs';

export default defineConfig({
  base: './',
  plugins: [react(), {
    name: 'local-wildlife-vision',
    async configureServer(server) { const runtime = createRuntimeManager(); await runtime.ensure().catch(() => null); server.httpServer?.once('close', () => runtime.stop()); const handle = createVisionHandler({ ensureRuntime: () => runtime.ensure() }); server.middlewares.use(async (req, res, next) => { if (!await handle(req, res)) next(); }); },
    async configurePreviewServer(server) { const runtime = createRuntimeManager(); await runtime.ensure().catch(() => null); server.httpServer.once('close', () => runtime.stop()); const handle = createVisionHandler({ ensureRuntime: () => runtime.ensure() }); server.middlewares.use(async (req, res, next) => { if (!await handle(req, res)) next(); }); },
  }],
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
  server: { host: '127.0.0.1', port: 4191, watch: { usePolling: process.env.CODEX_SANDBOX === 'seatbelt' } },
  preview: { host: '127.0.0.1', port: 4191 },
  build: { outDir: 'dist', emptyOutDir: true },
});
