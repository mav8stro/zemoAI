import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore, type Blade } from '../store';
import { BRIDGE_HTTP_URL, withToken } from '../config';
import { sanitisePanelHtml } from './sanitise';
import { frameSpan, peaceScroll, pinchCount } from '../lib/hands';
import * as camera from '../lib/camera';
const DISK_PATH = /^\/(Users|home|root|Volumes|Applications|System|Library|private|tmp|var|opt|mnt|media|srv|data)\//;
function viaBridge(raw: string, route: 'img' | 'media'): string {
    const src = String(raw ?? '').trim();
    if (!src)
        return '';
    const path = src.replace(/^file:\/\//, '');
    if (DISK_PATH.test(path)) {
        return withToken(`${BRIDGE_HTTP_URL}/file?path=${encodeURIComponent(path)}`);
    }
    if (!/^https?:\/\//i.test(src))
        return src;
    if (src.startsWith(`${BRIDGE_HTTP_URL}/`))
        return src;
    return withToken(`${BRIDGE_HTTP_URL}/${route}?url=${encodeURIComponent(src)}`);
}
const pageUrl = (url: string, mode: 'reader' | 'live') => withToken(`${BRIDGE_HTTP_URL}/page?mode=${mode}&url=${encodeURIComponent(url)}`);
function embedUrl(raw: string): string | null {
    let url: URL;
    try {
        url = new URL(raw);
    }
    catch {
        return null;
    }
    const host = url.hostname.toLowerCase().replace(/^(?:www|m|music)\./, '');
    const id = (s: string) => (/^[\w-]{6,20}$/.test(s) ? s : null);
    if (host === 'youtube.com' && url.pathname === '/watch') {
        const v = id(url.searchParams.get('v') ?? '');
        return v && `https://www.youtube-nocookie.com/embed/${v}`;
    }
    if (host === 'youtu.be') {
        const v = id(url.pathname.slice(1));
        return v && `https://www.youtube-nocookie.com/embed/${v}`;
    }
    if (host === 'youtube-nocookie.com' && /^\/embed\/[\w-]+/.test(url.pathname))
        return url.href;
    if (host === 'vimeo.com') {
        const v = url.pathname.split('/').filter(Boolean)[0] ?? '';
        return /^\d+$/.test(v) ? `https://player.vimeo.com/video/${v}` : null;
    }
    if (host === 'player.vimeo.com' && /^\/video\/\d+/.test(url.pathname))
        return url.href;
    return null;
}
const CameraView = memo(function CameraView() {
    const el = useRef<HTMLVideoElement>(null);
    const [failed, failed_] = useState<string | null>(null);
    useEffect(() => {
        let held = false;
        let gone = false;
        void camera
            .holdCamera()
            .then((source) => {
            if (gone) {
                camera.releaseCamera();
                return;
            }
            held = true;
            camera.startBuffer();
            if (el.current && source.srcObject)
                el.current.srcObject = source.srcObject;
        })
            .catch((err: DOMException) => failed_(err?.name === 'NotAllowedError'
            ? 'Camera access is not permitted.'
            : `The camera could not be opened: ${err?.message ?? err}`));
        return () => {
            gone = true;
            if (held)
                camera.releaseCamera();
        };
    }, []);
    if (failed)
        return <p className="bl-note">{failed}</p>;
    return <video ref={el} className="bl-camera" autoPlay playsInline muted/>;
});
const Body = memo(function Body({ blade }: {
    blade: Blade;
}) {
    if (blade.kind === 'camera')
        return <CameraView />;
    if (blade.kind === 'article' && blade.url) {
        return (<iframe className="bl-frame" src={pageUrl(blade.url, blade.mode ?? 'reader')} sandbox="allow-scripts" referrerPolicy="no-referrer" title={blade.title}/>);
    }
    if (blade.kind === 'embed' && blade.url) {
        const embed = embedUrl(blade.url);
        if (!embed)
            return <p className="bl-note">That video link could not be played.</p>;
        return (<iframe className="bl-frame" src={embed} sandbox="allow-scripts allow-same-origin allow-presentation" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" referrerPolicy="no-referrer" allowFullScreen title={blade.title}/>);
    }
    if (blade.kind === 'video' && blade.url) {
        return (<video className="bl-video" src={viaBridge(blade.url, 'media')} controls playsInline preload="metadata"/>);
    }
    if (blade.kind === 'image' && blade.url) {
        return <img className="bl-image" src={viaBridge(blade.url, 'img')} alt={blade.title}/>;
    }
    if (blade.kind === 'gallery') {
        return (<div className="bl-gallery">
        {(blade.images ?? []).map((src, i) => (<img key={`${src}-${i}`} className="bl-thumb" src={viaBridge(src, 'img')} alt=""/>))}
      </div>);
    }
    if (blade.kind === 'markup' && blade.html) {
        return (<div className="bl-markup p-body" dangerouslySetInnerHTML={{ __html: sanitisePanelHtml(blade.html) }}/>);
    }
    return <p className="bl-note">Nothing to show.</p>;
});
function Card({ blade, depth, focused, expanded, onFocus, onExpand, onClose, }: {
    blade: Blade;
    depth: number;
    focused: boolean;
    expanded: boolean;
    onFocus: () => void;
    onExpand: () => void;
    onClose: () => void;
}) {
    const [size, setSize] = useState<{
        w: number;
        h: number;
    } | null>(null);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const shell = useRef<HTMLDivElement>(null);
    const body = useRef<HTMLDivElement>(null);
    const scrollContent = (dy: number) => {
        const el = body.current;
        if (!el)
            return;
        const frame = el.querySelector('iframe');
        if (frame?.contentWindow) {
            frame.contentWindow.postMessage({ zimo: 'scroll', dy }, '*');
        }
        else {
            el.scrollTop += dy;
        }
    };
    const grab = (e: React.PointerEvent, onMove: (dx: number, dy: number) => void) => {
        e.preventDefault();
        e.stopPropagation();
        const sx = e.clientX;
        const sy = e.clientY;
        let baseX = sx;
        let baseY = sy;
        let dx = 0;
        let dy = 0;
        const move = (ev: PointerEvent) => {
            if (ev.pointerType === 'touch' && pinchCount() > 1) {
                baseX = ev.clientX - dx;
                baseY = ev.clientY - dy;
                return;
            }
            dx = ev.clientX - baseX;
            dy = ev.clientY - baseY;
            onMove(dx, dy);
        };
        const done = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', done);
            window.removeEventListener('pointercancel', done);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', done);
        window.addEventListener('pointercancel', done);
    };
    const onHeadDown = (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest('button'))
            return;
        if (!focused)
            onFocus();
        if (expanded)
            return;
        const from = { ...pos };
        grab(e, (dx, dy) => setPos({ x: from.x + dx, y: from.y + dy }));
    };
    const onBodyDown = (e: React.PointerEvent) => {
        if (e.pointerType !== 'touch')
            return;
        if (!focused)
            onFocus();
        if (expanded)
            return;
        const from = { ...pos };
        grab(e, (dx, dy) => setPos({ x: from.x + dx, y: from.y + dy }));
    };
    useEffect(() => {
        if (!focused)
            return;
        let raf = 0;
        let last: number | null = null;
        const tick = () => {
            raf = requestAnimationFrame(tick);
            const travelled = peaceScroll();
            if (travelled === null) {
                last = null;
                return;
            }
            if (last === null) {
                last = travelled;
                return;
            }
            scrollContent((last - travelled) * 2.4);
            last = travelled;
        };
        tick();
        return () => cancelAnimationFrame(raf);
    }, [focused]);
    useEffect(() => {
        if (!focused || expanded)
            return;
        let raf = 0;
        let from: {
            span: number;
            w: number;
            h: number;
        } | null = null;
        const tick = () => {
            raf = requestAnimationFrame(tick);
            const span = frameSpan();
            if (span === null) {
                from = null;
                return;
            }
            const box = shell.current?.getBoundingClientRect();
            if (!box)
                return;
            if (!from) {
                from = { span, w: box.width, h: box.height };
                return;
            }
            const k = span / Math.max(from.span, 40);
            setSize({
                w: Math.max(280, Math.min(window.innerWidth * 0.96, from.w * k)),
                h: Math.max(180, Math.min(window.innerHeight * 0.94, from.h * k)),
            });
        };
        tick();
        return () => cancelAnimationFrame(raf);
    }, [focused, expanded]);
    const onGrip = (e: React.PointerEvent) => {
        const box = shell.current?.getBoundingClientRect();
        if (!box)
            return;
        const from = { w: box.width, h: box.height };
        grab(e, (dx, dy) => setSize({
            w: Math.max(280, Math.min(window.innerWidth * 0.96, from.w + dx)),
            h: Math.max(180, Math.min(window.innerHeight * 0.94, from.h + dy)),
        }));
    };
    return (<motion.div className="bl-slot" initial={{ opacity: 0, y: 26, scale: 0.96, filter: 'blur(6px)' }} animate={{
            opacity: expanded || depth === 0 ? 1 : Math.max(0.3, 1 - depth * 0.24),
            y: expanded ? 0 : depth * -13,
            x: expanded ? 0 : depth * 15,
            scale: expanded ? 1 : 1 - depth * 0.035,
            filter: depth === 0 || expanded ? 'blur(0px)' : `blur(${depth * 0.7}px)`,
        }} exit={{ opacity: 0, y: 18, filter: 'blur(8px)', transition: { duration: 0.28 } }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} style={{ zIndex: expanded ? 60 : 40 - depth }}>
      <motion.section ref={shell} className={`bl bl-${blade.size}` +
            (expanded ? ' bl-expanded' : '') +
            (focused ? ' bl-front' : '')} style={{
            ...(size && !expanded ? { width: size.w, height: size.h } : null),
            transform: expanded ? undefined : `translate(${pos.x}px, ${pos.y}px)`,
        }} onPointerDown={() => {
            if (!focused)
                onFocus();
        }}>
        <span className="pk pk-tl"/>
        <span className="pk pk-tr"/>
        <span className="pk pk-bl"/>
        <span className="pk pk-br"/>

        <header className="bl-head" onPointerDown={onHeadDown}>
          <span className="bl-title">{blade.title}</span>
          <span className="bl-kind">{blade.kind}</span>
          <span className="bl-acts">
            {(size || pos.x || pos.y) && !expanded && (<button className="bl-btn" onClick={(e) => {
                e.stopPropagation();
                setSize(null);
                setPos({ x: 0, y: 0 });
            }} title="Back where it started">
                ⤾
              </button>)}
            <button className="bl-btn" onClick={(e) => {
            e.stopPropagation();
            onExpand();
        }} title={expanded ? 'Shrink (E)' : 'Full screen (E)'}>
              {expanded ? '⤡' : '⤢'}
            </button>
            <button className="bl-btn" onClick={(e) => {
            e.stopPropagation();
            onClose();
        }} title="Close (X)">
              ✕
            </button>
          </span>
        </header>

        <div className="bl-body" ref={body} onPointerDown={onBodyDown}>
          <Body blade={blade}/>
        </div>

    {!expanded && <span className="bl-grip" onPointerDown={onGrip} title="Drag to resize"/>}
      </motion.section>
    </motion.div>);
}
export function Blades() {
    const blades = useStore((s) => s.blades);
    const focusedBlade = useStore((s) => s.focusedBlade);
    const expandedBlade = useStore((s) => s.expandedBlade);
    const focusBlade = useStore((s) => s.focusBlade);
    const expandBlade = useStore((s) => s.expandBlade);
    const closeBlade = useStore((s) => s.closeBlade);
    const ordered = useMemo(() => {
        const newestFirst = [...blades].reverse();
        if (!focusedBlade)
            return newestFirst;
        const hit = newestFirst.findIndex((b) => b.id === focusedBlade);
        if (hit <= 0)
            return newestFirst;
        const copy = [...newestFirst];
        const [lifted] = copy.splice(hit, 1);
        return [lifted, ...copy];
    }, [blades, focusedBlade]);
    const front = ordered[0];
    const cycle = useCallback((by: number) => {
        if (ordered.length < 2)
            return;
        const at = ordered.findIndex((b) => b.id === front?.id);
        const next = ordered[(at + by + ordered.length) % ordered.length];
        if (next)
            focusBlade(next.id);
    }, [ordered, front, focusBlade]);
    const live = useRef(false);
    live.current = blades.length > 0;
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!live.current)
                return;
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA')
                return;
            if (e.metaKey || e.ctrlKey || e.altKey || e.repeat)
                return;
            if (e.key === 'e') {
                e.preventDefault();
                expandBlade(expandedBlade ? null : (front?.id ?? null));
            }
            else if (e.key === 'x') {
                e.preventDefault();
                if (front)
                    closeBlade(front.id);
            }
            else if (e.key === ']') {
                e.preventDefault();
                cycle(1);
            }
            else if (e.key === '[') {
                e.preventDefault();
                cycle(-1);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [front, expandedBlade, expandBlade, closeBlade, cycle]);
    if (!blades.length)
        return null;
    return (<div className={`blades-stack${expandedBlade ? ' blades-stack-full' : ''}`}>
      <AnimatePresence>
        {ordered.map((blade, i) => {
            const expanded = expandedBlade === blade.id;
            if (expandedBlade && !expanded)
                return null;
            return (<Card key={blade.id} blade={blade} depth={expanded ? 0 : i} focused={blade.id === front?.id} expanded={expanded} onFocus={() => focusBlade(blade.id)} onExpand={() => expandBlade(expanded ? null : blade.id)} onClose={() => closeBlade(blade.id)}/>);
        })}
      </AnimatePresence>

      {blades.length > 1 && !expandedBlade && (<div className="bl-hint">
          <kbd>[</kbd> <kbd>]</kbd> cycle · <kbd>E</kbd> full · <kbd>X</kbd> close
        </div>)}
    </div>);
}
const SWEEP = [1, 2, 3, 4, 5, 6];
export function BladeSweep() {
    const phase = useStore((s) => s.phase);
    const activeTool = useStore((s) => s.activeTool);
    return (<AnimatePresence>
      {phase === 'tooling' && (<motion.div className="blades" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
          <div className="blade-field">
            {SWEEP.map((n) => (<span key={n} className={`blade blade-${n}`}/>))}
          </div>

          {activeTool && (<div className="blade-carrier">
              <span key={activeTool} className="blade-tool">
                {activeTool}
              </span>
            </div>)}
        </motion.div>)}
    </AnimatePresence>);
}
