import { useEffect, useRef, useState, type ReactElement } from 'react';
import { env } from '../config';
import { useStore, type Tab } from '../store';
import { ChatView } from './views/ChatView';
import { VoiceView } from './views/VoiceView';
import { ToolsView } from './views/ToolsView';
import { MemoryView } from './views/MemoryView';
import { FilesView } from './views/FilesView';
import { AppsView } from './views/AppsView';
import { SettingsView } from './views/SettingsView';

type NavItem = {
  id: Tab;
  label: string;
  badge?: string;
  icon: (p: { active: boolean }) => ReactElement;
};

type ActionDef = {
  id: string;
  label: string;
  hint: string;
  tag: string;
  starter: string;
  icon: () => ReactElement;
};

function IHome({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
      <path d="M4 11.5 12 4l8 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10.5V20h12v-9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IChat() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 6h16v10H9l-4 3.5V16H4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IVoice() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
    </svg>
  );
}

function ITools() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IMemory() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
      <ellipse cx="12" cy="6" rx="7" ry="2.6" />
      <path d="M5 6v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6M5 12v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-6" strokeLinecap="round" />
    </svg>
  );
}

function IFiles() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h4l2 2h7A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z" strokeLinejoin="round" />
    </svg>
  );
}

function IApps() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="6" cy="6" r="2" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="6" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="18" cy="12" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="12" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}

function ISettings() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.4M12 18.6V21M21 12h-2.4M5.4 12H3M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" strokeLinecap="round" />
    </svg>
  );
}

function IReasoning() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04Z" />
    </svg>
  );
}

function IWeb() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9" />
      <path d="M3.6 9h16.8M3.6 15h16.8M11.5 3a17 17 0 0 0 0 18M12.5 3a17 17 0 0 1 0 18" />
    </svg>
  );
}

function IVision() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

function ISystem() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="m7 8 3 3-3 3M13 14h4M8 21h8M12 17v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IRecall() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
      <circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity="0.2" />
    </svg>
  );
}


function ISend() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 12 20 4l-5.5 16-3-6.5L4 12Z" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function IMic() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="9.5" y="3.5" width="5" height="9" rx="2.5" />
      <path d="M6.5 11a5.5 5.5 0 0 0 11 0M12 16.5v3" strokeLinecap="round" />
    </svg>
  );
}

const NAV: NavItem[] = [
  { id: 'home', label: 'Console', icon: IHome },
  { id: 'chat', label: 'Neural Chat', badge: 'LIVE', icon: IChat },
  { id: 'voice', label: 'Voice Array', icon: IVoice },
  { id: 'tools', label: 'Skills & MCP', badge: '6', icon: ITools },
  { id: 'memory', label: 'Memory Vault', icon: IMemory },
  { id: 'files', label: 'Explorer', icon: IFiles },
  { id: 'apps', label: 'Subsystems', icon: IApps },
  { id: 'settings', label: 'System Config', icon: ISettings },
];

const LEFT_ACTIONS: ActionDef[] = [
  {
    id: 'whatsapp',
    label: 'WhatsApp Automations',
    hint: 'Direct WhatsApp launcher, messaging & contact automation',
    tag: 'MESSAGING',
    starter: 'Open WhatsApp and check messages.',
    icon: IChat,
  },
  {
    id: 'search',
    label: 'Device & Google Search',
    hint: 'Instant local file discovery & live web search',
    tag: 'SEARCH',
    starter: 'Search Google for the latest tech news.',
    icon: IWeb,
  },
  {
    id: 'vision',
    label: 'Visual Cyber-Vision',
    hint: 'Webcam spatial detection, gesture & object analysis',
    tag: 'SPATIAL AI',
    starter: 'Activate camera vision and describe what you see in the frame.',
    icon: IVision,
  },
];

const RIGHT_ACTIONS: ActionDef[] = [
  {
    id: 'reasoning',
    label: 'Deep Intelligence',
    hint: 'Multi-step logic synthesis & complex problem solving',
    tag: 'REASONING',
    starter: 'Analyze and provide a strategic solution for: ',
    icon: IReasoning,
  },
  {
    id: 'memory',
    label: 'Semantic Memory Vault',
    hint: 'Long-term preferences, user profile & project recall',
    tag: 'PERSISTENT',
    starter: 'What facts and preferences do you remember about me?',
    icon: IRecall,
  },
  {
    id: 'system',
    label: 'Desktop Shell & MCP',
    hint: 'Windows task automation, process inspection & files',
    tag: 'DESKTOP',
    starter: 'Run a system diagnostic check and inspect running processes.',
    icon: ISystem,
  },
];

const QUICK_CHIPS = [
  { label: '✦ WhatsApp', starter: 'Open WhatsApp and check my messages.' },
  { label: '✦ Google Search', starter: 'Search Google for the latest artificial intelligence news.' },
  { label: '✦ Daily Briefing', starter: 'Run daily briefing and summarize today’s agenda.' },
  { label: '✦ System Health', starter: 'Check system health, memory, and running processes.' },
  { label: '✦ Camera Vision', starter: 'Activate camera vision and describe what you see.' },
  { label: '✦ Code Review', starter: 'Perform a comprehensive code review of this project.' },
];

function ActionCard({
  action,
  onPick,
}: {
  action: ActionDef;
  onPick: (starter: string) => void;
}) {
  const Icon = action.icon;
  return (
    <button className="home-action" onClick={() => onPick(action.starter)}>
      <span className="home-action-icon">
        <Icon />
      </span>
      <span className="home-action-copy">
        <div className="home-action-head">
          <span className="home-action-label">{action.label}</span>
          <span className="home-action-tag">{action.tag}</span>
        </div>
        <span className="home-action-hint">{action.hint}</span>
      </span>
      <span className="home-action-chevron">›</span>
    </button>
  );
}

