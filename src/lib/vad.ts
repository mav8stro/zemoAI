import { getMic } from './audio';
export type VadHandlers = {
    onStart: () => void;
    onEnd: (audio: Blob, ms: number) => void;
    onLevel: (v: number) => void;
    onError: (message: string) => void;
};
export type Vad = {
    stop: () => void;
    setGuard: (on: boolean) => void;
    live: () => boolean;
    meter: () => {
        energy: number;
        floor: number;
        threshold: number;
        speaking: boolean;
    };
};
const TRIGGER_OVER_FLOOR = 2.6;
const GUARD_BOOST = 2.4;
const RELEASE_RATIO = 0.6;
const START_MS = 110;
const SILENCE_MS = 650;
const MAX_MS = 20000;
const FLOOR_UP = 0.0008;
const FLOOR_DOWN = 0.02;
function pickMime(): string {
    const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
    ];
    for (const m of candidates) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
            return m;
        }
    }
    return '';
}
export async function startVad(h: VadHandlers): Promise<Vad> {
    let stream: MediaStream;
    try {
        stream = await getMic();
    }
    catch (err) {
        h.onError(err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Microphone access denied — voice input is unavailable.'
            : 'No microphone available.');
        return { stop: () => { }, setGuard: () => { }, live: () => false, meter: () => ({ energy: 0, floor: 0, threshold: 0, speaking: false }) };
    }
    if (typeof MediaRecorder === 'undefined') {
        h.onError('This browser cannot record audio — voice input is unavailable.');
        return { stop: () => { }, setGuard: () => { }, live: () => false, meter: () => ({ energy: 0, floor: 0, threshold: 0, speaking: false }) };
    }
    const mime = pickMime();
    const ctx = new AudioContext();
    void ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.35;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let stopped = false;
    let guard = false;
    let floor = 0.01;
    let smoothEnergy = 0;
    let threshold = 0;
    let recorder: MediaRecorder | null = null;
    let parts: Blob[] = [];
    let armedAt = 0;
    let speaking = false;
    let speechStartedAt = 0;
    let lastLoud = 0;
    let raf = 0;
    const rms = (): number => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++)
            sum += buf[i] * buf[i];
        return Math.sqrt(sum / buf.length);
    };
    const startRecorder = () => {
        parts = [];
        try {
            recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        }
        catch {
            recorder = new MediaRecorder(stream);
        }
        recorder.ondataavailable = (e) => {
            if (e.data && e.data.size)
                parts.push(e.data);
        };
        recorder.start();
    };
    const discardRecorder = () => {
        if (!recorder)
            return;
        try {
            recorder.ondataavailable = null;
            if (recorder.state !== 'inactive')
                recorder.stop();
        }
        catch {
        }
        recorder = null;
        parts = [];
    };
    const endSegment = () => {
        const rec = recorder;
        const startedAt = speechStartedAt;
        speaking = false;
        speechStartedAt = 0;
        if (!rec)
            return;
        recorder = null;
        const finalise = () => {
            const type = rec.mimeType || mime || 'audio/webm';
            const blob = new Blob(parts, { type });
            parts = [];
            const ms = startedAt ? performance.now() - startedAt : 0;
            h.onEnd(blob, ms);
        };
        rec.onstop = finalise;
        try {
            if (rec.state !== 'inactive')
                rec.stop();
            else
                finalise();
        }
        catch {
            finalise();
        }
    };
    const tick = () => {
        if (stopped)
            return;
        raf = requestAnimationFrame(tick);
        const energy = rms();
        smoothEnergy += (energy - smoothEnergy) * 0.5;
        h.onLevel(Math.min(1, smoothEnergy * 12));
        if (!speaking && armedAt === 0) {
            const rate = smoothEnergy > floor ? FLOOR_UP : FLOOR_DOWN;
            floor += (smoothEnergy - floor) * rate;
            floor = Math.max(floor, 0.0015);
        }
        threshold = floor * TRIGGER_OVER_FLOOR * (guard ? GUARD_BOOST : 1);
        const release = threshold * RELEASE_RATIO;
        const now = performance.now();
        if (!speaking) {
            if (smoothEnergy > threshold) {
                if (armedAt === 0) {
                    armedAt = now;
                    startRecorder();
                }
                else if (now - armedAt >= START_MS) {
                    speaking = true;
                    speechStartedAt = armedAt;
                    lastLoud = now;
                    h.onStart();
                }
            }
            else if (armedAt !== 0) {
                armedAt = 0;
                discardRecorder();
            }
        }
        else {
            if (smoothEnergy > release)
                lastLoud = now;
            const quietFor = now - lastLoud;
            const runFor = now - speechStartedAt;
            if (quietFor >= SILENCE_MS || runFor >= MAX_MS) {
                armedAt = 0;
                endSegment();
            }
        }
    };
    tick();
    return {
        stop: () => {
            stopped = true;
            cancelAnimationFrame(raf);
            discardRecorder();
            try {
                source.disconnect();
                void ctx.close();
            }
            catch {
            }
        },
        setGuard: (on) => {
            guard = on;
        },
        live: () => !stopped,
        meter: () => ({ energy: smoothEnergy, floor, threshold, speaking }),
    };
}
