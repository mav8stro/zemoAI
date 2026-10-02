import { env, USE_ELEVENLABS, BACKEND, TTS_ENGINE, KOKORO_VOICE, BRIDGE_HTTP_URL, withToken, } from '../config';
import * as kokoro from './kokoro';
import { caps } from './capabilities';
type Speaker = {
    push: (delta: string) => void;
    say: (text: string) => void;
    end: () => Promise<void>;
    cancel: () => void;
    level: () => number;
};
let speaking = '';
let recent = '';
let recentUntil = 0;
const ECHO_TAIL_MS = 1800;
export const diag = {
    engine: 'system' as 'system' | 'kokoro' | 'elevenlabs',
    spoken: 0,
    started: 0,
    failures: 0,
    lastError: '',
    nativeBroken: false,
    rescued: 0,
    voice: '',
    lastText: '',
};
if (typeof window !== 'undefined') {
    ;
    (window as unknown as Record<string, unknown>).__tts = diag;
}
let nativeBroken = false;
let speakingAt = 0;
export function speakingSince(): number {
    return speaking ? speakingAt : 0;
}
function setSpeaking(text: string) {
    if (text) {
        speaking = text;
        speakingAt = Date.now();
        return;
    }
    if (speaking) {
        recent = speaking;
        recentUntil = Date.now() + ECHO_TAIL_MS;
    }
    speaking = '';
}
export function speakingNow(): string {
    const tail = Date.now() < recentUntil ? recent : '';
    return `${speaking} ${tail}`.trim();
}
const SENTENCE_END = /([.!?]["'')\]”’]?\s)|(\n\n)/;
const ABBREVIATION = /(?:^|\s)(mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|approx|inc|ltd|co|no|vol|fig|dept|est|min|max|hr|hrs|a\.m|p\.m|u\.s|u\.k|no)\.$/i;
const MAX_UNSPOKEN = 220;
const VOICE_PREF_KEY = 'zimo.voice';
function score(v: SpeechSynthesisVoice): number {
    const n = v.name.toLowerCase();
    let s = 0;
    if (n.startsWith('daniel'))
        s += 100;
    else if (n.includes('google uk english male'))
        s += 85;
    else if (/\b(oliver|arthur|jamie|malcolm)\b/.test(n))
        s += 80;
    else if (/\b(reed|rocko|eddy)\b/.test(n))
        s += 40;
    if (n.includes('premium'))
        s += 30;
    else if (n.includes('enhanced'))
        s += 20;
    if (/en[-_]gb/i.test(v.lang))
        s += 25;
    else if (/^en/i.test(v.lang))
        s += 5;
    if (/grandma|grandpa|bubbles|jester|bells|boing|whisper|zarvox|superstar|trinoids|wobble|bahh|organ|cellos|bad news|good news/.test(n)) {
        s -= 200;
    }
    if (/\b(flo|sandy|shelley|kate|serena|fiona|moira|karen|tessa|samantha|zoe|allison|ava|susan)\b/.test(n)) {
        s -= 60;
    }
    return s;
}
const USABLE = 40;
export function candidateVoices(): SpeechSynthesisVoice[] {
    return speechSynthesis
        .getVoices()
        .filter((v) => /^en/i.test(v.lang))
        .map((v) => ({ v, s: score(v) }))
        .filter((x) => x.s >= USABLE)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.v);
}
let cachedVoice: SpeechSynthesisVoice | null | undefined;
function pickVoice(): SpeechSynthesisVoice | null {
    if (cachedVoice !== undefined)
        return cachedVoice;
    const all = speechSynthesis.getVoices();
    if (!all.length)
        return null;
    const saved = localStorage.getItem(VOICE_PREF_KEY);
    if (saved) {
        const hit = all.find((v) => v.name === saved);
        if (hit)
            return (cachedVoice = hit);
        localStorage.removeItem(VOICE_PREF_KEY);
    }
    cachedVoice = candidateVoices()[0] ?? all.find((v) => /^en/i.test(v.lang)) ?? null;
    return cachedVoice;
}
export function currentVoiceName(): string {
    if (USE_ELEVENLABS || caps().tts)
        return 'ElevenLabs';
    if (TTS_ENGINE === 'kokoro' && !kokoro.isUnavailable()) {
        return KOKORO_VOICE.replace(/^bm_/, '');
    }
    return pickVoice()?.name ?? 'default';
}
export function cycleVoice(): string {
    const list = candidateVoices();
    if (!list.length)
        return 'default';
    const now = pickVoice();
    const i = list.findIndex((v) => v.name === now?.name);
    const next = list[(i + 1) % list.length];
    localStorage.setItem(VOICE_PREF_KEY, next.name);
    cachedVoice = next;
    return next.name;
}
if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.addEventListener('voiceschanged', () => {
        cachedVoice = undefined;
        pickVoice();
    });
    pickVoice();
}
let outCtx: AudioContext | null = null;
function outputContext(): AudioContext | null {
    try {
        if (!outCtx)
            outCtx = new AudioContext();
        if (outCtx.state === 'suspended')
            void outCtx.resume();
        return outCtx;
    }
    catch {
        return null;
    }
}
function shape(text: string): string {
    return (text
        .replace(/^\s*Sources?:.*$/gim, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/https?:\/\/[^\s]*[^\s.,;:!?)\]]/g, '')
        .replace(/[*_`#>]+/g, '')
        .replace(/^\s*[-•]\s+/gm, '')
        .replace(/([^,\s])\s+(sir)(\s*[.,!?;:]|\s*$)/gi, '$1, $2$3')
        .replace(/\s+/g, ' ')
        .trim());
}
type Item = {
    text: string;
    audio?: Promise<string | null> | null;
};
export function createSpeaker(): Speaker {
    const queue: Item[] = [];
    let buffer = '';
    let cancelled = false;
    let outLevel = 0;
    let pumping = false;
    let currentAudio: HTMLAudioElement | null = null;
    let nativeInFlight = false;
    let drained: Array<() => void> = [];
    const settleDrained = () => {
        const waiting = drained;
        drained = [];
        for (const r of waiting)
            r();
    };
    const enqueue = (sentence: string, priority = false) => {
        if (cancelled)
            return;
        const text = shape(sentence);
        if (!text)
            return;
        const item: Item = { text };
        if (priority) {
            queue.unshift(item);
        }
        else {
            queue.push(item);
        }
        void pump();
    };
    function synthesise(text: string): Promise<string | null> | null {
        if (USE_ELEVENLABS || caps().tts || nativeBroken) {
            diag.engine = 'elevenlabs';
            return fetchCloudAudio(text).catch(() => null);
        }
        if (TTS_ENGINE === 'kokoro' && !kokoro.isUnavailable()) {
            diag.engine = 'kokoro';
            return kokoro.speak(text).catch(() => null);
        }
        diag.engine = 'system';
        return null;
    }
    const prime = (item: Item | undefined) => {
        if (item && item.audio === undefined)
            item.audio = synthesise(item.text);
    };
    async function pump(): Promise<void> {
        if (pumping)
            return;
        pumping = true;
        try {
            for (;;) {
                if (cancelled)
                    break;
                const item = queue.shift();
                if (!item)
                    break;
                prime(item);
                prime(queue[0]);
                await speakOne(item);
            }
        }
        finally {
            pumping = false;
            if (cancelled || !queue.length)
                settleDrained();
        }
    }
    async function speakOne(item: Item): Promise<void> {
        if (cancelled)
            return;
        setSpeaking(item.text);
        try {
            const url = item.audio ? await item.audio : null;
            if (cancelled)
                return;
            if (url) {
                await playUrl(url, item.text);
                return;
            }
            const spoke = await speakNative(item.text);
            if (spoke || cancelled)
                return;
            if (!nativeBroken) {
                nativeBroken = true;
                diag.nativeBroken = true;
                diag.engine = 'elevenlabs';
                console.warn('[zimo] system voice is not producing sound — using the bridge speech proxy from here on');
            }
            const rescue = await fetchCloudAudio(item.text).catch(() => null);
            if (rescue && !cancelled) {
                diag.rescued++;
                await playUrl(rescue, item.text);
            }
        }
        finally {
            if (speaking === item.text)
                setSpeaking('');
        }
    }
    const speakNative = (text: string) => new Promise<boolean>((resolve) => {
        speechSynthesis.resume();
        const u = new SpeechSynthesisUtterance(text);
        const voice = pickVoice();
        if (voice)
            u.voice = voice;
        u.lang = voice?.lang ?? 'en-GB';
        u.rate = 0.92;
        u.pitch = 0.95;
        let raf = 0;
        let t = 0;
        const tick = () => {
            t += 0.08;
            outLevel =
                0.35 +
                    Math.abs(Math.sin(t * 2.1)) * 0.3 +
                    Math.abs(Math.sin(t * 5.7)) * 0.2;
            raf = requestAnimationFrame(tick);
        };
        tick();
        let done = false;
        let started = false;
        let watchdog: ReturnType<typeof setTimeout> | null = null;
        let keepalive: ReturnType<typeof setInterval> | null = null;
        const finish = () => {
            if (done)
                return;
            done = true;
            nativeInFlight = false;
            if (watchdog)
                clearTimeout(watchdog);
            if (keepalive)
                clearInterval(keepalive);
            cancelAnimationFrame(raf);
            outLevel = 0.12;
            resolve(started);
        };
        u.onstart = () => {
            started = true;
            diag.started++;
            diag.lastError = '';
            if (watchdog)
                clearTimeout(watchdog);
            keepalive = setInterval(() => {
                if (done)
                    return;
                speechSynthesis.pause();
                speechSynthesis.resume();
            }, 5000);
        };
        u.onend = finish;
        u.onerror = (e) => {
            const code = String((e as SpeechSynthesisErrorEvent).error ?? 'unknown');
            diag.lastError = code;
            if (code !== 'interrupted' && code !== 'canceled') {
                diag.failures++;
                console.error(`[zimo] speech failed (${code}) on voice "${u.voice?.name ?? 'default'}"`);
            }
            finish();
        };
        watchdog = setTimeout(() => {
            if (done || started)
                return;
            console.warn('[zimo] speech did not start — un-wedging the engine');
            speechSynthesis.cancel();
            speechSynthesis.resume();
            try {
                speechSynthesis.speak(u);
            }
            catch {
                finish();
                return;
            }
            watchdog = setTimeout(() => {
                if (done || started)
                    return;
                console.error('[zimo] speech engine is not responding — switching to the cloud voice');
                diag.failures++;
                diag.lastError = diag.lastError || 'no-start';
                finish();
            }, 1500);
        }, 700);
        diag.spoken++;
        diag.lastText = text.slice(0, 60);
        diag.voice = u.voice?.name ?? 'default';
        nativeInFlight = true;
        speechSynthesis.speak(u);
    });
    const playUrl = (url: string, text: string) => new Promise<void>((resolve) => {
        const audio = new Audio(url);
        currentAudio = audio;
        diag.spoken++;
        diag.lastText = text.slice(0, 60);
        diag.voice = diag.engine === 'kokoro' ? KOKORO_VOICE : 'ElevenLabs';
        let read: (() => number) | null = null;
        const ctx = outputContext();
        if (ctx) {
            try {
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 256;
                ctx.createMediaElementSource(audio).connect(analyser);
                analyser.connect(ctx.destination);
                const bins = new Uint8Array(analyser.frequencyBinCount);
                read = () => {
                    analyser.getByteFrequencyData(bins as Uint8Array<ArrayBuffer>);
                    let sum = 0;
                    for (let i = 2; i < bins.length; i++)
                        sum += bins[i];
                    return Math.min(1, (sum / (bins.length - 2) / 255) * 3.5);
                };
            }
            catch {
            }
        }
        let raf = 0;
        const tick = () => {
            outLevel = read ? read() : 0.4;
            raf = requestAnimationFrame(tick);
        };
        tick();
        let done = false;
        const finish = () => {
            if (done)
                return;
            done = true;
            cancelAnimationFrame(raf);
            outLevel = 0.12;
            URL.revokeObjectURL(url);
            if (currentAudio === audio)
                currentAudio = null;
            resolve();
        };
        audio.onplaying = () => {
            diag.started++;
            diag.lastError = '';
        };
        audio.onended = finish;
        audio.onerror = () => {
            diag.failures++;
            diag.lastError = 'audio-element';
            finish();
        };
        audio.onpause = finish;
        void audio.play().catch((err) => {
            diag.failures++;
            diag.lastError = String((err as Error)?.name ?? 'play-rejected');
            finish();
        });
    });
    return {
        say(text) {
            enqueue(text, true);
        },
        push(delta) {
            if (cancelled)
                return;
            buffer += delta;
            for (;;) {
                const m = SENTENCE_END.exec(buffer);
                if (!m)
                    break;
                const cut = m.index + m[0].length;
                const candidate = buffer.slice(0, cut);
                if (ABBREVIATION.test(candidate.trimEnd())) {
                    const rest = buffer.slice(cut);
                    if (!SENTENCE_END.test(rest))
                        break;
                    const next = SENTENCE_END.exec(rest)!;
                    const wider = cut + next.index + next[0].length;
                    enqueue(buffer.slice(0, wider));
                    buffer = buffer.slice(wider);
                    continue;
                }
                enqueue(candidate);
                buffer = buffer.slice(cut);
            }
            if (buffer.length > MAX_UNSPOKEN) {
                const cut = buffer.lastIndexOf(' ', MAX_UNSPOKEN);
                if (cut > 40) {
                    enqueue(buffer.slice(0, cut));
                    buffer = buffer.slice(cut);
                }
            }
        },
        async end() {
            if (buffer.trim()) {
                enqueue(buffer);
                buffer = '';
            }
            if (cancelled)
                return;
            if (!pumping && !queue.length)
                return;
            await new Promise<void>((resolve) => drained.push(resolve));
        },
        cancel() {
            if (cancelled)
                return;
            cancelled = true;
            buffer = '';
            queue.length = 0;
            setSpeaking('');
            if (nativeInFlight) {
                nativeInFlight = false;
                speechSynthesis.cancel();
                speechSynthesis.resume();
            }
            if (currentAudio) {
                currentAudio.pause();
                currentAudio = null;
            }
            outLevel = 0;
            settleDrained();
        },
        level: () => outLevel,
    };
}
async function fetchCloudAudio(text: string): Promise<string | null> {
    if (BACKEND === 'bridge') {
        try {
            const res = await fetch(withToken(`${BRIDGE_HTTP_URL}/tts`), {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ text }),
            });
            if (res.ok)
                return URL.createObjectURL(await res.blob());
        }
        catch {
        }
    }
    if (env.elevenKey) {
        try {
            const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${env.elevenVoiceId}/stream` +
                `?output_format=mp3_22050_32&optimize_streaming_latency=3`, {
                method: 'POST',
                headers: {
                    'xi-api-key': env.elevenKey,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    text,
                    model_id: 'eleven_flash_v2_5',
                    voice_settings: {
                        stability: 0.4,
                        similarity_boost: 0.75,
                        speed: 1.05,
                    },
                }),
            });
            if (res.ok)
                return URL.createObjectURL(await res.blob());
        }
        catch {
        }
    }
    return null;
}
