import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../store';
const EXAMPLES = [
    'what happened in AI this week',
    'generate an image of the Mark Seven suit',
    'take a screenshot of my phone',
    "what's on my calendar tomorrow",
    'search for the best coffee near me',
    'read me the top story on Hacker News',
    'open my GitHub notifications',
    "summarise what's in my inbox",
    'find me a loading animation',
    "what's the weather looking like",
];
const ROTATE_MS = 4200;
export function Suggestions() {
    const phase = useStore((s) => s.phase);
    const turns = useStore((s) => s.turns);
    const [i, setI] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setI((n) => (n + 1) % EXAMPLES.length), ROTATE_MS);
        return () => clearInterval(id);
    }, []);
    if (phase !== 'dormant' || turns.length > 0)
        return null;
    return (<div className="suggest">
      <span className="suggest-lead">try</span>
      <AnimatePresence mode="wait">
        <motion.span key={i} className="suggest-text" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35 }}>
          “hey zimo, {EXAMPLES[i]}”
        </motion.span>
      </AnimatePresence>
    </div>);
}