export function Home({
  onSubmit,
  onStartVoice,
}: {
  onSubmit: (text: string) => void;
  onStartVoice?: () => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const [draft, setDraft] = useState('');
  const active = useStore((s) => s.activeTab);
  const setActive = useStore((s) => s.setActiveTab);
  const language = useStore((s) => s.language);
  const toggleLanguage = useStore((s) => s.toggleLanguage);
  const setScreenToolOpen = useStore((s) => s.setScreenToolOpen);
  const setAdminModalOpen = useStore((s) => s.setAdminModalOpen);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onSubmit(text);
    setDraft('');
  };

  const fillAndFocus = (starter: string) => {
    if (!starter) {
      setActive('apps');
      return;
    }
    setDraft(starter);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(starter.length, starter.length);
    });
  };

  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  const timeLabel = now.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
  const name = env.userName;

  return (
    <div className="home">
      <nav className="home-rail">
        <div className="home-rail-brand">
          <div className="home-brand-row">
            <div className="home-brand-logo-wrap">
              <img src="/assets/zemo-logo.png" alt="ZEMO Logo" className="home-brand-penguin" />
              <span className="home-rail-mark">Z.E.M.O</span>
            </div>
            <span className="home-live-pulse" title="System Operational">● ONLINE</span>
          </div>
          <span className="home-rail-sub">AUTONOMOUS NEURAL MATRIX</span>
        </div>
        <ul className="home-rail-nav">
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <li key={item.id}>
                <button
                  className={`home-rail-item${isActive ? ' is-active' : ''}`}
                  onClick={() => setActive(item.id)}
                  title={item.label}
                >
                  <Icon active={isActive} />
                  <span>{item.label}</span>
                  {item.badge && <span className="home-rail-badge">{item.badge}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {active === 'home' && (
        <div className="home-stage">
          <header className="home-header">
            <div>
              <div className="home-greeting-pill">SYSTEM PROTOCOL 9.4 // HIGH PRIORITY</div>
              <h1 className="home-greeting">
                Hello{name && <>, <span className="home-greeting-name">{name}</span></>}
              </h1>
              <p className="home-tagline">
                Zero Error Machine Operator · Neural Assistant Matrix Online
              </p>
            </div>
            
            <div className="home-status-cluster">
              <button
                className="home-telemetry-badge interactive"
                onClick={toggleLanguage}
                title="Toggle Language (Alt+L)"
              >
                <span className="home-telemetry-key">LANG [ALT+L]</span>
                <span className="home-telemetry-val">{language === 'ml' ? '🌐 MALAYALAM' : '🌐 ENGLISH'}</span>
              </button>
              <div className="home-telemetry-badge">
                <span className="home-telemetry-key">NEURAL CORE</span>
                <span className="home-telemetry-val">CNN + RNN HYBRID</span>
              </div>
              <div className="home-telemetry-badge">
                <span className="home-telemetry-key">LATENCY</span>
                <span className="home-telemetry-val">12ms // SYNCED</span>
              </div>
              <div className="home-clock" aria-hidden>
                <span className="home-clock-date">{dateLabel}</span>
                <span className="home-clock-time">{timeLabel}</span>
              </div>
            </div>
          </header>

          <div className="home-columns">
            <div className="home-column">
              {LEFT_ACTIONS.map((a) => (
                <ActionCard key={a.id} action={a} onPick={fillAndFocus} />
              ))}
            </div>
            <div className="home-orb-gap" aria-hidden />
            <div className="home-column">
              {RIGHT_ACTIONS.map((a) => (
                <ActionCard key={a.id} action={a} onPick={fillAndFocus} />
              ))}
            </div>
          </div>

          <div className="home-chips-row">
            {QUICK_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                className="home-chip"
                onClick={() => fillAndFocus(chip.starter)}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <form
            className="home-composer"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <span
              className="home-composer-mic"
              style={{ cursor: onStartVoice ? 'pointer' : 'default' }}
              onClick={onStartVoice}
              title={onStartVoice ? 'Click to speak' : undefined}
            >
              <IMic />
            </span>
            <input
              ref={inputRef}
              className="home-composer-input"
              placeholder="Ask ZEMO anything, or type a command..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoComplete="off"
            />
            <button
              type="submit"
              className="home-composer-send"
              disabled={!draft.trim()}
              aria-label="Send"
            >
              <ISend />
            </button>
          </form>

          <div className="home-action-bar">
            <button className="home-sub-btn" onClick={() => setScreenToolOpen(true)}>
              ⛶ Screen Reader & Modifier
            </button>
            <span className="home-bar-sep">·</span>
            <button className="home-sub-btn" onClick={() => setAdminModalOpen(true)}>
              🛡 Admin Access & Privacy Policies
            </button>
            <span className="home-bar-sep">·</span>
            <button className="home-sub-btn" onClick={toggleLanguage}>
              {language === 'ml' ? '🌐 Switch to English' : '🌐 Switch to മലയാളം'}
            </button>
          </div>
        </div>
      )}

      {active === 'chat' && <ChatView onSubmit={onSubmit} onStartVoice={onStartVoice} />}
      {active === 'voice' && <VoiceView onStartVoice={onStartVoice} />}
      {active === 'tools' && <ToolsView onSubmit={onSubmit} />}
      {active === 'memory' && <MemoryView />}
      {active === 'files' && <FilesView onSubmit={onSubmit} />}
      {active === 'apps' && <AppsView />}
      {active === 'settings' && <SettingsView />}
    </div>
  );
}
