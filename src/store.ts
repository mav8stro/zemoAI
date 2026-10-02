import { create } from 'zustand';
export type Phase = 'offline' | 'boot' | 'dormant' | 'waking' | 'listening' | 'thinking' | 'tooling' | 'speaking';
export type Tab = 'home' | 'chat' | 'voice' | 'tools' | 'memory' | 'files' | 'apps' | 'settings';
export type Panel = {
    id: string;
    title: string;
    html: string;
    anim: 'materialise' | 'sweep' | 'unfold' | 'stagger' | 'snap';
    slot: 'right' | 'left' | 'wide';
    accent: 'default' | 'amber' | 'violet' | 'green' | 'red';
    hold: 'turn' | 'sticky';
};
export type Blade = {
    id: string;
    title: string;
    kind: 'article' | 'image' | 'gallery' | 'video' | 'embed' | 'markup' | 'camera';
    url?: string;
    images?: string[];
    html?: string;
    mode?: 'reader' | 'live';
    size: 'compact' | 'tall' | 'wide' | 'full';
    hold: 'turn' | 'sticky';
};
export type Turn = {
    id: string;
    role: 'user' | 'zimo';
    text: string;
    tools?: string[];
};
export type OrbitObject = {
    id: string;
    src: string;
    radius: number;
    speed: number;
    size: number;
    tilt: number;
    opacity: number;
    phase: number;
};
export type UiEffect = {
    kind: 'glitch' | 'pulse' | 'scan' | 'shake' | 'flash';
    at: number;
};
export type UiState = {
    accent: string | null;
    background: string | null;
    palette: Partial<Record<Phase, string>>;
    reactor: {
        color: string | null;
        scale: number;
        intensity: number;
        spin: number;
        style: 'ring' | 'sphere' | 'wire';
        visible: boolean;
    };
    orbits: OrbitObject[];
    chrome: {
        systems: boolean;
        transcript: boolean;
        toolBadge: boolean;
        suggestions: boolean;
        brand: boolean;
    };
    effect: UiEffect | null;
};
export const UI_DEFAULTS: UiState = {
    accent: null, background: null, palette: {},
    reactor: { color: null, scale: 1, intensity: 1, spin: 1, style: 'ring', visible: true },
    orbits: [],
    chrome: { systems: true, transcript: true, toolBadge: true, suggestions: true, brand: true },
    effect: null,
};
export type UiPatch = {
    accent?: string | null;
    background?: string | null;
    palette?: Partial<Record<Phase, string>>;
    reactor?: Partial<UiState['reactor']>;
    chrome?: Partial<UiState['chrome']>;
};
function defaultUi(): UiState {
    return {
        ...UI_DEFAULTS,
        palette: { ...UI_DEFAULTS.palette },
        reactor: { ...UI_DEFAULTS.reactor },
        orbits: [],
        chrome: { ...UI_DEFAULTS.chrome },
    };
}
function defined<T extends object>(patch: T | undefined): Partial<T> {
    if (!patch)
        return {};
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined)
            out[key] = value;
    }
    return out as Partial<T>;
}
const MAX_ORBITS = 8;
type State = {
    phase: Phase;
    level: number;
    caption: string;
    turns: Turn[];
    activeTool: string | null;
    error: string | null;
    connected: string[];
    voice: string;
    gestures: boolean;
    looking: string | null;
    bootNote: string;
    panels: Panel[];
    blades: Blade[];
    focusedBlade: string | null;
    expandedBlade: string | null;
    ui: UiState;
    activeTab: Tab;
    setActiveTab: (tab: Tab) => void;
    setVoice: (v: string) => void;
    setGestures: (on: boolean) => void;
    setLooking: (why: string | null) => void;
    setBootNote: (n: string) => void;
    pushPanel: (p: Panel) => void;
    clearPanels: () => void;
    pushBlade: (b: Blade) => void;
    closeBlade: (id: string) => void;
    clearBlades: () => void;
    focusBlade: (id: string | null) => void;
    expandBlade: (id: string | null) => void;
    setPhase: (p: Phase) => void;
    setLevel: (l: number) => void;
    setCaption: (c: string) => void;
    setActiveTool: (t: string | null) => void;
    setError: (e: string | null) => void;
    setConnected: (c: string[]) => void;
    pushTurn: (t: Turn) => void;
    appendToLastTurn: (text: string) => void;
    applyUi: (patch: UiPatch) => void;
    addOrbit: (o: OrbitObject) => void;
    removeOrbit: (id: string) => void;
    clearOrbits: () => void;
    fireEffect: (kind: UiEffect['kind']) => void;
    resetUi: () => void;
    clearScreen: (what: 'all' | 'panels' | 'transcript') => void;
    language: 'en' | 'ml';
    toggleLanguage: () => void;
    devMode: boolean;
    setDevMode: (on: boolean) => void;
    adminUnlocked: boolean;
    setAdminUnlocked: (on: boolean) => void;
    screenToolOpen: boolean;
    setScreenToolOpen: (on: boolean) => void;
    adminModalOpen: boolean;
    setAdminModalOpen: (on: boolean) => void;
};
export const useStore = create<State>((set) => ({
    phase: 'offline',
    level: 0,
    caption: '',
    turns: [],
    activeTool: null,
    error: null,
    connected: [],
    voice: '',
    gestures: false,
    looking: null,
    panels: [],
    blades: [],
    focusedBlade: null,
    expandedBlade: null,
    bootNote: '',
    ui: defaultUi(),
    activeTab: 'home',
    setActiveTab: (activeTab) => set({ activeTab }),
    setVoice: (voice) => set({ voice }),
    setGestures: (gestures) => set({ gestures }),
    setLooking: (looking) => set({ looking }),
    setBootNote: (bootNote) => set({ bootNote }),
    pushPanel: (panel) => set((s) => {
        const next = [...s.panels, panel];
        if (next.length <= 3)
            return { panels: next };
        const keep: Panel[] = [];
        for (let i = next.length - 1; i >= 0; i--) {
            if (keep.length < 3 || next[i].hold === 'sticky')
                keep.unshift(next[i]);
        }
        return { panels: keep };
    }),
    clearPanels: () => set((s) => ({ panels: s.panels.filter((p) => p.hold === 'sticky') })),
    pushBlade: (blade) => set((s) => {
        const next = [...s.blades.filter((b) => b.id !== blade.id), blade].slice(-6);
        return { blades: next, focusedBlade: blade.id };
    }),
    closeBlade: (id) => set((s) => ({
        blades: s.blades.filter((b) => b.id !== id),
        focusedBlade: s.focusedBlade === id ? null : s.focusedBlade,
        expandedBlade: s.expandedBlade === id ? null : s.expandedBlade,
    })),
    clearBlades: () => set((s) => {
        const kept = s.blades.filter((b) => b.hold === 'sticky');
        const alive = new Set(kept.map((b) => b.id));
        return {
            blades: kept,
            focusedBlade: s.focusedBlade && alive.has(s.focusedBlade) ? s.focusedBlade : null,
            expandedBlade: s.expandedBlade && alive.has(s.expandedBlade) ? s.expandedBlade : null,
        };
    }),
    focusBlade: (focusedBlade) => set({ focusedBlade }),
    expandBlade: (expandedBlade) => set({ expandedBlade }),
    setPhase: (phase) => set({ phase }),
    setLevel: (level) => set({ level }),
    setCaption: (caption) => set({ caption }),
    setActiveTool: (activeTool) => set({ activeTool }),
    setError: (error) => set({ error }),
    setConnected: (connected) => set({ connected }),
    pushTurn: (turn) => set((s) => ({ turns: [...s.turns.slice(-40), turn] })),
    appendToLastTurn: (text) => set((s) => {
        const turns = [...s.turns];
        const last = turns[turns.length - 1];
        if (!last || last.role !== 'zimo')
            return {};
        turns[turns.length - 1] = { ...last, text: last.text + text };
        return { turns };
    }),
    applyUi: (patch) => set((s) => ({
        ui: {
            ...s.ui,
            accent: patch.accent === undefined ? s.ui.accent : patch.accent,
            background: patch.background === undefined ? s.ui.background : patch.background,
            palette: { ...s.ui.palette, ...defined(patch.palette) },
            reactor: { ...s.ui.reactor, ...defined(patch.reactor) },
            chrome: { ...s.ui.chrome, ...defined(patch.chrome) },
        },
    })),
    addOrbit: (orbit) => set((s) => {
        const known = s.ui.orbits.some((o) => o.id === orbit.id);
        const next = known
            ? s.ui.orbits.map((o) => (o.id === orbit.id ? orbit : o))
            : [...s.ui.orbits, orbit];
        return { ui: { ...s.ui, orbits: next.slice(-MAX_ORBITS) } };
    }),
    removeOrbit: (id) => set((s) => ({ ui: { ...s.ui, orbits: s.ui.orbits.filter((o) => o.id !== id) } })),
    clearOrbits: () => set((s) => ({ ui: { ...s.ui, orbits: [] } })),
    fireEffect: (kind) => set((s) => ({ ui: { ...s.ui, effect: { kind, at: Date.now() } } })),
    resetUi: () => set({ ui: defaultUi() }),
    clearScreen: (what) => set((s) => {
        const panels = what === 'transcript' ? s.panels : [];
        const turns = what === 'panels' ? s.turns : [];
        const blades = what === 'transcript' ? s.blades : [];
        const cleared = { panels, turns, blades, focusedBlade: null, expandedBlade: null };
        return what === 'all'
            ? { ...cleared, caption: '', activeTool: null }
            : cleared;
    }),
    language: 'en',
    toggleLanguage: () => set((s) => ({ language: s.language === 'en' ? 'ml' : 'en' })),
    devMode: false,
    setDevMode: (devMode) => set({ devMode }),
    adminUnlocked: false,
    setAdminUnlocked: (adminUnlocked) => set({ adminUnlocked }),
    screenToolOpen: false,
    setScreenToolOpen: (screenToolOpen) => set({ screenToolOpen }),
    adminModalOpen: false,
    setAdminModalOpen: (adminModalOpen) => set({ adminModalOpen }),
}));
export const phaseColor: Record<Phase, string> = {
    offline: '#0d4a4a',
    boot: '#17b3b3',
    dormant: '#12908f',
    waking: '#5cf2ef',
    listening: '#19d8d2',
    thinking: '#f0a93c',
    tooling: '#a97bff',
    speaking: '#3ef2a8',
};
export function accentFor(phase: Phase, ui: UiState): string {
    return ui.accent ?? ui.palette[phase] ?? phaseColor[phase];
}
if (import.meta.env.DEV) {
    ;
    (window as unknown as Record<string, unknown>).__zimo = new Proxy({} as Record<string, unknown>, {
        get: (_t, key) => (useStore.getState() as Record<string | symbol, unknown>)[key],
        has: (_t, key) => key in useStore.getState(),
        ownKeys: () => Reflect.ownKeys(useStore.getState()),
        getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    });
}
