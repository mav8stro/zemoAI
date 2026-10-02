import { memo, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { useStore, type Panel } from '../store';
import { sanitisePanelHtml } from './sanitise';
const VARIANTS: Record<Panel['anim'], Variants> = {
    materialise: {
        hidden: { opacity: 0, scaleY: 0.86, filter: 'blur(4px)' },
        shown: { opacity: 1, scaleY: 1, filter: 'blur(0px)' },
    },
    sweep: {
        hidden: { opacity: 0, x: 44 },
        shown: { opacity: 1, x: 0 },
    },
    unfold: {
        hidden: { opacity: 0, scaleY: 0.2, originY: 0 },
        shown: { opacity: 1, scaleY: 1, originY: 0 },
    },
    stagger: {
        hidden: { opacity: 0, y: 14 },
        shown: { opacity: 1, y: 0 },
    },
    snap: {
        hidden: { opacity: 0, scale: 1.04 },
        shown: { opacity: 1, scale: 1 },
    },
};
const SPRING = { type: 'spring' as const, stiffness: 300, damping: 28 };
function watchMedia(node: HTMLDivElement | null) {
    if (!node)
        return;
    node.querySelectorAll('img').forEach((img) => {
        if (img.dataset.watched)
            return;
        img.dataset.watched = '1';
        const fail = () => replaceWithNote(img, 'image unavailable');
        if (img.complete && img.naturalWidth === 0)
            fail();
        else
            img.addEventListener('error', fail, { once: true });
    });
    node.querySelectorAll('video').forEach((video) => {
        if (video.dataset.watched)
            return;
        video.dataset.watched = '1';
        const fail = () => replaceWithNote(video, 'video unavailable');
        if (!video.hasAttribute('src') && !video.querySelector('source[src]')) {
            fail();
            return;
        }
        video.addEventListener('error', fail, { capture: true, once: true });
    });
}
function replaceWithNote(el: Element, text: string) {
    const note = document.createElement('span');
    note.className = 'hud-caption hud-dim';
    note.textContent = text;
    el.replaceWith(note);
}
const Card = memo(function Card({ panel }: {
    panel: Panel;
}) {
    const html = useMemo(() => sanitisePanelHtml(panel.html ?? ''), [panel.html]);
    const empty = useMemo(() => !html.replace(/<[^>]*>/g, '').trim() && !/<(?:img|video|iframe)\b/i.test(html), [html]);
    const body = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (empty)
            console.warn('[zimo] empty panel body', panel.title, panel.html);
    }, [panel, empty]);
    useEffect(() => {
        watchMedia(body.current);
    }, [html]);
    return (<motion.section className={`panel panel-${panel.accent}`} variants={VARIANTS[panel.anim] ?? VARIANTS.materialise} initial="hidden" animate="shown" exit={{ opacity: 0, filter: 'blur(6px)', transition: { duration: 0.3 } }} transition={panel.anim === 'snap' ? { duration: 0.12 } : SPRING}>
      <span className="pk pk-tl"/>
      <span className="pk pk-tr"/>
      <span className="pk pk-bl"/>
      <span className="pk pk-br"/>

    <motion.span className="p-wipe" initial={{ y: '-100%', opacity: 0.9 }} animate={{ y: '300%', opacity: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }}/>

      <header className="p-head">
        <span className="p-title">{panel.title}</span>
      </header>

    {empty ? (<p className="p-empty">no content returned</p>) : (<div ref={body} className={panel.anim === 'stagger' ? 'p-body p-stagger' : 'p-body'} dangerouslySetInnerHTML={{ __html: html }}/>)}
    </motion.section>);
});
export const Panels = memo(function Panels() {
    const panels = useStore((s) => s.panels);
    const slots = {
        right: panels.filter((p) => p.slot === 'right' || !p.slot),
        left: panels.filter((p) => p.slot === 'left'),
        wide: panels.filter((p) => p.slot === 'wide'),
    };
    return (<>
      {(['right', 'left', 'wide'] as const).map((slot) => (<div key={slot} className={`panels panels-${slot}`}>
          <AnimatePresence>
            {slots[slot].map((p) => (<Card key={p.id} panel={p}/>))}
          </AnimatePresence>
        </div>))}
    </>);
});
