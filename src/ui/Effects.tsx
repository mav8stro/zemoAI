import { useEffect, useRef, useState } from 'react';
import { useStore, type UiEffect } from '../store';
const DURATION: Record<UiEffect['kind'], number> = {
    glitch: 620,
    pulse: 900,
    scan: 900,
    shake: 520,
    flash: 480,
};
export function Effects() {
    const effect = useStore((s) => s.ui.effect);
    const [live, setLive] = useState<UiEffect | null>(null);
    const root = useRef<HTMLDivElement | null>(null);
    const kind = effect?.kind;
    const at = effect?.at ?? 0;
    useEffect(() => {
        if (!kind)
            return;
        setLive({ kind, at });
        const done = setTimeout(() => setLive(null), DURATION[kind] ?? 600);
        return () => clearTimeout(done);
    }, [kind, at]);
    useEffect(() => {
        if (!live || live.kind !== 'shake')
            return;
        const hud = root.current?.closest('.hud');
        if (!hud)
            return;
        hud.classList.add('fx-shaking');
        const done = setTimeout(() => hud.classList.remove('fx-shaking'), DURATION.shake);
        return () => {
            clearTimeout(done);
            hud.classList.remove('fx-shaking');
        };
    }, [live]);
    if (!live)
        return null;
    return (<div className="fx" ref={root} aria-hidden="true">
      <div key={`${live.kind}-${live.at}`} className={`fx-play fx-${live.kind}`}>
        
        {live.kind === 'glitch' && (<>
            <span className="fx-slice"/>
            <span className="fx-slice"/>
            <span className="fx-slice"/>
          </>)}
        {live.kind === 'pulse' && (<>
            <span className="fx-wave"/>
            <span className="fx-wave"/>
          </>)}
      </div>
    </div>);
}
