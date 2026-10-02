type Cue = 'boot' | 'wake' | 'listen' | 'tool' | 'done' | 'error';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const samples = new Map<Cue, AudioBuffer>();
let ambient: {
    source: AudioBufferSourceNode;
    gain: GainNode;
} | null = null;
let volume = 0.5;
let ducked = false;
const DUCK = 0.45;
function audio(): AudioContext {
    if (!ctx) {
        ctx = new AudioContext();
        master = ctx.createGain();
        master.gain.value = volume;
        master.connect(ctx.destination);
    }
    return ctx;
}
function rampTo(param: AudioParam, to: number, seconds: number) {
    if (!ctx)
        return;
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(Math.max(0.0001, to), now + seconds);
}
export async function unlockAudio(): Promise<void> {
    const c = audio();
    if (c.state === 'suspended') {
        try {
            await c.resume();
        }
        catch {
        }
    }
    void loadOverrides();
}
async function loadOverrides() {
    const cues: Cue[] = ['boot', 'wake', 'listen', 'tool', 'done', 'error'];
    await Promise.all(cues.map(async (cue) => {
        if (samples.has(cue))
            return;
        try {
            const res = await fetch(`/audio/${cue}.mp3`);
            if (!res.ok)
                return;
            const buf = await audio().decodeAudioData(await res.arrayBuffer());
            samples.set(cue, buf);
        }
        catch {
        }
    }));
}
export function setVolume(v: number) {
    volume = Math.max(0, Math.min(1, v));
    if (master)
        rampTo(master.gain, ducked ? volume * DUCK : volume, 0.05);
}
function blip(freq: number, { at = 0, dur = 0.12, type = 'sine' as OscillatorType, gain = 0.25, sweepTo = 0, } = {}) {
    const c = audio();
    const t = c.currentTime + at;
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo)
        osc.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
}
function noise({ at = 0, dur = 0.4, gain = 0.12, from = 400, to = 6000 } = {}) {
    const c = audio();
    const t = c.currentTime + at;
    const frames = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, frames, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++)
        data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + dur * 0.25);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(env).connect(master!);
    src.start(t);
}
const synth: Record<Cue, () => void> = {
    boot: () => {
        noise({ dur: 2.2, gain: 0.1, from: 120, to: 5200 });
        blip(110, { dur: 2.4, type: 'sawtooth', gain: 0.1, sweepTo: 880 });
        blip(220, { at: 0.1, dur: 2.2, type: 'sine', gain: 0.09, sweepTo: 1320 });
        blip(880, { at: 1.9, dur: 0.3, gain: 0.18 });
        blip(1320, { at: 2.05, dur: 0.45, gain: 0.2 });
    },
    wake: () => {
        blip(1046, { dur: 0.09, gain: 0.22 });
        blip(1568, { at: 0.07, dur: 0.14, gain: 0.2 });
    },
    listen: () => blip(660, { dur: 0.1, gain: 0.14 }),
    tool: () => {
        blip(2200, { dur: 0.05, type: 'square', gain: 0.07 });
        noise({ dur: 0.1, gain: 0.05, from: 3000, to: 900 });
    },
    done: () => {
        blip(1320, { dur: 0.1, gain: 0.14 });
        blip(880, { at: 0.08, dur: 0.2, gain: 0.13 });
    },
    error: () => {
        blip(320, { dur: 0.18, type: 'square', gain: 0.14 });
        blip(226, { at: 0.13, dur: 0.3, type: 'square', gain: 0.12 });
    },
};
export function play(cue: Cue) {
    if (!ctx || ctx.state !== 'running')
        return;
    const sample = samples.get(cue);
    if (sample) {
        const src = ctx.createBufferSource();
        src.buffer = sample;
        src.connect(master!);
        src.start();
        return;
    }
    synth[cue]();
}
const BED = 0.05;
export function startAmbient() {
    if (ambient || !ctx || ctx.state !== 'running')
        return;
    const c = ctx;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(master!);
    const frames = c.sampleRate * 4;
    const buf = c.createBuffer(1, frames, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) {
        const t = i / c.sampleRate;
        data[i] =
            (Math.sin(2 * Math.PI * 55 * t) * 0.5 +
                Math.sin(2 * Math.PI * 55.6 * t) * 0.5 +
                (Math.random() * 2 - 1) * 0.06) *
                0.5;
    }
    const source = c.createBufferSource();
    source.buffer = buf;
    source.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    source.connect(lp).connect(gain);
    source.start();
    ambient = { source, gain };
    rampTo(gain.gain, BED, 3);
}
export function stopAmbient() {
    if (!ambient || !ctx)
        return;
    const { source, gain } = ambient;
    ambient = null;
    rampTo(gain.gain, 0, 0.6);
    setTimeout(() => {
        source.stop();
        source.disconnect();
        gain.disconnect();
    }, 800);
}
export function duck(on: boolean) {
    if (ducked === on || !master)
        return;
    ducked = on;
    rampTo(master.gain, on ? volume * DUCK : volume, on ? 0.12 : 0.5);
}
