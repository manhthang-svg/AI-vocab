const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const extractZip = require('extract-zip');

const MODEL = {
  id: 'qwen3-4b-q4-k-m',
  name: 'Qwen3 4B · Q4_K_M',
  filename: 'Qwen3-4B-Q4_K_M.gguf',
  url: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf?download=true',
  urls: [
    'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf?download=true',
    'https://modelscope.cn/models/Qwen/Qwen3-4B-GGUF/resolve/master/Qwen3-4B-Q4_K_M.gguf'
  ],
  size: 2497280256,
  sha256: '7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5'
};

const ENGINE = {
  version: 'b10107',
  filename: 'llama-b10107-bin-win-vulkan-x64.zip',
  url: 'https://github.com/ggml-org/llama.cpp/releases/download/b10107/llama-b10107-bin-win-vulkan-x64.zip',
  size: 33479694,
  sha256: 'c5b3a5ee8319b1eccbb748a54390aa806bbf7d1aceeea452e4c57921d113e53e'
};

const RESOURCE_MODES = {
  saver: { gpuLayers: 0, context: 2048, threads: 4, label: 'Tiết kiệm' },
  balanced: { gpuLayers: 99, context: 3072, threads: 6, label: 'Cân bằng' },
  fast: { gpuLayers: 99, context: 4096, threads: 8, label: 'Nhanh' }
};

function cleanError(error) {
  if (error?.name === 'AbortError') return 'Đã tạm dừng tải AI cục bộ. Bạn có thể tiếp tục bất cứ lúc nào.';
  return String(error?.message || error || 'Lỗi không xác định.');
}

async function exists(filePath) {
  try { await fsp.access(filePath); return true; } catch { return false; }
}

async function sha256(filePath, onProgress = () => {}) {
  const stat = await fsp.stat(filePath);
  const hash = crypto.createHash('sha256');
  let processed = 0;
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) {
    processed += chunk.length;
    hash.update(chunk);
    onProgress(stat.size ? processed / stat.size : 1);
  }
  return hash.digest('hex');
}

async function findFile(root, filename) {
  const entries = await fsp.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) return candidate;
    if (entry.isDirectory()) {
      const nested = await findFile(candidate, filename);
      if (nested) return nested;
    }
  }
  return '';
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

class LocalAIManager {
  constructor({ root, publish = () => {}, smokeMode = false, retryDelayMs = 1200 }) {
    this.root = root;
    this.publish = publish;
    this.smokeMode = smokeMode;
    this.retryDelayMs = retryDelayMs;
    this.runtimeDir = path.join(root, 'runtime', ENGINE.version);
    this.modelDir = path.join(root, 'models');
    this.modelPath = path.join(this.modelDir, MODEL.filename);
    this.modelMarker = `${this.modelPath}.verified`;
    this.engineArchive = path.join(root, 'downloads', ENGINE.filename);
    this.process = null;
    this.port = 0;
    this.controller = null;
    this.downloadPromise = null;
    this.idleTimer = null;
    this.inferenceQueue = Promise.resolve();
    this.lastLogs = '';
    this.current = {
      state: smokeMode ? 'ready' : 'checking',
      phase: '',
      percent: smokeMode ? 100 : 0,
      bytesReceived: 0,
      bytesTotal: MODEL.size + ENGINE.size,
      message: smokeMode ? 'AI cục bộ mô phỏng đã sẵn sàng.' : 'Đang kiểm tra AI cục bộ…',
      model: MODEL,
      engineVersion: ENGINE.version,
      running: false
    };
  }

  emit(patch = {}) {
    this.current = {
      ...this.current,
      ...patch,
      model: MODEL,
      engineVersion: ENGINE.version,
      running: Boolean(this.process && !this.process.killed)
    };
    this.publish(this.current);
    return this.current;
  }

  async status() {
    if (this.smokeMode) return this.emit({ state: 'ready', percent: 100, message: 'AI cục bộ đã sẵn sàng.' });
    const modelReady = await this.modelVerified();
    const enginePath = await this.enginePath();
    if (modelReady && enginePath) {
      if (!['loading', 'running', 'generating'].includes(this.current.state)) {
        this.emit({ state: 'ready', percent: 100, message: 'AI cục bộ đã sẵn sàng để chấm offline.' });
      }
    } else if (!this.downloadPromise && !['paused', 'error'].includes(this.current.state)) {
      const partialBytes = await this.partialBytes();
      this.emit({
        state: partialBytes ? 'paused' : 'not-installed',
        percent: Math.floor((partialBytes / (MODEL.size + ENGINE.size)) * 100),
        bytesReceived: partialBytes,
        message: partialBytes ? 'Bản tải dở đã được giữ lại. Nhấn Tiếp tục để tải tiếp.' : 'Chưa tải model AI cục bộ.'
      });
    }
    return this.current;
  }

