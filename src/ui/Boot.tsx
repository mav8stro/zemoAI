import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useStore } from '../store';

const T = { rings: 2600, suit: 5200, reactor: 7200 };

const LOG = [
  'CORE // QUANTUM KERNEL (X64) .................. ONLINE',
  'NEURAL // GEMINI 2.5 FLASH ULTRA MATRIX ........ SYNCED (12ms)',
  'VOICE // ACOUSTIC SPECTRAL SYNTHESIS .......... ARMED',
  'VISION // MEDIAPIPE SPATIAL SENSORS ............ ACTIVE',
  'MEMORY // PERSISTENT VECTOR REPOSITORY ......... LOADED',
  'SYSTEM // PROTOCOL 9.4 ZERO ERROR CHECKSUM ..... 100% OK'
];

type Stage = 'bar' | 'rings' | 'suit' | 'reactor';

export function Boot() {
  const phase = useStore((s) => s.phase);
  const reduced = useReducedMotion();
  const [t, setT] = useState(0);

  useEffect(() => {
    if (phase !== 'boot') {
      setT(0);
      return;
    }
    const start = Date.now();
    setT(0);
    const id = setInterval(() => setT(Date.now() - start), 50);
    return () => clearInterval(id);
  }, [phase]);

  if (phase !== 'boot') return null;

  const stage: Stage = t >= T.reactor ? 'reactor' : t >= T.suit ? 'suit' : t >= T.rings ? 'rings' : 'bar';
  const logShown = Math.min(LOG.length, Math.floor((t / T.rings) * (LOG.length + 1)));
  const barPct = Math.min(1, t / (T.rings - 300));
  const progressPercent = Math.min(100, Math.round(barPct * 100));

  return (
    <AnimatePresence>
      <motion.div
        className="boot"
        initial={{ opacity: 1 }}
        exit={{ opacity: 0, filter: 'blur(12px)' }}
        transition={{ duration: 0.8 }}
      >
        <div className={`boot-bar ${stage !== 'bar' ? 'boot-bar-dim' : ''}`}>
          <div className="boot-bar-frame">
            <div className="boot-bar-top-row">
              <span className="boot-bar-title">
                NEURAL CORE INITIALIZATION // PROTOCOL 9.4
                <span className="boot-cursor" />
              </span>
              <span className="boot-bar-percentage">
                {progressPercent}% <span className="boot-bar-status">[SYNCING]</span>
              </span>
            </div>
            <div className="boot-seg">
              {Array.from({ length: 28 }, (_, i) => (
                <span
                  key={i}
                  className="boot-seg-cell"
                  data-on={i / 28 < barPct ? '1' : '0'}
                />
              ))}
            </div>
          </div>
          <div className="boot-log">
            {LOG.slice(0, logShown).map((l, i) => (
              <div key={i} className="boot-log-line">
                {l}
              </div>
            ))}
          </div>
        </div>

        <div className="boot-stage">
          {stage === 'rings' && <Rings reduced={!!reduced} />}
          {stage === 'suit' && <Suit reduced={!!reduced} />}
          {stage === 'reactor' && <Reactor reduced={!!reduced} t={t - T.reactor} />}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function Rings({ reduced }: { reduced: boolean }) {
  const ease = 'easeOut';
  const ring = (r: number, delay: number, dash: string, w = 1.2) => (
    <motion.circle
      cx="0"
      cy="0"
      r={r}
      className="boot-ring"
      strokeDasharray={dash}
      strokeWidth={w}
      initial={reduced ? { opacity: 1 } : { opacity: 0, rotate: -60, scale: 1.2 }}
      animate={{ opacity: 1, rotate: 0, scale: 1 }}
      transition={{ duration: 0.8, delay, ease }}
    />
  );

  return (
    <svg className="boot-rings" viewBox="-180 -180 360 360">
      <g>
        {ring(160, 0.0, '6 8 2 8', 1.5)}
        {ring(138, 0.08, '50 10 16 10', 1.8)}
        {ring(114, 0.16, '3 6')}
        {ring(92, 0.24, '36 8 8 8', 2)}
        {ring(68, 0.32, '2 4')}
        {ring(46, 0.40, '14 6 4 6', 1.5)}
      </g>
      <circle cx="0" cy="0" r="172" className="boot-ring boot-ring-subtle" strokeDasharray="1 12" />
      <image
        href="/assets/zemo-logo.png"
        x="-36"
        y="-64"
        width="72"
        height="72"
        style={{ filter: 'drop-shadow(0 0 14px #00ffc4)' }}
      />
      <motion.text
        x="0"
        y="26"
        className="boot-name"
        initial={reduced ? { opacity: 1 } : { opacity: 0, letterSpacing: '1.2em' }}
        animate={{ opacity: 1, letterSpacing: '0.45em' }}
        transition={{ duration: 0.7, delay: 0.45, ease }}
      >
        Z.E.M.O
      </motion.text>
      <motion.text
        x="0"
        y="46"
        className="boot-sub-name"
        initial={reduced ? { opacity: 1 } : { opacity: 0 }}
        animate={{ opacity: 0.7 }}
        transition={{ duration: 0.7, delay: 0.65 }}
      >
        NEURAL QUANTUM CORE
      </motion.text>
    </svg>
  );
}

function Suit({ reduced }: { reduced: boolean }) {
  return (
    <svg className="boot-suit" viewBox="-220 -160 440 320">
      <motion.g
        className="boot-suit-fig"
        initial={reduced ? { opacity: 1 } : { opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
      >
        <motion.path
          className="boot-wire"
          d="M0,-125 L32,-115 L62,-75 L80,-20 L68,45 L42,105 L0,128 L-42,105 L-68,45 L-80,-20 L-62,-75 L-32,-115 Z"
          initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: 'easeInOut' }}
        />
        <path
          className="boot-wire boot-wire-dim"
          d="M0,-105 L24,-98 L48,-65 L60,-15 L50,38 L32,85 L0,105 L-32,85 L-50,38 L-60,-15 L-48,-65 L-24,-98 Z"
        />
        <path
          className="boot-wire boot-wire-accent"
          d="M-55,-10 L-25,-10 L-15,15 L-35,35 Z M55,-10 L25,-10 L15,15 L35,35 Z"
        />
        
        <circle className="boot-wire boot-core-ring" cx="0" cy="-5" r="28" strokeWidth="2.5" />
        <circle className="boot-wire boot-core-inner" cx="0" cy="-5" r="16" strokeDasharray="6 4" />
        <circle className="boot-wire boot-core-glow" cx="0" cy="-5" r="8" fill="var(--accent)" />
        <line x1="-38" y1="-5" x2="38" y2="-5" className="boot-wire boot-wire-dim" />
        <line x1="0" y1="-43" x2="0" y2="33" className="boot-wire boot-wire-dim" />

        <circle cx="0" cy="-125" r="3" className="boot-node" />
        <circle cx="0" cy="128" r="3" className="boot-node" />
        <circle cx="-80" cy="-20" r="3" className="boot-node" />
        <circle cx="80" cy="-20" r="3" className="boot-node" />
      </motion.g>

      {[-165, 165].map((x, i) => (
        <motion.g
          key={x}
          className="boot-callout"
          initial={reduced ? { opacity: 1 } : { opacity: 0, x: x > 0 ? 30 : -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 + i * 0.15 }}
        >
          <circle className="boot-wire" cx={x} cy="-8" r="30" strokeDasharray="36 6 8 6" />
          <circle className="boot-wire boot-wire-dim" cx={x} cy="-8" r="18" strokeDasharray="4 4" />
          <circle className="boot-wire" cx={x} cy="-8" r="4" fill="var(--accent)" />
          <path
            className="boot-wire boot-wire-dim"
            d={x > 0 ? `M${x - 30},-8 L75,-8` : `M${x + 30},-8 L-75,-8`}
          />
        </motion.g>
      ))}

      <text x="-165" y="38" className="boot-tag">ARC // PWR 100%</text>
      <text x="-165" y="52" className="boot-tag-sub">SYS_CORE // OPTIMAL</text>
      <text x="165" y="38" className="boot-tag">MK-85 // MATRIX</text>
      <text x="165" y="52" className="boot-tag-sub">NEURAL // SYNCED</text>
    </svg>
  );
}

function Reactor({ reduced, t }: { reduced: boolean; t: number }) {
  const glow = reduced ? 1 : Math.min(1, Math.max(0, t / 1400));
  const seg = Array.from({ length: 24 }, (_, i) => i);

  return (
    <svg className="boot-reactor" viewBox="-130 -130 260 260" style={{ ['--glow' as string]: glow }}>
      {seg.map((i) => {
        const a = (i / seg.length) * Math.PI * 2 - Math.PI / 2;
        const on = i / seg.length < glow * 1.05;
        return (
          <line
            key={i}
            x1={Math.cos(a) * 76}
            y1={Math.sin(a) * 76}
            x2={Math.cos(a) * 108}
            y2={Math.sin(a) * 108}
            className={on ? 'boot-r-seg boot-r-on' : 'boot-r-seg'}
          />
        );
      })}
      <circle className="boot-r-ring" cx="0" cy="0" r="112" strokeWidth="2" />
      <circle className="boot-r-ring boot-r-ring-in" cx="0" cy="0" r="72" strokeDasharray="8 6" />
      <path className="boot-r-tri" d="M0,-58 L52,32 L-52,32 Z" />
      <path className="boot-r-tri boot-r-tri-in" d="M0,-34 L32,22 L-32,22 Z" />
      <circle cx="0" cy="4" r="12" fill="var(--accent)" opacity={glow * 0.9} />
    </svg>
  );
}
