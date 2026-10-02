import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
interface ChatViewProps {
    onSubmit: (text: string) => void;
    onStartVoice?: () => void;
}
export function ChatView({ onSubmit, onStartVoice }: ChatViewProps) {
    const turns = useStore((s) => s.turns);
    const phase = useStore((s) => s.phase);
    const caption = useStore((s) => s.caption);
    const clearScreen = useStore((s) => s.clearScreen);
    const [input, setInput] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const endRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [turns, caption, phase]);
    const handleSend = () => {
        const text = input.trim();
        if (!text)
            return;
        onSubmit(text);
        setInput('');
    };
    const handleCopy = (id: string, text: string) => {
        navigator.clipboard?.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1800);
    };
    const SUGGESTIONS = [
        'Run system diagnostics and check health',
        'What tools and MCP servers are active?',
        'Open Windows Notepad',
        'Tell me a witty observation about human nature',
    ];
    return (<div className="view-stage chat-view">
      <header className="view-header">
        <div>
          <div className="view-tag">COMMUNICATION MATRIX</div>
          <h2 className="view-title">Chat & Neural Exchange</h2>
        </div>
        <div className="view-header-actions">
          <span className="view-badge">
            <span className="view-badge-dot"/>
            {turns.length} Turn{turns.length === 1 ? '' : 's'}
          </span>
          <button className="view-btn view-btn-ghost" onClick={() => clearScreen('transcript')} title="Clear conversation history">
            Clear History
          </button>
        </div>
      </header>

      <div className="chat-thread">
        {turns.length === 0 ? (<div className="chat-empty">
            <div className="chat-empty-icon">
              <img src="/assets/zemo-logo.png" alt="ZEMO" style={{ width: 80, height: 80, borderRadius: '50%', boxShadow: '0 0 20px #00ffc4' }} />
            </div>
            <h3 className="chat-empty-title">Secure Comm Channel Open</h3>
            <p className="chat-empty-desc">
              All neural links are synchronized. Ask questions, issue system directives, or speak freely.
            </p>
            <div className="chat-suggestions-grid">
              {SUGGESTIONS.map((s, idx) => (<button key={idx} className="chat-suggestion-chip" onClick={() => onSubmit(s)}>
                  <span>{s}</span>
                  <span className="chat-suggestion-arrow">→</span>
                </button>))}
            </div>
          </div>) : (<div className="chat-messages">
            {turns.map((turn) => {
                const isUser = turn.role === 'user';
                return (<div key={turn.id} className={`chat-message ${isUser ? 'is-user' : 'is-zemo'}`}>
                  <div className="chat-avatar">
                    {isUser ? 'USR' : <img src="/assets/zemo-logo.png" alt="ZEMO" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />}
                  </div>
                  <div className="chat-bubble">
                    <div className="chat-meta">
                      <span className="chat-author">{isUser ? 'Operator' : 'ZEMO Core'}</span>
                      <button className="chat-copy-btn" onClick={() => handleCopy(turn.id, turn.text)} title="Copy message">
                        {copiedId === turn.id ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <div className="chat-text">{turn.text}</div>
                    {turn.tools && turn.tools.length > 0 && (<div className="chat-tools-used">
                        <span className="chat-tools-label">INVOKED:</span>
                        {turn.tools.map((t, ti) => (<span key={ti} className="chat-tool-pill">
                            {t}
                          </span>))}
                      </div>)}
                  </div>
                </div>);
            })}

            {(phase === 'thinking' || phase === 'speaking') && (<div className="chat-message is-zemo is-streaming">
                <div className="chat-avatar">ZEMO</div>
                <div className="chat-bubble">
                  <div className="chat-meta">
                    <span className="chat-author">
                      {phase === 'thinking' ? 'Processing neural response…' : 'Synthesizing voice response…'}
                    </span>
                  </div>
                  {caption ? (<div className="chat-text chat-live-text">{caption}</div>) : (<div className="chat-typing-dots">
                      <span />
                      <span />
                      <span />
                    </div>)}
                </div>
              </div>)}
            <div ref={endRef}/>
          </div>)}
      </div>

      <div className="chat-composer-wrap">
        <form className="chat-composer" onSubmit={(e) => {
            e.preventDefault();
            handleSend();
        }}>
          {onStartVoice && (<button type="button" className="chat-voice-btn" onClick={onStartVoice} title="Speak with ZEMO">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="9.5" y="3.5" width="5" height="9" rx="2.5"/>
                <path d="M6.5 11a5.5 5.5 0 0 0 11 0M12 16.5v3" strokeLinecap="round"/>
              </svg>
            </button>)}
          <input className="chat-input" placeholder="Type a command or message to ZEMO… (Enter to send)" value={input} onChange={(e) => setInput(e.target.value)} autoComplete="off"/>
          <button type="submit" className="chat-send-btn" disabled={!input.trim()}>
            Send
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12 20 4l-5.5 16-3-6.5L4 12Z" strokeLinejoin="round" strokeLinecap="round"/>
            </svg>
          </button>
        </form>
      </div>
    </div>);
}
