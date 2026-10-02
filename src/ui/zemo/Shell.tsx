import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { BotAvatar } from 'bot-avatars';
import { Liquid } from 'liquid-gooey';
import { VoiceBeam } from 'voice-glow';
import { MetalFx } from 'metal-fx';
import { BorderBeam } from 'border-beam';
import { useStore, type Tab } from '../../store';
import { micLevel } from '../../lib/audio';
import { sendBrainChange, watchBrain } from '../../lib/bridge';
import { cycleVoice, currentVoiceName } from '../../lib/tts';
import './zemo.css';

type Orb = 'working' | 'searching' | 'solving' | 'listening' | 'connecting' | 'composing' | 'shaping';
const PETS = [
  { n: 'Asarp', mood: 'Calm', type: 'blob', color: '#ff8a3d' },
  { n: 'Koya', mood: 'Curious', type: 'blob', color: '#2f6bff' },
  { n: 'Munna', mood: 'Playful', type: 'clover', color: '#27c27a' },
  { n: 'Babu', mood: 'Focused', type: 'pebble', color: '#ff6fae' },
] as const;
const STYLES: [string, Orb][] = [['Auto', 'solving'], ['Particles', 'solving'], ['Orbit', 'searching'], ['Wave', 'listening'], ['Pulse', 'working'], ['Rings', 'connecting'], ['Dots', 'composing'], ['Sphere', 'shaping']];
const AUTO: Record<string, Orb> = { Thinking: 'shaping', Searching: 'searching', Listening: 'listening', Working: 'working', Generating: 'composing' };
const NAV: [string, Tab][] = [['Chat', 'home'], ['Agents', 'apps'], ['Tools', 'tools'], ['Knowledge', 'memory'], ['Files', 'files'], ['Settings', 'settings']];
const TOOLS = [['Web Search', 'Search the web in real-time'], ['File Analysis', 'Analyse PDFs, docs, images'], ['Image Generation', 'Create images with AI'], ['Data Analysis', 'Analyse and visualise data'], ['Code Assistant', 'Write, debug, explain code'], ['Summarize', 'Summarise long content'], ['Voice Mode', 'Talk with ZEMO'], ['Automation', 'Run tasks for you'], ['Planner', 'Turn ideas into action']];
const SETS = ['General', 'Appearance', 'AI Models', 'Voice', 'Companions', 'Thinking Animation', 'Privacy'];
const BRAINS = ['claude', 'gemini', 'kimi', 'hermes', 'ollama', 'qwen'];
const AGENTS = [['Researcher', 'Digs through the web and sources'], ['Coder', 'Writes, debugs and explains code'], ['Planner', 'Turns ideas into steps']];
const KEYS = [['Ctrl + Space', 'Open ZEMO Mini'], ['Ctrl + K', 'Search'], ['Esc', 'Close Mini'], ['Enter', 'Send'], ['Shift + Enter', 'New line'], ['Ctrl + /', 'Shortcuts']];

function useLS<T>(k: string, d: T): [T, (v: T) => void] {
  const [v, set] = useState<T>(() => { try { return JSON.parse(localStorage['zemo.' + k]) as T; } catch { return d; } });
  return [v, (x) => { set(x); try { localStorage['zemo.' + k] = JSON.stringify(x); } catch { /* ignore */ } }];
}

function Md({ text, toast }: { text: string; toast: (m: string) => void }) {
  const out: ReactNode[] = [];
  const re = /```(\w*)\n?([\s\S]*?)(```|$)/g;
  let i = 0, m: RegExpExecArray | null, k = 0;
  const inline = (s: string) => s.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((p, j) => p.startsWith('`') && p.length > 2 ? <code key={j}>{p.slice(1, -1)}</code> : p.startsWith('**') && p.length > 4 ? <b key={j}>{p.slice(2, -2)}</b> : p);
  while ((m = re.exec(text))) {
    if (m.index > i) out.push(<p key={k++}>{inline(text.slice(i, m.index).trim())}</p>);
    const code = m[2];
    out.push(<div key={k++} className="zm-code"><div><span>{m[1] || 'code'}</span><button onClick={() => { void navigator.clipboard?.writeText(code); toast('Copied'); }}>Copy</button></div><pre>{code}</pre></div>);
    i = m.index + m[0].length;
    if (!m[3]) break;
  }
  if (i < text.length) out.push(<p key={k++}>{inline(text.slice(i).trim())}</p>);
  return <div className="zm-md">{out}</div>;
}

