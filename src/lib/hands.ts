import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { OneEuroPoint } from './oneEuro';
import { holdCamera, releaseCamera } from './camera';
const WASM_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/mediapipe`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
export const WRIST = 0;
const THUMB_MCP = 2;
export const THUMB_TIP = 4;
const INDEX_PIP = 6;
export const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_PIP = 10;
const MIDDLE_TIP = 12;
const RING_PIP = 14;
const RING_TIP = 16;
const PINKY_PIP = 18;
const PINKY_TIP = 20;
export const BONES: readonly [
    number,
    number
][] = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [9, 10], [10, 11], [11, 12],
    [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20],
    [5, 9], [9, 13], [13, 17],
];
export const TIPS = [THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP];
const CURSOR_MIN_CUTOFF = 1.1;
const CURSOR_BETA = 0.012;
const SKELETON_MIN_CUTOFF = 2.4;
const SKELETON_BETA = 0.02;
const PINCH_ON = 0.40;
const PINCH_OFF = 0.60;
const EXTEND_RATIO = 1.12;
const GESTURE_HOLD_MS = 200;
const PINCH_CONFIRM_MS = 70;
const POSE_SETTLE_MS = 220;
const CLICK_SLOP = 20;
const AIM_LAG_MS = 190;
const TRAIL_MS = 500;
export type Gesture = 'point' | 'pinch' | 'frame' | 'open' | 'fist' | 'peace' | 'none';
export type Side = 'left' | 'right';
const SWAP_HANDEDNESS = false;
const MAX_JUMP_FRACTION = 0.28;
function slotFor(side: Side, wrist: {
    x: number;
    y: number;
}, taken: Set<number>, reach: number): number {
    let best = -1;
    let bestDist = Infinity;
    for (const h of hands) {
        if (taken.has(h.id) || !h.points?.[WRIST])
            continue;
        const d = Math.hypot(h.points[WRIST].x - wrist.x, h.points[WRIST].y - wrist.y);
        if (d < bestDist) {
            bestDist = d;
            best = h.id;
        }
    }
    if (best !== -1 && bestDist < reach * MAX_JUMP_FRACTION)
        return best;
    const want = side === 'right' ? 1 : 0;
    if (!taken.has(want))
        return want;
    return want === 1 ? 0 : 1;
}
const sideVote = new Map<number, number>();
function votedSide(id: number, saw: Side): Side {
    const prev = sideVote.get(id) ?? 0;
    const next = Math.max(-6, Math.min(6, prev + (saw === 'right' ? 1 : -1)));
    sideVote.set(id, next);
    return next >= 0 ? 'right' : 'left';
}
export type Hand = {
    id: number;
    points: {
        x: number;
        y: number;
    }[];
    x: number;
    y: number;
    aimX: number;
    aimY: number;
    pinched: boolean;
    closeness: number;
    gesture: Gesture;
    fingers: {
        thumb: boolean;
        index: boolean;
        middle: boolean;
        ring: boolean;
        pinky: boolean;
    };
    handedness: Side;
    span: number;
};
export const hands: Hand[] = [];
export const diag = {
    enabled: false,
    loading: false,
    ready: false,
    count: 0,
    fps: 0,
    gesture: '' as string,
    lastError: '',
};
if (typeof window !== 'undefined') {
    ;
    (window as unknown as Record<string, unknown>).__hands = diag;
}
let landmarker: HandLandmarker | null = null;
let video: HTMLVideoElement | null = null;
let running = false;
let generation = 0;
let frames = 0;
let fpsAt = 0;
let stamp = 0;
type Filters = {
    cursor: OneEuroPoint;
    joints: OneEuroPoint[];
};
const filters = new Map<number, Filters>();
const trails = new Map<number, {
    x: number;
    y: number;
    at: number;
}[]>();
const pinchSince = new Map<number, number>();
const poseChangedAt = new Map<number, number>();
function filtersFor(id: number): Filters {
    let f = filters.get(id);
    if (!f) {
        f = {
            cursor: new OneEuroPoint(CURSOR_MIN_CUTOFF, CURSOR_BETA),
            joints: Array.from({ length: 21 }, () => new OneEuroPoint(SKELETON_MIN_CUTOFF, SKELETON_BETA)),
        };
        filters.set(id, f);
    }
    return f;
}
let patched = false;
function patchPointerCapture() {
    if (patched || typeof Element === 'undefined')
        return;
    patched = true;
    const capture = Element.prototype.setPointerCapture;
    const release = Element.prototype.releasePointerCapture;
    Element.prototype.setPointerCapture = function (id: number) {
        try {
            return capture.call(this, id);
        }
        catch {
        }
    };
    Element.prototype.releasePointerCapture = function (id: number) {
        try {
            return release.call(this, id);
        }
        catch {
        }
    };
}
type Press = {
    captured: Element | null;
    wasPinched: boolean;
    downX: number;
    downY: number;
};
const presses = new Map<number, Press>();
function fire(el: Element | null, type: string, h: Hand, pressed: boolean, at?: {
    x: number;
    y: number;
}) {
    if (!el)
        return;
    const px = at?.x ?? h.x;
    const py = at?.y ?? h.y;
    el.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: px,
        clientY: py,
        pointerId: 9000 + h.id,
        pointerType: 'touch',
        isPrimary: h.id === 0,
        button: 0,
        buttons: pressed ? 1 : 0,
        width: 1,
        height: 1,
        pressure: pressed ? 0.5 : 0,
    }));
}
function emit(h: Hand) {
    let p = presses.get(h.id);
    if (!p) {
        p = { captured: null, wasPinched: false, downX: h.x, downY: h.y };
        presses.set(h.id, p);
    }
    const over = document.elementFromPoint(h.x, h.y);
    if (h.pinched && !p.wasPinched) {
        const aim = { x: h.aimX, y: h.aimY };
        const target = document.elementFromPoint(aim.x, aim.y) ?? over;
        p.captured = target;
        p.downX = aim.x;
        p.downY = aim.y;
        fire(target, 'pointerdown', h, true, aim);
    }
    else if (!h.pinched && p.wasPinched) {
        const target = p.captured ?? over;
        fire(target, 'pointerup', h, false);
        const travelled = Math.hypot(h.x - p.downX, h.y - p.downY);
        if (target && travelled < CLICK_SLOP && target === over) {
            target.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                composed: true,
                clientX: h.x,
                clientY: h.y,
            }));
        }
        p.captured = null;
    }
    else {
        fire(h.pinched ? (p.captured ?? over) : over, 'pointermove', h, h.pinched);
    }
    p.wasPinched = h.pinched;
}
function releasePress(id: number, at: {
    x: number;
    y: number;
}) {
    const p = presses.get(id);
    if (!p?.wasPinched)
        return;
    const ghost = { id, x: at.x, y: at.y } as Hand;
    fire(p.captured, 'pointerup', ghost, false);
    fire(p.captured, 'pointercancel', ghost, false);
    p.wasPinched = false;
    p.captured = null;
}
const dist = (a: {
    x: number;
    y: number;
}, b: {
    x: number;
    y: number;
}) => Math.hypot(a.x - b.x, a.y - b.y);
function isExtended(marks: {
    x: number;
    y: number;
}[], tip: number, pip: number): boolean {
    const wrist = marks[WRIST];
    return dist(marks[tip], wrist) > dist(marks[pip], wrist) * EXTEND_RATIO;
}
const settling = new Map<number, {
    raw: Gesture;
    since: number;
    held: Gesture;
}>();
function stableGesture(id: number, raw: Gesture, now: number): Gesture {
    if (raw === 'pinch') {
        settling.set(id, { raw, since: now, held: raw });
        return raw;
    }
    const s = settling.get(id);
    if (!s || s.raw !== raw) {
        settling.set(id, { raw, since: now, held: s?.held === 'pinch' ? 'none' : (s?.held ?? 'none') });
        return settling.get(id)!.held;
    }
    if (now - s.since >= GESTURE_HOLD_MS)
        s.held = raw;
    return s.held;
}
function classify(fingers: Hand['fingers'], pinched: boolean): Gesture {
    if (pinched)
        return 'pinch';
    const { thumb, index, middle, ring, pinky } = fingers;
    const up = [thumb, index, middle, ring, pinky].filter(Boolean).length;
    if (index && middle && !ring && !pinky)
        return 'peace';
    if (thumb && index && !middle && !ring && !pinky)
        return 'frame';
    if (index && !middle && !ring && !pinky)
        return 'point';
    if (up >= 4)
        return 'open';
    if (up === 0)
        return 'fist';
    return 'none';
}
async function ensureModel() {
    if (landmarker)
        return landmarker;
    diag.loading = true;
    try {
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
        landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });
        diag.ready = true;
        return landmarker;
    }
    catch (err) {
        diag.lastError = `GPU delegate failed (${(err as Error)?.message ?? err}); retrying on CPU`;
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
        landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
            runningMode: 'VIDEO',
            numHands: 2,
        });
        diag.ready = true;
        return landmarker;
    }
    finally {
        diag.loading = false;
    }
}
function dropHand(i: number) {
    const at = hands.findIndex((h) => h.id === i);
    if (at === -1)
        return;
    releasePress(i, hands[at]);
    hands.splice(at, 1);
    filters.get(i)?.cursor.reset();
    filters.get(i)?.joints.forEach((f) => f.reset());
    settling.delete(i);
    sideVote.delete(i);
    trails.delete(i);
    pinchSince.delete(i);
    poseChangedAt.delete(i);
}
function loop(mine: number) {
    if (!running || mine !== generation || !video || !landmarker)
        return;
    const now = performance.now();
    stamp += 1;
    let result;
    try {
        result = landmarker.detectForVideo(video, stamp);
    }
    catch (err) {
        diag.lastError = String((err as Error)?.message ?? err);
        result = null;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const found = result?.landmarks ?? [];
    const labels = result?.handedness ?? [];
    diag.count = found.length;
    const at = now / 1000;
    const seen = new Set<number>();
    for (let k = 0; k < found.length && k < 2; k++) {
        const marks = found[k];
        if (!marks || marks.length < 21)
            continue;
        const raw = labels[k]?.[0]?.categoryName ?? '';
        const named: Side = raw === 'Right' ? 'right' : 'left';
        const side: Side = SWAP_HANDEDNESS ? (named === 'right' ? 'left' : 'right') : named;
        const wristPx = { x: (1 - marks[WRIST].x) * w, y: marks[WRIST].y * h };
        const reach = Math.hypot(w, h);
        const i = slotFor(side, wristPx, seen, reach);
        seen.add(i);
        const f = filtersFor(i);
        const points = marks.map((m, j) => f.joints[j].filter((1 - m.x) * w, m.y * h, at));
        const span = dist(points[WRIST], points[MIDDLE_MCP]) || 1;
        const gap = dist(points[THUMB_TIP], points[INDEX_TIP]) / span;
        let hand = hands.find((q) => q.id === i);
        if (!hand) {
            hand = {
                id: i, points,
                x: points[INDEX_TIP].x, y: points[INDEX_TIP].y,
                aimX: points[INDEX_TIP].x, aimY: points[INDEX_TIP].y,
                pinched: false, closeness: 0, gesture: 'none',
                fingers: { thumb: false, index: false, middle: false, ring: false, pinky: false },
                handedness: side, span,
            };
            hands.push(hand);
        }
        hand.points = points;
        hand.span = span;
        const wantsPinch = hand.pinched ? gap < PINCH_OFF : gap < PINCH_ON;
        if (wantsPinch && !hand.pinched) {
            pinchSince.set(i, pinchSince.get(i) ?? now);
        }
        else if (!wantsPinch) {
            pinchSince.delete(i);
        }
        const held = pinchSince.get(i);
        const settledLongEnough = now - (poseChangedAt.get(i) ?? 0) > POSE_SETTLE_MS;
        const pinched = hand.pinched
            ? wantsPinch
            : wantsPinch && held !== undefined && now - held >= PINCH_CONFIRM_MS && settledLongEnough;
        hand.closeness = Math.max(0, Math.min(1, 1 - (gap - PINCH_ON) / (PINCH_OFF - PINCH_ON)));
        const tip = points[INDEX_TIP];
        const aimed = f.cursor.filter(tip.x, tip.y, at);
        hand.x = aimed.x;
        hand.y = aimed.y;
        const trail = trails.get(i) ?? [];
        trail.push({ x: aimed.x, y: aimed.y, at: now });
        while (trail.length > 1 && now - trail[0].at > TRAIL_MS)
            trail.shift();
        trails.set(i, trail);
        if (!pinched) {
            const want = now - AIM_LAG_MS;
            let pick = trail[0];
            for (const p of trail)
                if (p.at <= want)
                    pick = p;
            hand.aimX = pick.x;
            hand.aimY = pick.y;
        }
        hand.pinched = pinched;
        hand.fingers = {
            thumb: dist(points[THUMB_TIP], points[WRIST]) > dist(points[THUMB_MCP], points[WRIST]) * 1.35
                || dist(points[THUMB_TIP], points[INDEX_PIP]) > span * 1.1,
            index: isExtended(points, INDEX_TIP, INDEX_PIP),
            middle: isExtended(points, MIDDLE_TIP, MIDDLE_PIP),
            ring: isExtended(points, RING_TIP, RING_PIP),
            pinky: isExtended(points, PINKY_TIP, PINKY_PIP),
        };
        const wasGesture = hand.gesture;
        hand.gesture = stableGesture(i, classify(hand.fingers, pinched), now);
        if (hand.gesture !== wasGesture && hand.gesture !== 'pinch' && wasGesture !== 'pinch') {
            poseChangedAt.set(i, now);
        }
        hand.handedness = votedSide(i, side);
        emit(hand);
    }
    for (const id of [0, 1])
        if (!seen.has(id))
            dropHand(id);
    diag.gesture = hands
        .map((q) => `${q.handedness === 'right' ? 'R' : 'L'}:${q.gesture}`)
        .join(' + ');
    frames++;
    if (now - fpsAt > 1000) {
        diag.fps = Math.round((frames * 1000) / (now - fpsAt));
        frames = 0;
        fpsAt = now;
    }
    schedule(mine);
}
function schedule(mine: number) {
    if (!video)
        return;
    if (typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(() => loop(mine));
    }
    else {
        requestAnimationFrame(() => loop(mine));
    }
}
export async function enableHands(): Promise<void> {
    if (running)
        return;
    patchPointerCapture();
    const mine = ++generation;
    try {
        video = await holdCamera();
        await ensureModel();
        running = true;
        diag.enabled = true;
        fpsAt = performance.now();
        schedule(mine);
    }
    catch (err) {
        diag.lastError = String((err as Error)?.message ?? err);
        disableHands();
        throw err;
    }
}
export function disableHands(): void {
    running = false;
    generation++;
    diag.enabled = false;
    diag.count = 0;
    diag.fps = 0;
    diag.gesture = '';
    for (const h of hands)
        releasePress(h.id, h);
    hands.length = 0;
    presses.clear();
    filters.clear();
    settling.clear();
    sideVote.clear();
    trails.clear();
    pinchSince.clear();
    poseChangedAt.clear();
    if (video) {
        video = null;
        releaseCamera();
    }
}
export function pinchCount(): number {
    return hands.filter((h) => h.pinched).length;
}
export function frameSpan(): number | null {
    const framing = hands.filter((h) => h.gesture === 'frame');
    if (framing.length < 2)
        return null;
    const [a, b] = framing;
    const corner = (h: Hand) => ({
        x: (h.points[THUMB_TIP].x + h.points[INDEX_TIP].x) / 2,
        y: (h.points[THUMB_TIP].y + h.points[INDEX_TIP].y) / 2,
    });
    const ca = corner(a);
    const cb = corner(b);
    return Math.hypot(ca.x - cb.x, ca.y - cb.y);
}
let peaceFrom: {
    id: number;
    y: number;
} | null = null;
export function peaceScroll(): number | null {
    const hand = hands.find((h) => h.gesture === 'peace');
    if (!hand) {
        peaceFrom = null;
        return null;
    }
    if (!peaceFrom || peaceFrom.id !== hand.id) {
        peaceFrom = { id: hand.id, y: hand.y };
        return 0;
    }
    return hand.y - peaceFrom.y;
}
export const handsRunning = () => running;
