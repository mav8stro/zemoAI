type Cue = 'boot-music' | 'ambient' | 'work';
type Track = {
    el: HTMLAudioElement;
    fade: number | null;
};
const tracks = new Map<Cue, Track>();
const missing = new Set<Cue>();
const finished = new Set<Cue>();
const ALL: Cue[] = ['boot-music', 'ambient', 'work'];
let enabled = false;
const LEVEL: Record<Cue, number> = {
    'boot-music': 0.85,
    ambient: 0.1,
    work: 0.11,
};
const want: Record<Cue, number> = { 'boot-music': 0, ambient: 0, work: 0 };
let ducked = false;
const DUCK = 0.35;
function track(cue: Cue): Track | null {
    if (!enabled || missing.has(cue))
        return null;
    let t = tracks.get(cue);
    if (!t) {
        const el = new Audio(`/audio/${cue}.mp3`);
        el.preload = 'auto';
        el.loop = cue === 'work';
        el.volume = 0;
        el.addEventListener('error', () => {
            tracks.delete(cue);
            missing.add(cue);
        }, { once: true });
        el.addEventListener('ended', () => {
            finished.add(cue);
            want[cue] = 0;
        }, { once: true });
        t = { el, fade: null };
        tracks.set(cue, t);
    }
    return t;
}
export function enable() {
    enabled = true;
    ALL.forEach(track);
}
function level(cue: Cue): number {
    return ducked && cue !== 'boot-music' ? want[cue] * DUCK : want[cue];
}
function fadeTo(cue: Cue, to: number, ms: number) {
    const t = track(cue);
    if (!t)
        return;
    if (t.fade !== null)
        cancelAnimationFrame(t.fade);
    const from = t.el.volume;
    const start = performance.now();
    const step = () => {
        const k = Math.min(1, (performance.now() - start) / ms);
        t.el.volume = from + (to - from) * k;
        if (k < 1)
            t.fade = requestAnimationFrame(step);
        else {
            t.fade = null;
            if (to === 0)
                t.el.pause();
        }
    };
    if (to > 0 && t.el.paused && !finished.has(cue))
        void t.el.play().catch(() => { });
    t.fade = requestAnimationFrame(step);
}
function set(cue: Cue, to: number, ms: number) {
    want[cue] = to;
    fadeTo(cue, level(cue), ms);
}
let dissolve: ReturnType<typeof setTimeout> | null = null;
export function playBoot() {
    const t = track('boot-music');
    if (!t)
        return;
    t.el.currentTime = 0;
    set('boot-music', LEVEL['boot-music'], 120);
    if (dissolve)
        clearTimeout(dissolve);
    const arm = () => {
        const secs = Number.isFinite(t.el.duration) && t.el.duration > 1 ? t.el.duration : 17;
        const at = Math.max(500, (secs - 2.6) * 1000);
        dissolve = setTimeout(() => {
            dissolve = null;
            set('boot-music', 0, 2500);
        }, at);
    };
    if (t.el.readyState >= 1)
        arm();
    else
        t.el.addEventListener('loadedmetadata', arm, { once: true });
}
export function startAmbient() {
    const t = track('ambient');
    if (!t)
        return;
    finished.delete('ambient');
    t.el.currentTime = 0;
    set('ambient', LEVEL.ambient, 900);
}
export function stopAll() {
    if (dissolve) {
        clearTimeout(dissolve);
        dissolve = null;
    }
    ALL.forEach((c) => {
        want[c] = 0;
        if (tracks.has(c))
            fadeTo(c, 0, 600);
    });
}
export function working(on: boolean) {
    set('work', on ? LEVEL.work : 0, on ? 900 : 1400);
}
export function duck(on: boolean) {
    if (ducked === on)
        return;
    ducked = on;
    (['ambient', 'work'] as Cue[]).forEach((c) => {
        if (tracks.has(c))
            fadeTo(c, level(c), on ? 250 : 900);
    });
}