export function Shell({ onSubmit, onStartVoice, onStart }: { onSubmit: (t: string) => void; onStartVoice: () => void; onStart: () => void }) {
  const phase = useStore((s) => s.phase);
  const tab = useStore((s) => s.activeTab);
  const setTab = useStore((s) => s.setActiveTab);
  const turns = useStore((s) => s.turns);
  const [text, setText] = useState('');
  const [plus, setPlus] = useState(false);
  const [pet, setPet] = useLS('pet', 1);
  const [style, setStyle] = useLS('style', 'Auto');
  const [theme, setTheme] = useLS('theme', 'dark');
  const [intensity, setIntensity] = useLS('intensity', 1);
  const [sec, setSec] = useState('Companions');
  const [mini, setMini] = useState(false);
  const [big, setBig] = useState(false);
  const [done, setDone] = useState(false);
  const [help, setHelp] = useState(false);
  const [msg, setMsg] = useState('');
  const [name, setName] = useLS('name', 'Salman');
  const [brain, setBrain] = useState('claude');
  const [pick, setPick] = useState(false);
  const [agent, setAgent] = useState('');
  const [files, setFiles] = useState<{ n: string; t: string }[]>([]);
  const [q, setQ] = useState('');
  const [voice, setVoice] = useState('');
  const fileIn = useRef<HTMLInputElement>(null);
  useEffect(() => { watchBrain((b) => setBrain(b)); }, []);
  const [rate, setRate] = useState<Record<string, number>>({});
  const search = useRef<HTMLInputElement>(null);
  const prev = useRef(phase);
  const P = PETS[pet] ?? PETS[1];
  const last = turns[turns.length - 1];
  const tools = last?.tools ?? [];
  const act = phase === 'listening' ? 'Listening' : phase === 'thinking' ? 'Thinking' : phase === 'tooling' ? (tools.some((t) => /search|web|fetch|browse/i.test(t)) ? 'Searching' : 'Working') : phase === 'speaking' ? 'Generating' : '';
  const sys = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && sys);
  const orb: Orb = style === 'Auto' ? AUTO[act] ?? 'solving' : (STYLES.find((s) => s[0] === style)?.[1] ?? 'solving');
  const toast = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 1600); };

  useEffect(() => {
    if (prev.current && ['thinking', 'tooling', 'speaking'].includes(prev.current) && phase === 'dormant') { setDone(true); const t = setTimeout(() => { setDone(false); setBig(false); }, 3000); prev.current = phase; return () => clearTimeout(t); }
    prev.current = phase;
  }, [phase]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'Space') { e.preventDefault(); setMini((v) => !v); }
      else if (e.ctrlKey && e.key === 'k') { e.preventDefault(); setMini(false); search.current?.focus(); }
      else if (e.ctrlKey && e.key === '/') { e.preventDefault(); setHelp((v) => !v); }
      else if (e.key === 'Escape') { setMini(false); setHelp(false); setBig(false); }
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, []);

  const avatar = (size: number, p = P, state: 'default' | 'working' | 'sleeping' = act ? 'working' : 'default') => <BotAvatar type={p.type} color={p.color} face="mouth" size={size} state={state} />;
  const label = act ? act + '…' : done ? 'Done ✓' : 'Idle';
  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const got: { n: string; t: string }[] = [];
    for (const f of Array.from(list).slice(0, 5)) got.push({ n: f.name, t: f.size > 100000 ? '(file too large, name only)' : await f.text().catch(() => '(binary file)') });
    setFiles((x) => [...x, ...got]); toast(got.length + ' file(s) attached');
  };
  const send = () => {
    const t = text.trim(); if (!t) return;
    const ctx = files.map((f) => '[File: ' + f.n + ']\n' + f.t.slice(0, 6000)).join('\n\n');
    onSubmit((agent ? '[Act as ' + agent + '] ' : '') + t + (ctx ? '\n\n' + ctx : ''));
    setText(''); setFiles([]);
  };
  const pickBrain = (b: string) => { sendBrainChange(b); setBrain(b); setPick(false); toast('Brain: ' + b); };
  const hits = q.trim() ? [
    ...NAV.filter((n) => n[0].toLowerCase().includes(q.toLowerCase())).map((n) => ({ k: 'Page', l: n[0], go: () => setTab(n[1]) })),
    ...TOOLS.filter((x) => x[0].toLowerCase().includes(q.toLowerCase())).map((x) => ({ k: 'Tool', l: x[0], go: () => { setTab('home'); onSubmit(x[0] + ': ' + x[1]); } })),
    ...turns.filter((x) => x.role === 'user' && x.text.toLowerCase().includes(q.toLowerCase())).slice(-4).map((x) => ({ k: 'Chat', l: x.text.slice(0, 50), go: () => setTab('home') })),
  ].slice(0, 7) : [];
  const lastUser = [...turns].reverse().find((t) => t.role === 'user')?.text;

  if (phase === 'offline' || phase === 'boot') {
    return (
      <div className={'zm-splash ' + (dark ? '' : 'light')}>
        <div className="zm-ring">{avatar(120, P, 'default')}</div>
        <h1>ZEMO</h1><p>Your Personal AI Assistant</p>
        {phase === 'offline' ? <MetalFx preset="chromatic" variant="button" theme={dark ? 'dark' : 'light'}><button className="zm-btn" onClick={onStart}>Start</button></MetalFx> : <div className="zm-bar"><i /></div>}
        {phase === 'boot' && <small>Loading your universe…</small>}
      </div>
    );
  }

  const capsule = (mini || act || done) && (
    <div className={'zm-island' + (big ? ' big' : '')} onClick={() => setBig(!big)} style={{ animationDuration: 0.25 / intensity + 's' }}>
      <div className="zm-row">{avatar(30)}<span>{P.n} · {label}</span><span style={{ flex: 1 }} />
        <button className="zm-ic" onClick={(e) => { e.stopPropagation(); onStartVoice(); }} aria-label="Microphone">🎙</button>
        <button className="zm-ic" onClick={(e) => { e.stopPropagation(); setMini(false); setBig(false); setDone(false); }} aria-label="Close">✕</button></div>
      {big && <div className="zm-short">{lastUser && <small>{lastUser}</small>}<p>{[...turns].reverse().find((t) => t.role === 'zimo')?.text.slice(0, 220) || 'Ask me anything.'}</p></div>}
    </div>
  );
  if (mini) return <div className={'zm zm-mini ' + (dark ? '' : 'light')}>{capsule}{msg && <div className="zm-toast">{msg}</div>}</div>;

  let body: ReactNode;
  if (tab === 'tools') {
    body = <div className="zm-page"><h2>Tools</h2><div className="zm-grid">{TOOLS.map(([a, b]) => <button key={a} className="zm-tool" onClick={() => { setTab('home'); onSubmit(a + ': ' + b); }}><b>{a}</b><span>{b}</span></button>)}</div></div>;
  } else if (tab === 'settings') {
    const pane: Record<string, ReactNode> = {
      Companions: <><p className="zm-mut">Choose your companion.</p><div className="zm-pets">{PETS.map((p, i) => <button key={p.n} className={'zm-pet' + (i === pet ? ' on' : '')} onClick={() => { setPet(i); toast(p.n + ' selected'); }}>{avatar(56, p, 'default')}<b>{p.n}</b><small>{p.mood}</small></button>)}</div></>,
      'Thinking Animation': <div className="zm-pets">{STYLES.map(([n, o]) => <button key={n} className={'zm-pet' + (style === n ? ' on' : '')} onClick={() => setStyle(n)}><ThinkingOrb state={o} size={64} theme={dark ? 'dark' : 'light'} /><small>{n}</small></button>)}</div>,
      General: <><p className="zm-mut">Your name</p><input className="zm-search" style={{ maxWidth: 260 }} value={name} onChange={(e) => setName(e.target.value)} /></>,
      'AI Models': <><p className="zm-mut">Brain (switches the bridge live)</p><div className="zm-states">{BRAINS.map((b) => <button key={b} className={'zm-chip' + (brain === b ? ' on' : '')} onClick={() => pickBrain(b)}>{b}</button>)}</div></>,
      Voice: <><p className="zm-mut">Voice: {voice || currentVoiceName()}</p><div className="zm-states"><button className="zm-chip" onClick={() => setVoice(cycleVoice())}>Next voice</button><button className="zm-chip" onClick={onStartVoice}>Test microphone</button></div></>,
      Privacy: <><p className="zm-mut">Conversations stay in this window until cleared.</p><button className="zm-chip" style={{ alignSelf: 'flex-start' }} onClick={() => { useStore.setState({ turns: [] }); setFiles([]); toast('History cleared'); }}>Clear history</button></>,
      Appearance: <><p className="zm-mut">Theme</p><div className="zm-states">{['dark', 'light', 'system'].map((t) => <button key={t} className={'zm-chip' + (theme === t ? ' on' : '')} onClick={() => setTheme(t)}>{t}</button>)}</div><p className="zm-mut">Animation intensity</p><input type="range" min="0.5" max="2" step="0.25" value={intensity} onChange={(e) => setIntensity(+e.target.value)} /></>,
    };
    body = <div className="zm-page"><h2>Settings</h2><div className="zm-states">{SETS.map((s) => <button key={s} className={'zm-chip' + (sec === s ? ' on' : '')} onClick={() => setSec(s)}>{s}</button>)}</div>{pane[sec] ?? <p className="zm-mut">{sec} options will appear here.</p>}</div>;
  } else if (tab === 'apps') {
    body = <div className="zm-page"><h2>Agents</h2><p className="zm-mut">Pick one and it shapes your next messages.</p><div className="zm-grid">{AGENTS.map(([a, b]) => <button key={a} className={'zm-tool' + (agent === a ? ' sel' : '')} onClick={() => { setAgent(agent === a ? '' : a); setTab('home'); toast(agent === a ? 'Agent off' : a + ' active'); }}><b>{a}</b><span style={{ maxHeight: 40, opacity: 1, marginTop: 4 }}>{b}</span></button>)}</div></div>;
  } else if (tab === 'memory') {
    const mine = turns.filter((x) => x.role === 'user');
    body = <div className="zm-page"><h2>Knowledge</h2><p className="zm-mut">Your recent questions. Click to ask again.</p>{!mine.length && <p className="zm-mut">Nothing yet.</p>}{[...mine].reverse().map((x) => <button key={x.id} className="zm-tool" onClick={() => { setText(x.text); setTab('home'); }}>{x.text.slice(0, 120)}</button>)}</div>;
  } else if (tab === 'files') {
    body = <div className="zm-page"><h2>Files</h2><p className="zm-mut">Attached files go with your next message.</p><button className="zm-chip" style={{ alignSelf: 'flex-start' }} onClick={() => fileIn.current?.click()}>Choose files</button>{files.map((f, i) => <div key={i} className="zm-row"><span style={{ flex: 1 }}>{f.n}</span><button className="zm-chip" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button></div>)}{!!files.length && <button className="zm-chip" style={{ alignSelf: 'flex-start' }} onClick={() => setTab('home')}>Go to chat</button>}</div>;
  } else if (tab !== 'home') {
    body = <div className="zm-page"><h2>ZEMO</h2></div>;
  } else {
    body = <div className="zm-chat">
      {!turns.length && <div className="zm-hello"><p>Good day,</p><h1>{name} 👋</h1><p>How can I help you today?</p></div>}
      {turns.map((t, i) => t.role === 'user'
        ? <div key={t.id} className="zm-u">{t.text}</div>
        : <div key={t.id} className="zm-b">{avatar(34, P, i === turns.length - 1 && act ? 'working' : 'default')}<div className="zm-bt">
            {t.text ? <Md text={t.text} toast={toast} /> : null}
            {t.tools?.length ? <div className="zm-src">{t.tools.map((x) => <span key={x}>{x}</span>)}</div> : null}
            {!(i === turns.length - 1 && act) && t.text && <div className="zm-act">
              <button onClick={() => { void navigator.clipboard?.writeText(t.text); toast('Copied'); }}>Copy</button>
              <button onClick={() => lastUser && onSubmit(lastUser)}>Regenerate</button>
              <button className={rate[t.id] === 1 ? 'on' : ''} onClick={() => setRate({ ...rate, [t.id]: 1 })}>👍</button>
              <button className={rate[t.id] === -1 ? 'on' : ''} onClick={() => setRate({ ...rate, [t.id]: -1 })}>👎</button></div>}
          </div></div>)}
      {act && <div className="zm-live"><ThinkingOrb state={orb} size={64} theme={dark ? 'dark' : 'light'} speed={intensity} /><b>{P.n} · {act}…</b></div>}
    </div>;
  }

  return (
    <div className={'zm ' + (dark ? '' : 'light')}>
      {capsule}
      <aside className="zm-side">
        <div className="zm-logo">ZEMO</div>
        {NAV.map(([l, t]) => <button key={l} className={'zm-nav' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>{l}</button>)}
        <div className="zm-user"><span className="zm-av">{name.slice(0, 1).toUpperCase()}</span><div>{name}<small>{brain}</small></div></div>
      </aside>
      <main className="zm-main">
        <div className="zm-top"><div style={{ position: 'relative', flex: '0 1 320px', marginRight: 'auto' }}><input ref={search} className="zm-search" style={{ width: '100%' }} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) { hits[0].go(); setQ(''); } if (e.key === 'Escape') setQ(''); }} placeholder="Search  (Ctrl K)" />{!!hits.length && <div className="zm-drop">{hits.map((h, i) => <button key={i} onClick={() => { h.go(); setQ(''); }}><small>{h.k}</small> {h.l}</button>)}</div>}</div>
          <button className="zm-ic" title="Mini (Ctrl Space)" onClick={() => setMini(true)}>⌄</button>
          <button className="zm-ic" title="Shortcuts (Ctrl /)" onClick={() => setHelp(true)}>?</button></div>
        {body}
        {tab === 'home' && <VoiceBeam level={() => micLevel()} processing={!!act && act !== 'Listening'} active={!!act} strength={act ? 0.8 : 0} theme={dark ? 'dark' : 'light'}>
          <BorderBeam size="md" colorVariant="ocean" strength={0.6} active={!!act} theme={dark ? 'dark' : 'light'}>
            <div className="zm-comp">
              {(agent || files.length > 0) && <div className="zm-states" style={{ paddingBottom: 6 }}>{agent && <button className="zm-chip on" onClick={() => setAgent('')}>{agent} ✕</button>}{files.map((f, i) => <button key={i} className="zm-chip" onClick={() => setFiles(files.filter((_, j) => j !== i))}>{f.n} ✕</button>)}</div>}
              <textarea rows={1} value={text} placeholder="Ask ZEMO anything…" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
              <div className="zm-row">
                <Liquid blur={6} contrast={18} fill={dark ? '#1b2238' : '#e9dcc8'}>
                  <Liquid.Item x={0} y={0} transition="bouncy"><button className="zm-plus" aria-label="Attach" onClick={() => setPlus(!plus)}>+</button></Liquid.Item>
                  <Liquid.Item x={plus ? 44 : 0} y={0} transition="bouncy"><button className="zm-plus" aria-label="Research" onClick={() => { setText('Research '); setPlus(false); }}>🔍</button></Liquid.Item>
                  <Liquid.Item x={plus ? 88 : 0} y={0} transition="bouncy"><button className="zm-plus" aria-label="Code" onClick={() => { setText('Code '); setPlus(false); }}>{'</>'}</button></Liquid.Item>
                  <Liquid.Item x={plus ? 132 : 0} y={0} transition="bouncy"><button className="zm-plus" aria-label="Attach file" onClick={() => { fileIn.current?.click(); setPlus(false); }}>📎</button></Liquid.Item>
                </Liquid>
                <span style={{ flex: 1 }} />
                <span style={{ position: 'relative' }}><button className="zm-model" onClick={() => setPick(!pick)}>{brain} ⌄</button>{pick && <div className="zm-drop up">{BRAINS.map((b) => <button key={b} onClick={() => pickBrain(b)}>{b}</button>)}</div>}</span>
                <button className="zm-ic" aria-label="Microphone" onClick={onStartVoice}>🎙</button>
                <MetalFx preset="chromatic" variant="circle" theme={dark ? 'dark' : 'light'}><button className="zm-send" aria-label="Send" onClick={send}>↑</button></MetalFx>
              </div>
            </div>
          </BorderBeam>
        </VoiceBeam>}
      </main>
      <input ref={fileIn} type="file" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
      {help && <div className="zm-modal" onClick={() => setHelp(false)}><div className="zm-card2">{KEYS.map(([a, b]) => <div key={a} className="zm-row"><kbd>{a}</kbd><span>{b}</span></div>)}</div></div>}
      {msg && <div className="zm-toast">{msg}</div>}
    </div>
  );
}
