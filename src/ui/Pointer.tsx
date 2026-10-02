import { useEffect, useRef } from 'react';
import { BONES, INDEX_TIP, THUMB_TIP, TIPS, WRIST, diag, hands } from '../lib/hands';
const GLOW_WIDTH = 7;
const LINE_WIDTH = 2;
export function Pointer() {
    const canvas = useRef<HTMLCanvasElement>(null);
    const raf = useRef(0);
    useEffect(() => {
        const el = canvas.current;
        if (!el)
            return;
        const ctx = el.getContext('2d');
        if (!ctx)
            return;
        let w = 0;
        let h = 0;
        let dpr = 1;
        const fit = () => {
            const nw = window.innerWidth;
            const nh = window.innerHeight;
            const ndpr = Math.min(window.devicePixelRatio || 1, 2);
            if (!nw || !nh)
                return false;
            if (nw === w && nh === h && ndpr === dpr)
                return true;
            w = nw;
            h = nh;
            dpr = ndpr;
            el.width = Math.round(w * dpr);
            el.height = Math.round(h * dpr);
            el.style.width = `${w}px`;
            el.style.height = `${h}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            return true;
        };
        const accentOf = () => {
            const hud = document.querySelector('.hud') as HTMLElement | null;
            const c = hud && getComputedStyle(hud).getPropertyValue('--accent').trim();
            return c || '#19c4c4';
        };
        const draw = () => {
            raf.current = requestAnimationFrame(draw);
            if (!fit())
                return;
            ctx.clearRect(0, 0, w, h);
            if (!diag.enabled || !hands.length)
                return;
            const accent = accentOf();
            for (const hand of hands) {
                const p = hand.points;
                if (!p || p.length < 21)
                    continue;
                const scale = Math.max(0.6, Math.min(2.2, hand.span / 90));
                const lit = hand.pinched ? 1 : 0.82 + hand.closeness * 0.18;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.globalAlpha = 0.4 * lit;
                ctx.strokeStyle = accent;
                ctx.shadowColor = accent;
                ctx.shadowBlur = 22 * scale;
                ctx.lineWidth = GLOW_WIDTH * scale;
                ctx.beginPath();
                for (const [a, b] of BONES) {
                    ctx.moveTo(p[a].x, p[a].y);
                    ctx.lineTo(p[b].x, p[b].y);
                }
                ctx.stroke();
                ctx.globalAlpha = 1 * lit;
                ctx.shadowBlur = 6 * scale;
                ctx.lineWidth = LINE_WIDTH * scale;
                ctx.beginPath();
                for (const [a, b] of BONES) {
                    ctx.moveTo(p[a].x, p[a].y);
                    ctx.lineTo(p[b].x, p[b].y);
                }
                ctx.stroke();
                ctx.globalAlpha = 0.95 * lit;
                ctx.fillStyle = accent;
                ctx.shadowBlur = 4 * scale;
                for (let i = 0; i < p.length; i++) {
                    if (i === INDEX_TIP)
                        continue;
                    const r = (TIPS.includes(i) ? 3.6 : i === WRIST ? 4 : 2.2) * scale;
                    ctx.beginPath();
                    ctx.arc(p[i].x, p[i].y, r, 0, Math.PI * 2);
                    ctx.fill();
                }
                const t = p[THUMB_TIP];
                const x = p[INDEX_TIP];
                ctx.globalAlpha = 0.45 + hand.closeness * 0.55;
                ctx.strokeStyle = hand.pinched ? '#ffffff' : accent;
                ctx.shadowColor = hand.pinched ? '#ffffff' : accent;
                ctx.shadowBlur = (6 + hand.closeness * 16) * scale;
                ctx.lineWidth = (0.8 + hand.closeness * 1.6) * scale;
                ctx.setLineDash(hand.pinched ? [] : [4 * scale, 4 * scale]);
                ctx.beginPath();
                ctx.moveTo(t.x, t.y);
                ctx.lineTo(x.x, x.y);
                ctx.stroke();
                ctx.setLineDash([]);
                const cx = hand.x;
                const cy = hand.y;
                const ring = (17 - hand.closeness * 8) * scale;
                ctx.globalAlpha = 0.75 + hand.closeness * 0.25;
                ctx.strokeStyle = hand.pinched ? '#ffffff' : accent;
                ctx.shadowColor = hand.pinched ? '#ffffff' : accent;
                ctx.shadowBlur = 14 * scale;
                ctx.lineWidth = 1.5 * scale;
                ctx.beginPath();
                ctx.arc(cx, cy, ring, 0, Math.PI * 2);
                ctx.stroke();
                if (hand.pinched) {
                    ctx.globalAlpha = 0.28;
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(cx, cy, ring, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
                ctx.fillStyle = hand.pinched ? '#ffffff' : accent;
                ctx.shadowBlur = 10 * scale;
                ctx.beginPath();
                ctx.arc(cx, cy, (hand.pinched ? 4.2 : 3) * scale, 0, Math.PI * 2);
                ctx.fill();
                if (hand.gesture !== 'none') {
                    ctx.globalAlpha = 0.72;
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = accent;
                    ctx.font = `500 ${Math.round(9 * Math.min(scale, 1.4))}px ui-monospace, monospace`;
                    ctx.textAlign = 'center';
                    const tag = `${hand.handedness === 'right' ? 'RIGHT' : 'LEFT'} · ${hand.gesture.toUpperCase()}`;
                    ctx.fillText(tag, p[WRIST].x, p[WRIST].y + 22 * scale);
                }
            }
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
        };
        draw();
        return () => cancelAnimationFrame(raf.current);
    }, []);
    return <canvas ref={canvas} className="hands-canvas" aria-hidden="true"/>;
}
