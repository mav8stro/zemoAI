import { getMic } from './audio';
const PEAK_OVER_FLOOR = 7;
const MIN_PEAK = 0.055;
const QUIET_BEFORE = 0.16;
const HISTORY = 20;
const LOOKBACK = 5;
const DECAY_TO = 0.35;
const DECAY_MS = 130;
const GIVE_UP_MS = 260;
const COOLDOWN_MS = 1200;
export type ClapListener = {
    stop: () => void;
};
export const diag = {
    listening: false,
    claps: 0,
    lastPeak: 0,
    rejected: '',
};
if (typeof window !== 'undefined') {
    ;
    (window as unknown as Record<string, unknown>).__clap = diag;
}
export async function listenForClap(onClap: () => void): Promise<ClapListener> {
    let stream: MediaStream;
    try {
        stream = await getMic();
    }
    catch {
        diag.rejected = 'microphone unavailable';
        return { stop: () => { } };
    }
    const ctx = new AudioContext();
    void ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const history: number[] = [];
    let floor = 0.01;
    let stopped = false;
    let raf = 0;
    let lastClap = 0;
    let candidate: {
        at: number;
        peak: number;
    } | null = null;
    const rms = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++)
            sum += buf[i] * buf[i];
        return Math.sqrt(sum / buf.length);
    };
    const tick = () => {
        if (stopped)
            return;
        raf = requestAnimationFrame(tick);
        const now = performance.now();
        const level = rms();
        history.push(level);
        if (history.length > HISTORY)
            history.shift();
        if (!candidate && level < floor * 3) {
            floor += (level - floor) * 0.05;
            floor = Math.max(floor, 0.002);
        }
        if (candidate) {
            if (level < candidate.peak * DECAY_TO && now - candidate.at < DECAY_MS) {
                candidate = null;
                lastClap = now;
                diag.claps++;
                diag.rejected = '';
                onClap();
            }
            else if (now - candidate.at > GIVE_UP_MS) {
                diag.rejected = 'too sustained to be a clap';
                candidate = null;
            }
            else {
                candidate.peak = Math.max(candidate.peak, level);
            }
            return;
        }
        if (now - lastClap < COOLDOWN_MS)
            return;
        if (level < MIN_PEAK || level < floor * PEAK_OVER_FLOOR)
            return;
        const before = history[history.length - 1 - LOOKBACK];
        if (before === undefined || before > level * QUIET_BEFORE) {
            diag.rejected = 'no silence before it';
            return;
        }
        diag.lastPeak = level;
        candidate = { at: now, peak: level };
    };
    tick();
    diag.listening = true;
    return {
        stop: () => {
            stopped = true;
            diag.listening = false;
            cancelAnimationFrame(raf);
            try {
                source.disconnect();
                void ctx.close();
            }
            catch {
            }
        },
    };
}
