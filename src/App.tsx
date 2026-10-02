import { useEffect, useRef } from 'react';
import { Shell } from './ui/zemo/Shell';
import { useStore } from './store';
import { startVoice, type Voice, type VoiceMode } from './lib/voice';
import { createSpeaker, cycleVoice, currentVoiceName } from './lib/tts';
import * as sfx from './lib/sfx';
import * as music from './lib/music';
import * as hands from './lib/hands';
import { listenForClap } from './lib/clap';
import * as camera from './lib/camera';
import * as kokoro from './lib/kokoro';
import { TTS_ENGINE, BRIDGE_HTTP_URL, withToken } from './config';
import { forTool, attention } from './lib/fillers';
import { ask, warm, interrupt, watchServers, watchPanels, watchBlades, watchCapture, watchUi, watchConnection, watchPower, connectedLabels, usingBridge, type Msg, } from './lib/brain';
import { startAnalyser, micLevel } from './lib/audio';
import { probeCapabilities } from './lib/capabilities';
import { env } from './config';
import { speakMalayalam } from './ai/malayalam';
import { ScreenTool } from './ui/ScreenTool';
import { AdminModal } from './ui/AdminModal';
const AWAIT_SPEECH_MS = 14000;
const FOLLOW_UP_MS = 11000;
const newId = () => globalThis.crypto?.randomUUID?.() ??
    `id${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const NAME = '(?:zemo|zimo|jarvis|jarvys|jervis|travis|zemos|zimos|java\'s|jarv)';
const BARE_NAME = new RegExp(`^(?:hey|hi|ok|okay|yo)?\\s*${NAME}[\\s,.!?]*$`, 'i');
const LEADING_NAME = new RegExp(`^(?:hey|hi|ok|okay|yo)?\\s*${NAME}\\b[\\s,.:!?-]*`, 'i');
export default function App() {
    const store = useStore;
    const phase = useStore((s) => s.phase);
    const history = useRef<Msg[]>([]);
    const speaker = useRef<ReturnType<typeof createSpeaker> | null>(null);
    const voice = useRef<Voice | null>(null);
    const turn = useRef(0);
    const booting = useRef(false);
    const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const voicePoll = useRef<ReturnType<typeof setInterval> | null>(null);
    const devTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const clearIdle = () => {
        if (idleTimer.current)
            clearTimeout(idleTimer.current);
        idleTimer.current = null;
    };
    const silence = () => {
        speaker.current?.cancel();
        speaker.current = null;
    };
    const goDormant = () => {
        clearIdle();
        silence();
        turn.current++;
        const s = store.getState();
        s.setCaption('');
        s.setActiveTool(null);
        music.working(false);
        music.duck(false);
        sfx.duck(false);
        s.setPhase('dormant');
    };
    const listen = (window: number) => {
        clearIdle();
        const s = store.getState();
        s.setCaption('');
        s.setPhase('listening');
        sfx.play('listen');
        idleTimer.current = setTimeout(goDormant, window);
    };
    const respond = async (said: string): Promise<void> => {
        const mine = ++turn.current;
        const stale = () => mine !== turn.current;
        clearIdle();
        const s = store.getState();
        s.clearPanels();
        s.clearBlades();
        s.setCaption('');
        s.pushTurn({ id: newId(), role: 'user', text: said });
        s.setPhase('thinking');
        const turnId = newId();
        const cleanSaid = said.trim().toLowerCase().replace(/[.!?]+$/, '');
        if (/^(?:hey (?:zemo|zimo),?\s*)?(?:turn\s+off|shutdown|shut\s+down|power\s+down|exit|close\s+zemo|quit)$/i.test(cleanSaid)) {
            const spk = createSpeaker();
            speaker.current = spk;
            s.setPhase('speaking');
            const msg = 'Powering down ZEMO systems. Goodbye, sir.';
            s.pushTurn({ id: turnId, role: 'zimo', text: msg });
            spk.say(msg);
            await spk.end();
            sfx.play('done');
            try {
                await fetch(withToken(`${BRIDGE_HTTP_URL}/api/system/shutdown`), { method: 'POST' });
            }
            catch { }
            setTimeout(() => {
                window.close();
            }, 700);
            return;
        }
        if (/^(?:hey (?:zemo|zimo),?\s*)?(?:go\s+to\s+sleep|sleep|standby|deactivate)$/i.test(cleanSaid)) {
            const spk = createSpeaker();
            speaker.current = spk;
            s.setPhase('speaking');
            const msg = 'Entering standby sleep mode. Say "Wake up ZEMO" anytime to resume.';
            s.pushTurn({ id: turnId, role: 'zimo', text: msg });
            spk.say(msg);
            await spk.end();
            goDormant();
            return;
        }
        if (/^(?:hey (?:zemo|zimo),?\s*)?(?:wake\s*up(?:\s+zemo)?|zemo\s+wake\s*up|system\s+online)$/i.test(cleanSaid)) {
            const spk = createSpeaker();
            speaker.current = spk;
            s.setPhase('speaking');
            const msg = 'ZEMO online and all systems nominal. What is your command, Boss?';
            s.pushTurn({ id: turnId, role: 'zimo', text: msg });
            spk.say(msg);
            await spk.end();
            listen(FOLLOW_UP_MS);
            return;
        }
        const appMatch = cleanSaid.match(/^(?:hey (?:zemo|zimo),?\s*)?(?:open|launch|start|run)\s+(.+)$/i);
        if (appMatch) {
            const appName = appMatch[1].trim();
            const spk = createSpeaker();
            speaker.current = spk;
            s.setPhase('speaking');
            s.setActiveTool(`launching ${appName}`);
            sfx.play('tool');
            const msg = `Opening ${appName} for you now.`;
            s.pushTurn({ id: turnId, role: 'zimo', text: msg });
            spk.say(msg);
            try {
                await fetch(withToken(`${BRIDGE_HTTP_URL}/api/apps/launch`), {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ app: appName }),
                });
            }
            catch { }
            await spk.end();
            s.setActiveTool(null);
            listen(FOLLOW_UP_MS);
            return;
        }
        const spk = createSpeaker();
        speaker.current = spk;
        sfx.duck(true);
        music.duck(true);
        let started = false;
        let filled = false;
        try {
            const isMl = store.getState().language === 'ml';
            const promptText = isMl ? `[CRITICAL: Reply naturally and directly in Malayalam (മലയാളം).] ${said}` : said;
            const { text } = await ask(promptText, history.current, {
                onText: (delta) => {
                    if (stale())
                        return;
                    if (!started) {
                        started = true;
                        store.getState().setPhase('speaking');
                        store.getState().setActiveTool(null);
                        music.working(false);
                        store.getState().pushTurn({ id: turnId, role: 'zimo', text: '' });
                    }
                    store.getState().appendToLastTurn(delta);
                    if (!isMl) {
                        spk.push(delta);
                    }
                },
                onTool: (name) => {
                    if (stale())
                        return;
                    if (!started)
                        store.getState().setPhase('tooling');
                    store.getState().setActiveTool(name);
                    sfx.play('tool');
                    music.working(true);
                    if (!filled && !started && !isMl) {
                        filled = true;
                        spk.say(forTool(name));
                    }
                },
            });
            if (stale())
                return;
            if (!usingBridge) {
                history.current.push({ role: 'user', content: said });
                history.current.push({ role: 'assistant', content: text || '…' });
                if (history.current.length > 16) {
                    history.current = history.current.slice(-16);
                }
            }
            if (isMl) {
                await new Promise<void>((res) => speakMalayalam(text || 'പൂർത്തിയായി', res));
            } else {
                await spk.end();
            }
            if (stale())
                return;
            sfx.play('done');
        }
        catch (err) {
            if (stale())
                return;
            console.error(err);
            sfx.play('error');
            store
                .getState()
                .setError(err instanceof Error ? err.message : 'Something went wrong.');
        }
        finally {
            if (!stale()) {
                speaker.current = null;
                sfx.duck(false);
                music.duck(false);
                store.getState().setActiveTool(null);
                music.working(false);
                listen(FOLLOW_UP_MS);
            }
        }
    };
    const mode = (): VoiceMode => {
        switch (store.getState().phase) {
            case 'offline':
            case 'boot':
                return 'deaf';
            case 'dormant':
                return 'wake';
            case 'waking':
            case 'listening':
                return 'command';
            default:
                return 'guard';
        }
    };
    const onWake = (trailing: string) => {
        const phase = store.getState().phase;
        if (phase === 'offline' || phase === 'boot')
            return;
        store.getState().setError(null);
        sfx.play('wake');
        if (trailing) {
            void respond(trailing);
            return;
        }
        store.getState().setPhase('waking');
        const greeting = createSpeaker();
        speaker.current = greeting;
        greeting.say(attention());
        void greeting.end();
        listen(AWAIT_SPEECH_MS);
    };
    const onSpeechStart = () => {
        clearIdle();
        const phase = store.getState().phase;
        if (phase === 'offline' || phase === 'boot' || phase === 'dormant')
            return;
        const wasBusy = phase === 'thinking' || phase === 'tooling' || phase === 'speaking';
        silence();
        if (wasBusy) {
            turn.current++;
            interrupt();
            store.getState().setActiveTool(null);
            music.working(false);
            sfx.duck(false);
            music.duck(false);
        }
        store.getState().setPhase('listening');
    };
    const onUtterance = (text: string) => {
        const phase = store.getState().phase;
        if (phase === 'offline' || phase === 'boot' || phase === 'dormant')
            return;
        if (BARE_NAME.test(text)) {
            listen(AWAIT_SPEECH_MS);
            return;
        }
        const said = text.replace(LEADING_NAME, '').trim();
        if (!said) {
            listen(AWAIT_SPEECH_MS);
            return;
        }
        void respond(said);
    };
    const onPartial = (text: string) => {
        store.getState().setCaption(text);
    };
    const submitText = (text: string) => {
        const said = text.trim();
        if (!said)
            return;
        const phase = store.getState().phase;
        if (phase === 'offline' || phase === 'boot')
            return;
        clearIdle();
        void respond(said);
    };
    const onVoiceError = (message: string) => {
        store.getState().setError(message);
    };
    const powerOn = async () => {
        if (booting.current)
            return;
        booting.current = true;
        try {
            await ignite();
        }
        catch (err) {
            booting.current = false;
            console.error('[zimo] power-up failed:', err);
            store.getState().setPhase('offline');
            store
                .getState()
                .setError(err instanceof Error
                ? `Power-up failed: ${err.message}`
                : 'Power-up failed. Click to try again.');
        }
    };
    const ignite = async () => {
        const s = store.getState();
        await sfx.unlockAudio();
        sfx.play('boot');
        music.enable();
        music.playBoot();
        music.startAmbient();
        s.setPhase('boot');
        watchServers((servers) => store.getState().setConnected(servers));
        watchPanels((panel) => store.getState().pushPanel(panel));
        watchBlades((blade) => store.getState().pushBlade(blade));
        watchCapture(async (req) => {
            const note = req.mode === 'watch'
                ? req.when === 'past'
                    ? req.reason || 'reviewing the last few seconds'
                    : `${req.reason || 'watching'} · ${req.seconds}s`
                : req.reason || 'taking a look';
            store.getState().setLooking(note);
            if (req.mode === 'watch' && req.when === 'past' && camera.bufferedSeconds() < 1) {
                store.getState().setLooking(null);
                return {
                    error: 'There is no recent footage — the camera has to be open on screen ' +
                        'for me to remember what just happened. Ask me to open the camera, ' +
                        'and I can watch from then on.',
                };
            }
            let held = false;
            try {
                await camera.holdCamera();
                held = true;
                if (req.mode === 'look')
                    return camera.grabFrame();
                if (req.when === 'past') {
                    const grid = camera.recentGrid(req.seconds, 9);
                    return grid ?? { error: 'There is not enough recent footage to review.' };
                }
                return await camera.watchAhead(req.seconds, 9);
            }
            catch (err) {
                return {
                    error: (err as DOMException)?.name === 'NotAllowedError'
                        ? 'The camera is not permitted, so I cannot see anything.'
                        : `The camera could not be read: ${(err as Error)?.message ?? err}`,
                };
            }
            finally {
                if (held)
                    camera.releaseCamera();
                store.getState().setLooking(null);
            }
        });
        watchUi((op, args) => {
            const s = store.getState();
            const a = (args ?? {}) as Record<string, never>;
            switch (op) {
                case 'patch':
                    s.applyUi(args);
                    break;
                case 'orbit':
                    if (a.action === 'add')
                        s.addOrbit(args);
                    else if (a.action === 'remove')
                        s.removeOrbit(String(a.id));
                    else
                        s.clearOrbits();
                    break;
                case 'effect':
                    s.fireEffect(a.kind);
                    break;
                case 'reset':
                    s.resetUi();
                    break;
                case 'screen':
                    s.clearScreen(a.what ?? 'all');
                    break;
                default:
                    console.warn('[zimo] unknown ui op:', op, args);
            }
        });
        watchConnection((state) => {
            if (state === 'lost') {
                store.getState().setError('Bridge connection lost — reconnecting.');
            }
            else if (state === 'reconnected') {
                store
                    .getState()
                    .setError('Bridge reconnected. The previous conversation was not kept.');
            }
        });
        watchPower((action) => {
            if (action === 'shutdown') {
                sfx.play('done');
                store.getState().setPhase('offline');
                setTimeout(() => {
                    window.close();
                }, 800);
            }
            else if (action === 'sleep') {
                goDormant();
            }
            else if (action === 'wakeup') {
                onWake('');
            }
        });
        const warming = warm().catch((err: Error) => s.setError(err.message));
        if (!usingBridge && !env.anthropicKey) {
            s.setError('No Anthropic API key — copy .env.example to .env.local and set VITE_ANTHROPIC_API_KEY.');
        }
        if (TTS_ENGINE === 'kokoro') {
            void kokoro.load();
            voicePoll.current = setInterval(() => {
                const p = kokoro.loadProgress();
                if (kokoro.isReady() || kokoro.isUnavailable()) {
                    store.getState().setBootNote('');
                    if (voicePoll.current)
                        clearInterval(voicePoll.current);
                    voicePoll.current = null;
                }
                else if (p > 0 && p < 1) {
                    store.getState().setBootNote(`voice ${Math.round(p * 100)}%`);
                }
            }, 200);
        }
        await new Promise((r) => setTimeout(r, 9200));
        await warming;
        store.getState().setConnected(connectedLabels());
        store.getState().setVoice(currentVoiceName());
        try {
            await startAnalyser();
        }
        catch {
            console.warn('[zimo] no microphone stream — the reactor will not pulse with your ' +
                'voice. Speech recognition is unaffected.');
        }
        await probeCapabilities();
        voice.current = await startVoice({
            mode,
            onWake,
            onSpeechStart,
            onPartial,
            onUtterance,
            onError: onVoiceError,
        });
        store.getState().setPhase('dormant');
    };
    useEffect(() => {
        if (phase !== 'offline')
            return;
        let live: {
            stop: () => void;
        } | null = null;
        let gone = false;
        void listenForClap(() => {
            if (!gone)
                void powerOn();
        }).then((l) => {
            if (gone)
                l.stop();
            else
                live = l;
        });
        return () => {
            gone = true;
            live?.stop();
        };
    }, [phase]);
    useEffect(() => {
        let raf = 0;
        const pump = () => {
            const st = store.getState();
            const lvl = st.phase === 'speaking' && speaker.current
                ? speaker.current.level()
                : micLevel();
            st.setLevel(lvl);
            raf = requestAnimationFrame(pump);
        };
        pump();
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA')
                return;
            if (e.key === 'v' &&
                !e.repeat &&
                !e.metaKey &&
                !e.ctrlKey &&
                !e.altKey) {
                e.preventDefault();
                const name = cycleVoice();
                store.getState().setVoice(name);
                silence();
                const demo = createSpeaker();
                speaker.current = demo;
                demo.say(`Voice set to ${name.replace(/\(.*?\)/g, '').trim()}. At your service, sir.`);
                void demo.end();
                return;
            }
            if (e.key === 'g' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                const on = store.getState().gestures;
                if (on) {
                    hands.disableHands();
                    store.getState().setGestures(false);
                }
                else {
                    store.getState().setError(null);
                    void hands
                        .enableHands()
                        .then(() => store.getState().setGestures(true))
                        .catch((err: Error) => {
                        store.getState().setGestures(false);
                        store
                            .getState()
                            .setError(err?.name === 'NotAllowedError'
                            ? 'Camera access denied — gesture control is unavailable.'
                            : `Gesture control failed to start: ${err?.message ?? err}`);
                    });
                }
                return;
            }
            if (e.key === 't' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                silence();
                const t = createSpeaker();
                speaker.current = t;
                t.say('Audio test. If you can hear this, speech output is working, sir.');
                void t.end().then(() => {
                    const d = (window as unknown as Record<string, Record<string, unknown>>).__tts;
                    console.info('[zimo] audio test →', d);
                    if (d && d.started === 0 && d.rescued === 0) {
                        store.getState().setError(`No sound produced. engine=${d.engine} voice=${d.voice} error=${d.lastError || 'none'}`);
                    }
                });
                return;
            }
            if (e.altKey && (e.key === 'l' || e.key === 'L') && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                store.getState().toggleLanguage();
                const newLang = store.getState().language;
                if (newLang === 'ml') {
                    speakMalayalam('മലയാളം ഭാഷ സജ്ജമാക്കി');
                } else {
                    const spk = createSpeaker();
                    spk.say('English language mode active, sir.');
                    void spk.end();
                }
                return;
            }
            if (e.altKey && e.ctrlKey && e.metaKey && (e.key === 'g' || e.key === 'G')) {
                e.preventDefault();
                if (!devTimer.current) {
                    devTimer.current = setTimeout(() => {
                        store.getState().setDevMode(true);
                        store.getState().setAdminModalOpen(true);
                        sfx.play('wake');
                    }, 5000);
                }
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                if (store.getState().phase !== 'offline')
                    goDormant();
                return;
            }
            if (e.code !== 'Space' || e.repeat)
                return;
            e.preventDefault();
            const phase = store.getState().phase;
            if (phase === 'offline') {
                void powerOn();
            }
            else if (phase === 'boot') {
            }
            else if (phase === 'thinking' ||
                phase === 'tooling' ||
                phase === 'speaking') {
                onSpeechStart();
                listen(AWAIT_SPEECH_MS);
            }
            else {
                onWake('');
            }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'g' || e.key === 'G' || e.key === 'Alt' || e.key === 'Control' || e.key === 'Meta') {
                if (devTimer.current) {
                    clearTimeout(devTimer.current);
                    devTimer.current = null;
                }
            }
        };
        window.addEventListener('keydown', onKey);
        window.addEventListener('keyup', onKeyUp);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('keyup', onKeyUp);
            if (devTimer.current)
                clearTimeout(devTimer.current);
            clearIdle();
            if (voicePoll.current)
                clearInterval(voicePoll.current);
            voice.current?.stop();
            speaker.current?.cancel();
            hands.disableHands();
        };
    }, []);
    const screenOpen = useStore((s) => s.screenToolOpen);
    const adminOpen = useStore((s) => s.adminModalOpen);
    return (<>
      <Shell onSubmit={submitText} onStartVoice={() => listen(AWAIT_SPEECH_MS)} onStart={() => void powerOn()}/>
      {screenOpen && <ScreenTool onClose={() => store.getState().setScreenToolOpen(false)} />}
      {adminOpen && <AdminModal onClose={() => store.getState().setAdminModalOpen(false)} />}
    </>);
}