  async validInstalledFile(filePath, expectedSize) {
    try { return (await fsp.stat(filePath)).size === expectedSize; } catch { return false; }
  }

  async modelVerified() {
    if (!(await this.validInstalledFile(this.modelPath, MODEL.size))) return false;
    try { return (await fsp.readFile(this.modelMarker, 'utf8')).trim() === MODEL.sha256; } catch { return false; }
  }

  async enginePath() {
    if (!(await exists(this.runtimeDir))) return '';
    return findFile(this.runtimeDir, 'llama-server.exe');
  }

  async partialBytes() {
    let total = 0;
    for (const target of [this.engineArchive, this.modelPath]) {
      for (const candidate of [target, `${target}.part`]) {
        try { total += (await fsp.stat(candidate)).size; break; } catch { /* Not downloaded yet. */ }
      }
    }
    return total;
  }

  async ensureDiskSpace() {
    if (typeof fsp.statfs !== 'function') return;
    await fsp.mkdir(this.root, { recursive: true });
    const disk = await fsp.statfs(this.root);
    const free = Number(disk.bavail) * Number(disk.bsize);
    const already = await this.partialBytes();
    const required = Math.max(0, MODEL.size + ENGINE.size - already) + 700 * 1024 * 1024;
    if (free < required) {
      throw new Error(`Không đủ dung lượng. Milim cần thêm khoảng ${(required / 1024 ** 3).toFixed(1)} GB để tải và giải nén model.`);
    }
  }

  async download() {
    if (this.downloadPromise) return this.downloadPromise;
    this.controller = new AbortController();
    this.downloadPromise = this.performDownload(this.controller.signal)
      .catch((error) => {
        const paused = error?.name === 'AbortError';
        this.emit({ state: paused ? 'paused' : 'error', message: cleanError(error) });
        if (!paused) throw error;
        return this.current;
      })
      .finally(() => {
        this.controller = null;
        this.downloadPromise = null;
      });
    return this.downloadPromise;
  }

  pauseDownload() {
    this.controller?.abort();
    return this.current;
  }

  async performDownload(signal) {
    await this.ensureDiskSpace();
    await fsp.mkdir(path.dirname(this.engineArchive), { recursive: true });
    await fsp.mkdir(this.modelDir, { recursive: true });

    let baseBytes = 0;
    if (!(await this.enginePath())) {
      this.emit({ state: 'downloading', phase: 'engine', message: 'Đang tải bộ máy AI cục bộ…' });
      if (!(await this.validInstalledFile(this.engineArchive, ENGINE.size))) {
        await this.downloadFile(ENGINE, this.engineArchive, signal, (received) => {
          this.publishDownloadProgress(received, MODEL.size + ENGINE.size, 'Đang tải bộ máy AI cục bộ…');
        });
      }
      this.emit({ state: 'verifying', phase: 'engine', message: 'Đang kiểm tra bộ máy AI…' });
      await this.verifyFile(this.engineArchive, ENGINE, signal);
      this.emit({ state: 'extracting', phase: 'engine', message: 'Đang cài bộ máy AI trong vùng dữ liệu riêng…' });
      await this.extractEngine();
    }
    baseBytes = ENGINE.size;

    if (!(await this.modelVerified())) {
      this.emit({ state: 'downloading', phase: 'model', message: `Đang tải ${MODEL.name}…` });
      if (!(await this.validInstalledFile(this.modelPath, MODEL.size))) {
        await this.downloadFile(MODEL, this.modelPath, signal, (received) => {
          this.publishDownloadProgress(baseBytes + received, MODEL.size + ENGINE.size, `Đang tải ${MODEL.name}…`);
        });
      }
      this.emit({ state: 'verifying', phase: 'model', message: 'Đang xác minh model bằng SHA-256…' });
      await this.verifyFile(this.modelPath, MODEL, signal, (ratio) => {
        this.emit({ state: 'verifying', phase: 'model', percent: Math.round(ratio * 100), message: `Đang xác minh model · ${Math.round(ratio * 100)}%` });
      });
      await fsp.writeFile(this.modelMarker, `${MODEL.sha256}\n`, 'utf8');
    }

    this.emit({
      state: 'ready',
      phase: '',
      percent: 100,
      bytesReceived: MODEL.size + ENGINE.size,
      message: 'AI cục bộ đã sẵn sàng. Từ giờ bạn có thể học offline.'
    });
    return this.current;
  }

  publishDownloadProgress(received, total, message) {
    const percent = Math.max(0, Math.min(99, Math.floor((received / total) * 100)));
    this.emit({ state: 'downloading', percent, bytesReceived: received, bytesTotal: total, message: `${message} · ${percent}%` });
  }

