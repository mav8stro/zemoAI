import { useCallback, useEffect, useState } from 'react';
import { BRIDGE_HTTP_URL, withToken } from '../../config';
interface MemoryFact {
    text: string;
    at?: string;
}
const DEFAULT_FACTS: MemoryFact[] = [
    { text: 'Operator identity: Lenovo', at: new Date().toISOString() },
    { text: 'Voice preference: Siri-speed, punchy 1-2 sentence replies', at: new Date().toISOString() },
    { text: 'Target OS: Windows 11 Desktop (x64)', at: new Date().toISOString() },
    { text: 'Default low-latency brain: Google Gemini 2.5 Flash Lite', at: new Date().toISOString() },
];
export function MemoryView() {
    const [facts, setFacts] = useState<MemoryFact[]>([]);
    const [query, setQuery] = useState('');
    const [newFact, setNewFact] = useState('');
    const [loading, setLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState<string | null>(null);
    const loadFacts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(withToken(`${BRIDGE_HTTP_URL}/api/memory`));
            if (res.ok) {
                const data = await res.json();
                if (data.facts && Array.isArray(data.facts)) {
                    const loaded = data.facts.length > 0 ? data.facts : DEFAULT_FACTS;
                    setFacts(loaded);
                    localStorage.setItem('zemo_facts', JSON.stringify(loaded));
                    setLoading(false);
                    return;
                }
            }
        }
        catch { }
        const local = localStorage.getItem('zemo_facts');
        if (local) {
            try {
                setFacts(JSON.parse(local));
                setLoading(false);
                return;
            }
            catch { }
        }
        setFacts(DEFAULT_FACTS);
        localStorage.setItem('zemo_facts', JSON.stringify(DEFAULT_FACTS));
        setLoading(false);
    }, []);
    useEffect(() => {
        loadFacts();
    }, [loadFacts]);
    const notify = (msg: string) => {
        setStatusMsg(msg);
        setTimeout(() => setStatusMsg(null), 3000);
    };
    const handleAddFact = async () => {
        const text = newFact.trim();
        if (!text)
            return;
        const newEntry: MemoryFact = { text, at: new Date().toISOString() };
        const updated = [newEntry, ...facts];
        setFacts(updated);
        localStorage.setItem('zemo_facts', JSON.stringify(updated));
        setNewFact('');
        notify('Fact saved to persistent memory');
        try {
            await fetch(withToken(`${BRIDGE_HTTP_URL}/api/memory`), {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ fact: text }),
            });
        }
        catch { }
    };
    const handleDeleteFact = async (text: string) => {
        const updated = facts.filter((f) => f.text !== text);
        setFacts(updated);
        localStorage.setItem('zemo_facts', JSON.stringify(updated));
        notify('Memory removed');
        try {
            await fetch(withToken(`${BRIDGE_HTTP_URL}/api/memory`), {
                method: 'DELETE',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ needle: text }),
            });
        }
        catch { }
    };
    const filtered = facts.filter((f) => f.text.toLowerCase().includes(query.toLowerCase()));
    return (<div className="view-stage memory-view">
      <header className="view-header">
        <div>
          <div className="view-tag">LONG-TERM COGNITION</div>
          <h2 className="view-title">Memory Vault & Learned Facts</h2>
        </div>
        <div className="view-header-actions">
          {statusMsg && <span className="view-notice">{statusMsg}</span>}
          <span className="view-badge">
            <span className="view-badge-dot"/>
            {facts.length} Stored Memories
          </span>
          <button className="view-btn view-btn-ghost" onClick={loadFacts} disabled={loading}>
            Sync
          </button>
        </div>
      </header>

    <div className="memory-add-card">
        <h4 className="section-title">STORE NEW KNOWLEDGE OR DIRECTIVE</h4>
        <form className="memory-add-form" onSubmit={(e) => {
            e.preventDefault();
            handleAddFact();
        }}>
          <input className="memory-input" placeholder="e.g. 'My preferred programming language is TypeScript' or 'Remind me of project deadlines'" value={newFact} onChange={(e) => setNewFact(e.target.value)}/>
          <button type="submit" className="view-btn view-btn-primary" disabled={!newFact.trim()}>
            + Remember Fact
          </button>
        </form>
      </div>

    <div className="memory-list-section">
        <div className="memory-search-bar">
          <input className="memory-search-input" placeholder="Search memory vault by keyword…" value={query} onChange={(e) => setQuery(e.target.value)}/>
          {query && (<button className="memory-search-clear" onClick={() => setQuery('')}>
              ✕
            </button>)}
        </div>

        <div className="memory-items-grid">
          {filtered.length === 0 ? (<div className="memory-empty">
              No memories match <b>"{query}"</b>.
            </div>) : (filtered.map((item, idx) => (<div key={idx} className="memory-card">
                <div className="memory-card-body">
                  <div className="memory-text">{item.text}</div>
                  {item.at && (<div className="memory-time">
                      Recorded: {new Date(item.at).toLocaleDateString()} {new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>)}
                </div>
                <div className="memory-actions">
                  <button className="memory-btn-icon" onClick={() => {
                navigator.clipboard?.writeText(item.text);
                notify('Copied to clipboard');
            }} title="Copy memory">
                    📋
                  </button>
                  <button className="memory-btn-icon is-danger" onClick={() => handleDeleteFact(item.text)} title="Forget memory">
                    🗑️
                  </button>
                </div>
              </div>)))}
        </div>
      </div>
    </div>);
}
