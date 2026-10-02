const BUFFER_FPS = 6;
const BUFFER_SECONDS = 10;
const CELL_W = 426;
const CELL_H = 240;
let stream: MediaStream | null = null;
let video: HTMLVideoElement | null = null;
let holders = 0;
export const diag = {
    open: false,
    holders: 0,
    buffered: 0,
    lastError: '',
};
if (typeof window !== 'undefined') {
    ;
    (window as unknown as Record<string, unknown>).__camera = diag;
}
export async function holdCamera(): Promise<HTMLVideoElement> {
    holders++;
    diag.holders = holders;
    if (video && stream)
        return video;
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720, facingMode: 'user' },
        });
        const el = document.createElement('video');
        el.autoplay = true;
        el.playsInline = true;
        el.muted = true;
        el.srcObject = stream;
        await el.play();
        video = el;
        diag.open = true;
        diag.lastError = '';
        return el;
    }
    catch (err) {
        holders = Math.max(0, holders - 1);
        diag.holders = holders;
        diag.lastError = String((err as Error)?.message ?? err);
        throw err;
    }
}
export function releaseCamera(): void {
    holders = Math.max(0, holders - 1);
    diag.holders = holders;
    if (holders > 0)
        return;
    stopBuffer();
    if (video) {
        video.pause();
        video.srcObject = null;
        video = null;
    }
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    diag.open = false;
}
export const cameraLive = () => Boolean(video && stream);
export const cameraStream = () => stream;
function drawTo(canvas: HTMLCanvasElement, w: number, h: number) {
    const ctx = canvas.getContext('2d');
    if (!ctx || !video)
        return null;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    return ctx;
}
const toJpeg = (canvas: HTMLCanvasElement, q = 0.82) => {
    const url = canvas.toDataURL('image/jpeg', q);
    return { data: url.slice(url.indexOf(',') + 1), mimeType: 'image/jpeg' };
};
export function grabFrame(): {
    data: string;
    mimeType: string;
} {
    if (!video?.videoWidth)
        throw new Error('the camera is not ready');
    const canvas = document.createElement('canvas');
    if (!drawTo(canvas, video.videoWidth, video.videoHeight)) {
        throw new Error('could not read the camera frame');
    }
    return toJpeg(canvas);
}
type Shot = {
    at: number;
    bitmap: HTMLCanvasElement;
};
let buffer: Shot[] = [];
let bufferTimer: ReturnType<typeof setInterval> | null = null;
export function startBuffer(): void {
    if (bufferTimer)
        return;
    bufferTimer = setInterval(() => {
        if (!video?.videoWidth)
            return;
        const cell = document.createElement('canvas');
        if (!drawTo(cell, CELL_W, CELL_H))
            return;
        buffer.push({ at: performance.now(), bitmap: cell });
        const cutoff = performance.now() - BUFFER_SECONDS * 1000;
        while (buffer.length && buffer[0].at < cutoff)
            buffer.shift();
        diag.buffered = buffer.length;
    }, 1000 / BUFFER_FPS);
}
export function stopBuffer(): void {
    if (bufferTimer)
        clearInterval(bufferTimer);
    bufferTimer = null;
    buffer = [];
    diag.buffered = 0;
}
function contactSheet(shots: {
    at: number;
    bitmap: HTMLCanvasElement;
}[], originAt: number): {
    data: string;
    mimeType: string;
} {
    const n = shots.length;
    const cols = n <= 2 ? n : n <= 6 ? 3 : 4;
    const rows = Math.ceil(n / cols);
    const canvas = document.createElement('canvas');
    canvas.width = cols * CELL_W;
    canvas.height = rows * CELL_H;
    const ctx = canvas.getContext('2d');
    if (!ctx)
        throw new Error('could not build the grid');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    shots.forEach((shot, i) => {
        const x = (i % cols) * CELL_W;
        const y = Math.floor(i / cols) * CELL_H;
        ctx.drawImage(shot.bitmap, x, y, CELL_W, CELL_H);
        const label = `${i + 1}  ${((shot.at - originAt) / 1000).toFixed(1)}s`;
        ctx.font = '600 22px ui-monospace, monospace';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(label, x + 12, y + 30);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x + 12, y + 30);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, CELL_W - 1, CELL_H - 1);
    });
    return toJpeg(canvas, 0.78);
}
function sample<T>(items: T[], want: number): T[] {
    if (items.length <= want)
        return items;
    const out: T[] = [];
    for (let i = 0; i < want; i++) {
        out.push(items[Math.round((i * (items.length - 1)) / (want - 1))]);
    }
    return out;
}
export async function watchAhead(seconds: number, frames: number): Promise<{
    data: string;
    mimeType: string;
}> {
    if (!video?.videoWidth)
        throw new Error('the camera is not ready');
    const shots: Shot[] = [];
    const started = performance.now();
    const gap = (seconds * 1000) / Math.max(1, frames - 1);
    for (let i = 0; i < frames; i++) {
        const cell = document.createElement('canvas');
        if (drawTo(cell, CELL_W, CELL_H)) {
            shots.push({ at: performance.now(), bitmap: cell });
        }
        if (i < frames - 1)
            await new Promise((r) => setTimeout(r, gap));
    }
    if (!shots.length)
        throw new Error('no frames were captured');
    return contactSheet(shots, started);
}
export function recentGrid(seconds: number, frames: number): {
    data: string;
    mimeType: string;
} | null {
    const cutoff = performance.now() - seconds * 1000;
    const window = buffer.filter((s) => s.at >= cutoff);
    if (window.length < 2)
        return null;
    const picked = sample(window, frames);
    return contactSheet(picked, picked[0].at);
}
export const bufferedSeconds = () => buffer.length < 2 ? 0 : (buffer[buffer.length - 1].at - buffer[0].at) / 1000;