  async downloadFile(meta, destination, signal, onProgress) {
    const partial = `${destination}.part`;
    let offset = 0;
    try { offset = (await fsp.stat(partial)).size; } catch { /* Start from zero. */ }
    if (offset > meta.size) {
      await fsp.rm(partial, { force: true });
      offset = 0;
    }
    if (offset === meta.size) {
      await fsp.rm(destination, { force: true });
      await fsp.rename(partial, destination);
      onProgress(offset);
      return;
    }
    const sources = Array.isArray(meta.urls) && meta.urls.length ? meta.urls : [meta.url];
    const failures = [];
    for (const source of sources) {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          await this.downloadFromSource(meta, source, destination, partial, signal, onProgress);
          return;
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
          const host = new URL(source).hostname;
          const detail = error?.cause?.code || error?.cause?.message || error.message;
          failures.push(`${host}: ${detail}`);
          if (attempt < 2) {
            this.emit({ state: 'downloading', message: `Kết nối ${host} bị gián đoạn · đang thử lại…` });
            await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
          }
        }
      }
      const next = sources[sources.indexOf(source) + 1];
      if (next) this.emit({ state: 'downloading', message: `Nguồn chính không phản hồi · chuyển sang ${new URL(next).hostname}…` });
    }
    throw new Error(`Không thể kết nối máy chủ tải AI. ${failures.slice(-3).join(' · ')}. Hãy kiểm tra VPN/proxy hoặc thử lại sau.`);
  }

  async downloadFromSource(meta, source, destination, partial, signal, onProgress) {
    let offset = 0;
    try { offset = (await fsp.stat(partial)).size; } catch { /* Start from zero. */ }
    const headers = { 'User-Agent': 'milim-local-ai/1.0' };
    if (offset) headers.Range = `bytes=${offset}-`;
    const response = await fetch(source, { headers, signal, redirect: 'follow' });
    if (!response.ok && response.status !== 206) throw new Error(`Máy chủ tải model trả về lỗi ${response.status}.`);
    if (offset && response.status !== 206) {
      await fsp.rm(partial, { force: true });
      offset = 0;
    }
    const stream = fs.createWriteStream(partial, { flags: offset ? 'a' : 'w' });
    let received = offset;
    try {
      for await (const chunk of response.body) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        received += chunk.length;
        if (!stream.write(chunk)) await once(stream, 'drain');
        onProgress(received);
      }
      stream.end();
      await once(stream, 'finish');
    } catch (error) {
      stream.destroy();
      throw error;
    }
    if (received !== meta.size) throw new Error(`Tệp ${meta.filename} chưa tải đủ (${received}/${meta.size} byte).`);
    await fsp.rm(destination, { force: true });
    await fsp.rename(partial, destination);
  }

  async verifyFile(filePath, meta, signal, onProgress = () => {}) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const stat = await fsp.stat(filePath);
    if (stat.size !== meta.size) throw new Error(`Dung lượng ${meta.filename} không khớp với bản chính thức.`);
    const digest = await sha256(filePath, (ratio) => {
      onProgress(ratio);
    });
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (digest !== meta.sha256) {
      await fsp.rm(filePath, { force: true });
      throw new Error(`Checksum ${meta.filename} không hợp lệ. Tệp lỗi đã được xóa để bảo vệ ứng dụng.`);
    }
  }

  async extractEngine() {
    await fsp.rm(this.runtimeDir, { recursive: true, force: true });
    await fsp.mkdir(this.runtimeDir, { recursive: true });
    await extractZip(this.engineArchive, { dir: this.runtimeDir });
    if (!(await this.enginePath())) throw new Error('Không tìm thấy llama-server.exe sau khi giải nén.');
    await fsp.rm(this.engineArchive, { force: true });
  }

  async deleteAll() {
    await this.stop();
    this.pauseDownload();
    const resolvedRoot = path.resolve(this.root);
    const resolvedModel = path.resolve(this.modelPath);
    const resolvedRuntime = path.resolve(this.runtimeDir);
    if (!resolvedModel.startsWith(`${resolvedRoot}${path.sep}`) || !resolvedRuntime.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new Error('Đường dẫn AI cục bộ không an toàn.');
    }
    await fsp.rm(this.modelPath, { force: true });
    await fsp.rm(`${this.modelPath}.part`, { force: true });
    await fsp.rm(this.modelMarker, { force: true });
    await fsp.rm(this.engineArchive, { force: true });
    await fsp.rm(`${this.engineArchive}.part`, { force: true });
    await fsp.rm(this.runtimeDir, { recursive: true, force: true });
    return this.emit({ state: 'not-installed', phase: '', percent: 0, bytesReceived: 0, message: 'Đã xóa model và bộ máy AI cục bộ.' });
  }

  async start(options = {}) {
    if (this.smokeMode) return;
    if (this.process && this.port) return;
    const status = await this.status();
    if (status.state !== 'ready') throw new Error('AI cục bộ chưa được tải đầy đủ.');
    const enginePath = await this.enginePath();
    const mode = RESOURCE_MODES[options.resourceMode] || RESOURCE_MODES.balanced;
    const onBattery = Boolean(options.onBattery);
    const activeMode = onBattery ? RESOURCE_MODES.saver : mode;
    this.port = await freePort();
    this.lastLogs = '';
    this.emit({ state: 'loading', message: onBattery ? 'Đang nạp AI ở chế độ tiết kiệm pin…' : `Đang nạp AI · ${activeMode.label}…` });
    const args = [
      '--model', this.modelPath,
      '--host', '127.0.0.1',
      '--port', String(this.port),
      '--ctx-size', String(activeMode.context),
      '--threads', String(activeMode.threads),
      '--n-gpu-layers', String(activeMode.gpuLayers),
      '--parallel', '1',
      '--jinja',
      '--no-webui'
    ];
    this.process = spawn(enginePath, args, {
      cwd: path.dirname(enginePath),
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    });
    this.process.stderr.on('data', (chunk) => {
      this.lastLogs = `${this.lastLogs}${chunk.toString()}`.slice(-5000);
    });
    this.process.once('exit', (code) => {
      const wasActive = Boolean(this.port);
      this.process = null;
      this.port = 0;
      if (wasActive && code && code !== 0) {
        this.emit({ state: 'error', message: `AI cục bộ đã dừng bất ngờ. ${this.lastLogs.split('\n').filter(Boolean).slice(-1)[0] || ''}`.trim() });
      } else {
        this.emit({ state: 'ready', message: 'AI cục bộ đã được giải phóng khỏi bộ nhớ.' });
      }
    });
    await this.waitUntilReady();
    this.emit({ state: 'running', message: 'AI cục bộ đang hoạt động · dữ liệu không rời khỏi máy.' });
  }

  async waitUntilReady() {
    const started = Date.now();
    while (Date.now() - started < 120000) {
      if (!this.process || !this.port) throw new Error(`Không thể khởi động AI cục bộ. ${this.lastLogs.slice(-500)}`);
      try {
        const response = await fetch(`http://127.0.0.1:${this.port}/health`, { signal: AbortSignal.timeout(1500) });
        if (response.ok) return;
      } catch { /* Model is still loading. */ }
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    await this.stop();
    throw new Error('Model mất quá lâu để khởi động. Hãy thử chế độ Tiết kiệm hoặc đóng bớt ứng dụng.');
  }

  scheduleIdleStop(minutes = 5) {
    clearTimeout(this.idleTimer);
    const delay = Math.max(1, Math.min(30, Number(minutes) || 5)) * 60 * 1000;
    this.idleTimer = setTimeout(() => this.stop(), delay);
    this.idleTimer.unref?.();
  }

  complete(request) {
    const task = this.inferenceQueue.then(
      () => this.completeNow(request),
      () => this.completeNow(request)
    );
    this.inferenceQueue = task.catch(() => {});
    return task;
  }

  async completeNow({ system, user, resourceMode = 'balanced', idleMinutes = 5, onBattery = false, maxTokens = 900 }) {
    if (this.smokeMode) return '';
    await this.start({ resourceMode, onBattery });
    clearTimeout(this.idleTimer);
    this.emit({ state: 'generating', message: 'AI cục bộ đang suy nghĩ trên máy của bạn…' });
    try {
      const response = await fetch(`http://127.0.0.1:${this.port}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL.id,
          messages: [
            { role: 'system', content: `${system}\nTrả lời trực tiếp, không trình bày suy luận. /no_think` },
            { role: 'user', content: user }
          ],
          temperature: 0.2,
          top_p: 0.8,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' }
        }),
        signal: AbortSignal.timeout(90000)
      });
      if (!response.ok) throw new Error(`AI cục bộ trả về lỗi ${response.status}.`);
      const body = await response.json();
      const content = String(body.choices?.[0]?.message?.content || '').trim();
      if (!content) throw new Error('AI cục bộ chưa trả về nội dung.');
      this.emit({ state: 'running', message: 'AI cục bộ đang hoạt động · dữ liệu không rời khỏi máy.' });
      return content;
    } finally {
      this.scheduleIdleStop(idleMinutes);
    }
  }

  async stop() {
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
    if (!this.process) return this.status();
    const child = this.process;
    this.process = null;
    this.port = 0;
    child.kill();
    return this.emit({ state: 'ready', message: 'AI cục bộ đã được giải phóng khỏi bộ nhớ.' });
  }
}

module.exports = { LocalAIManager, MODEL, ENGINE, RESOURCE_MODES, sha256 };
