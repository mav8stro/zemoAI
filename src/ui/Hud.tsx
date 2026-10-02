import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useStore, accentFor, type Phase } from '../store';
import { Suggestions } from './Suggestions';
import { BladeSweep, Blades } from './Blades';
import { Effects } from './Effects';
import { Pointer } from './Pointer';
import { GestureGuide } from './GestureGuide';
import { Home } from './Home';
const statusText: Record<Phase, string> = {
    offline: 'OFFLINE',
    boot: 'INITIALISING',
    dormant: 'STANDBY — SAY “HEY ZEMO”',
    waking: 'ONLINE',
    listening: 'LISTENING',
    thinking: 'PROCESSING',
    tooling: 'ACCESSING SYSTEMS',
    speaking: 'RESPONDING',
};
function Corner({ at }: {
    at: 'tl' | 'tr' | 'bl' | 'br';
}) {
    return <div className={`corner corner-${at}`}/>;
}
const GLYPHS = '/\\|<>[]{}=+*#%&$0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const GHOST = 22;
const FRAME_MS = 42;
const MIN_RATE = 110;
const MAX_LAG_MS = 420;
function scramble(s: string, seed: number) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === ' ' || c === '\n' || c === '\t') {
            out += c;
            continue;
        }
        out += GLYPHS[(seed * 7919 + i * 104729 + c.charCodeAt(0)) % GLYPHS.length];
    }
    return out;
}
function DecodeText({ text }: {
    text: string;
}) {
    const reduced = useReducedMotion();
    const settled = useRef(0);
    const raf = useRef(0);
    const latest = useRef(text);
    const [tick, bump] = useState(0);
    useEffect(() => {
        latest.current = text;
        if (reduced) {
            settled.current = text.length;
            return;
        }
        if (raf.current || settled.current >= text.length)
            return;
        let prev = performance.now();
        let painted = 0;
        const step = (now: number) => {
            const dt = Math.min(now - prev, 120) / 1000;
            prev = now;
            const target = latest.current.length;
            const rate = Math.max(MIN_RATE, (target - settled.current) / (MAX_LAG_MS / 1000));
            settled.current = Math.min(target, settled.current + rate * dt);
            if (now - painted >= FRAME_MS) {
                painted = now;
                bump((n) => n + 1);
            }
            if (settled.current < latest.current.length) {
                raf.current = requestAnimationFrame(step);
            }
            else {
                raf.current = 0;
                bump((n) => n + 1);
            }
        };
        raf.current = requestAnimationFrame(step);
    }, [text, reduced]);
    useEffect(() => () => {
        if (raf.current)
            cancelAnimationFrame(raf.current);
        raf.current = 0;
    }, []);
    const n = Math.floor(settled.current);
    if (reduced || n >= text.length)
        return <>{text}</>;
    return (<>
      {text.slice(0, n)}
      <span className="decode-ghost">{scramble(text.slice(n, n + GHOST), tick)}</span>
      <span className="decode-veil">{text.slice(n + GHOST)}</span>
    </>);
}
export function Hud({ onSubmit, onStartVoice, }: {
    onSubmit?: (text: string) => void;
    onStartVoice?: () => void;
}) {
    const phase = useStore((s) => s.phase);
    const activeTab = useStore((s) => s.activeTab);
    const caption = useStore((s) => s.caption);
    const turns = useStore((s) => s.turns);
    const activeTool = useStore((s) => s.activeTool);
    const connected = useStore((s) => s.connected);
    const error = useStore((s) => s.error);
    const level = useStore((s) => s.level);
    const voice = useStore((s) => s.voice);
    const bootNote = useStore((s) => s.bootNote);
    const gestures = useStore((s) => s.gestures);
    const looking = useStore((s) => s.looking);
    const ui = useStore((s) => s.ui);
    const colour = accentFor(phase, ui);
    useEffect(() => {
        const root = document.documentElement;
        if (ui.background)
            root.style.setProperty('--bg', ui.background);
        else
            root.style.removeProperty('--bg');
    }, [ui.background]);
    if (phase === 'dormant' || activeTab !== 'home') {
        return <Home onSubmit={(text) => onSubmit?.(text)} onStartVoice={onStartVoice}/>;
    }
    return (<div className="hud" style={{ ['--accent' as string]: colour }}>
      
      <BladeSweep />

      <Corner at="tl"/>
      <Corner at="tr"/>
      <Corner at="bl"/>
      <Corner at="br"/>

      <header className="hud-top">
        {ui.chrome.brand && (<div className="brand">
            <span className="brand-mark">Z.E.M.O.</span>
            <span className="brand-sub">Zero Error Machine Operator</span>
          </div>)}

        <div className="status">
          <span className="dot"/>
          <span className="status-text">
            
            {phase === 'boot' && bootNote ? bootNote : statusText[phase]}
          </span>
        </div>
      </header>

        {ui.chrome.systems && (<aside className="rail rail-left">
          <div className="rail-title">SYSTEMS</div>
          {connected.length === 0 && <div className="rail-item dim">none linked</div>}
          {connected.map((c) => (<div key={c} className="rail-item">
              <span className="tick"/>
              {c}
            </div>))}
          <div className="rail-item">
            <span className="tick"/>
            Web
          </div>
        </aside>)}

    <aside className="rail rail-right">
        <div className="rail-title">SIGNAL</div>
        <div className="meter">
          <div className="meter-fill" style={{ height: `${level * 100}%` }}/>
        </div>
        <div className="rail-item mono">{(level * 100).toFixed(0).padStart(3, '0')}%</div>
      </aside>

      <AnimatePresence>
        {activeTool && ui.chrome.toolBadge && (<motion.div className="tool-badge" initial={{ opacity: 0, x: '-50%', y: -8, filter: 'blur(6px)' }} animate={{ opacity: 1, x: '-50%', y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, x: '-50%', y: -8, filter: 'blur(6px)' }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
            <span className="tool-kicker">
              <span className="spinner"/>
              accessing
            </span>
            <span className="tool-name">{activeTool.replace(/[_-]/g, ' ')}</span>
          </motion.div>)}
      </AnimatePresence>

        {ui.chrome.transcript && (<div className="log">
          <AnimatePresence initial={false}>
            {turns.slice(-4).map((t) => (<motion.div key={t.id} className={`log-line log-${t.role}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}>
                <span className="log-who">{t.role === 'user' ? 'YOU' : 'ZEMO'}</span>
                
                <span className="log-text">
                  {t.role === 'zimo' ? <DecodeText text={t.text}/> : t.text}
                </span>
              </motion.div>))}
          </AnimatePresence>
        </div>)}

      <AnimatePresence>
        {caption && (<motion.div className="caption" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {caption}
          </motion.div>)}
      </AnimatePresence>

    <Blades />

      {ui.chrome.suggestions && <Suggestions />}

      {error && <div className="error">{error}</div>}

      <footer className="hud-bottom">
        <span className="hint">
          say <b>“hey zemo”</b> · <kbd>Space</kbd> to talk · <kbd>G</kbd> hands
          {voice && (<>
              {' · '}
              <kbd>V</kbd> voice: {voice.replace(/\(.*?\)/g, '').trim()}
            </>)}
        </span>
      </footer>

    <Effects />

    <Pointer />
      {(gestures || looking) && (<div className="hands-live">
          {looking ? `LOOKING — ${looking.toUpperCase()}` : 'CAMERA ON · G TO STOP'}
        </div>)}
      <GestureGuide live={gestures}/>
    </div>);
}
