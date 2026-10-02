import { useState, useEffect } from 'react';
import { useStore } from '../../store';
import { BRIDGE_HTTP_URL, withToken } from '../../config';
import { watchBrain, sendBrainChange } from '../../lib/bridge';
import * as sfx from '../../lib/sfx';
export function SettingsView() {
    const ui = useStore((s) => s.ui);
    const applyUi = useStore((s) => s.applyUi);
    const resetUi = useStore((s) => s.resetUi);
    const [activeBrain, setActiveBrain] = useState('gemini');
    const [statusMsg, setStatusMsg] = useState<string | null>(null);
    const [pingMs, setPingMs] = useState<number | null>(null);
    const [trainTopic, setTrainTopic] = useState('');
    const [trainContent, setTrainContent] = useState('');
    const [trainBrain, setTrainBrain] = useState('qwen');
    const [isTraining, setIsTraining] = useState(false);
    const [trainedFacts, setTrainedFacts] = useState<string[]>([]);
    const [ollamaStatus, setOllamaStatus] = useState<'unchecked' | 'online' | 'offline'>('unchecked');
    const [ollamaModels, setOllamaModels] = useState<string[]>([]);
    const notify = (msg: string) => {
        setStatusMsg(msg);
        setTimeout(() => setStatusMsg(null), 3500);
    };
    useEffect(() => {
        watchBrain((b) => {
            setActiveBrain(b);
        });
        fetch(withToken(`${BRIDGE_HTTP_URL}/api/system`))
            .then((res) => res.json())
            .then((data) => {
            if (data.brain)
                setActiveBrain(data.brain);
        })
            .catch(() => { });
    }, []);
    const handleBrainChange = async (brain: string) => {
        setActiveBrain(brain);
        sendBrainChange(brain);
        notify(`Switching cognitive engine to ${brain}…`);
        try {
            const res = await fetch(withToken(`${BRIDGE_HTTP_URL}/api/settings/brain`), {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ brain }),
            });
            if (res.ok) {
                notify(`Active brain updated to ${brain}`);
            }
        }
        catch {
            notify(`Brain switched locally to ${brain}`);
        }
    };
    const handlePing = async () => {
        const start = performance.now();
        try {
            await fetch(withToken(`${BRIDGE_HTTP_URL}/health`));
            const ms = Math.round(performance.now() - start);
            setPingMs(ms);
            sfx.play('listen');
            notify(`Bridge latency: ${ms}ms`);
        }
        catch {
            setPingMs(999);
            notify('Bridge ping failed');
        }
    };
    const handleCheckOllama = async () => {
        notify('Probing local Ollama on port 11434…');
        try {
            const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(1500) });
            if (res.ok) {
                const data = await res.json();
                const names = (data.models ?? []).map((m: any) => m.name);
                setOllamaStatus('online');
                setOllamaModels(names);
                notify(`Ollama active (${names.length} local models detected)`);
            }
            else {
                setOllamaStatus('offline');
                notify('Ollama endpoint returned non-200');
            }
        }
        catch {
            setOllamaStatus('offline');
            notify('Ollama daemon offline on port 11434');
        }
    };
    const handleTrainModel = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!trainTopic.trim() && !trainContent.trim()) {
            notify('Please provide a training topic or notes');
            return;
        }
        setIsTraining(true);
        sfx.play('listen');
        notify(`AI Agent distilling knowledge via ${trainBrain.toUpperCase()}…`);
        try {
            const res = await fetch(withToken(`${BRIDGE_HTTP_URL}/api/agents/train`), {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    topic: trainTopic.trim() || 'General Knowledge',
                    content: trainContent.trim(),
                    brain: trainBrain,
                }),
            });
            const data = await res.json();
            if (data.ok) {
                sfx.play('wake');
                notify(`Success: ${data.distilledCount} neural memories forged & stored!`);
                setTrainTopic('');
                setTrainContent('');
                const newFacts = (data.facts ?? []).filter((f: string) => f.includes(`[Trained:`));
                setTrainedFacts(newFacts.slice(-4));
            }
            else {
                notify(`Training error: ${data.error ?? 'Unknown'}`);
            }
        }
        catch (err: any) {
            notify(`Failed to reach training agent: ${err.message}`);
        }
        finally {
            setIsTraining(false);
        }
    };
    const ACCENTS = [
        { label: 'Cyan / Arc Reactor', color: '#00f0ff' },
        { label: 'Violet / Nebula', color: '#a855f7' },
        { label: 'Amber / Core Warning', color: '#f59e0b' },
        { label: 'Emerald / Synthetic', color: '#10b981' },
        { label: 'Crimson / Red Alert', color: '#ef4444' },
    ];
    return (<div className="view-stage settings-view">
      <header className="view-header">
        <div>
          <div className="view-tag">SYSTEM CALIBRATION</div>
          <h2 className="view-title">Settings & Neural Configuration</h2>
        </div>
        <div className="view-header-actions">
          {statusMsg && <span className="view-notice">{statusMsg}</span>}
          <button className="view-btn view-btn-ghost" onClick={() => resetUi()}>
            Reset Defaults
          </button>
        </div>
      </header>

      <div className="settings-sections-grid">
        
        <div className="settings-card">
          <div className="flex-between">
            <h4 className="settings-card-title">COGNITIVE BRAIN ENGINE</h4>
            <span className="settings-tag-fast">{activeBrain.toUpperCase()} ACTIVE</span>
          </div>
          <p className="settings-card-desc">
            Select the LLM engine for reasoning, command synthesis, and spoken replies. Switch anytime without restarting.
          </p>

          <div className="settings-brain-options">
            <button className={`settings-brain-btn ${activeBrain === 'gemini' ? 'is-active' : ''}`} onClick={() => handleBrainChange('gemini')}>
              <div className="settings-brain-name">Google Gemini 2.5 Flash Lite</div>
              <div className="settings-brain-sub">Lowest latency conversational model (~180ms TTFT) · ULTRA FAST</div>
            </button>

            <button className={`settings-brain-btn ${activeBrain === 'qwen' || activeBrain === 'gwen' ? 'is-active' : ''}`} onClick={() => handleBrainChange('qwen')}>
              <div className="settings-brain-name">Qwen 2.5 AI ("Gwen AI") · Free Open Weights</div>
              <div className="settings-brain-sub">
                Alibaba Qwen 2.5 72B / Coder 32B via free Hugging Face router or local Ollama · ZERO COST
              </div>
            </button>

            <button className={`settings-brain-btn ${activeBrain === 'hf' || activeBrain === 'huggingface' ? 'is-active' : ''}`} onClick={() => handleBrainChange('hf')}>
              <div className="settings-brain-name">Hugging Face Router (Free Tier)</div>
              <div className="settings-brain-sub">
                Serverless Open-Weights Router with your user token · Qwen / Llama 3.1
              </div>
            </button>

            <button className={`settings-brain-btn ${activeBrain === 'ollama' ? 'is-active' : ''}`} onClick={() => handleBrainChange('ollama')}>
              <div className="settings-brain-name">Ollama AI · Local & Fully Offline</div>
              <div className="settings-brain-sub">
                Runs locally on your GPU/CPU via http://localhost:11434 · Complete privacy
              </div>
            </button>

            <button className={`settings-brain-btn ${activeBrain === 'kimi' ? 'is-active' : ''}`} onClick={() => handleBrainChange('kimi')}>
              <div className="settings-brain-name">Kimi / Moonshot AI</div>
              <div className="settings-brain-sub">api.moonshot.ai integration (Account recharge needed for API quota)</div>
            </button>

            <button className={`settings-brain-btn ${activeBrain === 'claude' ? 'is-active' : ''}`} onClick={() => handleBrainChange('claude')}>
              <div className="settings-brain-name">Anthropic Claude Code SDK</div>
              <div className="settings-brain-sub">Local Claude Code login with full stdio MCP tools loop</div>
            </button>
          </div>
        </div>

    <div className="settings-card highlight-card">
          <div className="flex-between">
            <h4 className="settings-card-title text-cyan">⚡ FREE AI MODEL TRAINING AGENT</h4>
            <span className="settings-tag-fast">NEURAL DISTILLATION</span>
          </div>
          <p className="settings-card-desc">
            Train ZEMO by distilling arbitrary texts, API documentation, or domain guidelines into permanent factual memory using free AI models (Qwen 2.5 AI / Hugging Face / Ollama).
          </p>

          <form onSubmit={handleTrainModel} className="train-form">
            <div className="train-form-row">
              <div className="train-input-group">
                <label className="train-label">Training Topic / Domain</label>
                <input type="text" placeholder="e.g. Python Automation, Windows Edge Controls, Custom Persona" value={trainTopic} onChange={(e) => setTrainTopic(e.target.value)} className="train-input"/>
              </div>

              <div className="train-input-group" style={{ maxWidth: '240px' }}>
                <label className="train-label">Distillation Engine</label>
                <select value={trainBrain} onChange={(e) => setTrainBrain(e.target.value)} className="train-select">
                  <option value="qwen">Qwen 2.5 AI (Free / Hugging Face)</option>
                  <option value="hf">Hugging Face Router</option>
                  <option value="ollama">Local Ollama AI</option>
                  <option value="gemini">Google Gemini 2.5</option>
                </select>
              </div>
            </div>

            <div className="train-input-group">
              <label className="train-label">Raw Knowledge, Reference Notes, or Documentation</label>
              <textarea rows={4} placeholder="Paste reference text, code rules, or instructions here. The training agent will distill this into high-priority permanent facts..." value={trainContent} onChange={(e) => setTrainContent(e.target.value)} className="train-textarea"/>
            </div>

            <div className="train-actions">
              <button type="submit" disabled={isTraining || (!trainTopic && !trainContent)} className="view-btn view-btn-primary">
                {isTraining ? '⚡ Distilling & Training Neural Memory…' : '⚡ Train ZEMO Core Knowledge'}
              </button>
            </div>
          </form>

          {trainedFacts.length > 0 && (<div className="trained-facts-preview">
              <div className="trained-facts-title">Recently Distilled Facts in Memory Vault:</div>
              <ul className="trained-facts-list">
                {trainedFacts.map((fact, idx) => (<li key={idx} className="trained-fact-item">{fact}</li>))}
              </ul>
            </div>)}
        </div>

    <div className="settings-card">
          <h4 className="settings-card-title">HUGGING FACE & OLLAMA TELEMETRY</h4>
          <p className="settings-card-desc">
            Direct integration status with Hugging Face serverless inference router and local Ollama daemon.
          </p>

          <div className="settings-telemetry-rows">
            <div className="settings-telemetry-item">
              <span className="settings-telemetry-label">Hugging Face Token</span>
              <span className="settings-telemetry-val text-cyan">
                hf_hYWee...ikcwB <span className="settings-tag-online">CONFIGURED</span>
              </span>
            </div>

            <div className="settings-telemetry-item">
              <span className="settings-telemetry-label">Default HF Router Model</span>
              <code className="settings-telemetry-val">Qwen/Qwen2.5-72B-Instruct</code>
            </div>

            <div className="settings-telemetry-item">
              <span className="settings-telemetry-label">Local Ollama Status</span>
              <span className={ollamaStatus === 'online' ? 'settings-tag-online' : 'settings-tag-fast'}>
                {ollamaStatus === 'online' ? `ONLINE (${ollamaModels.length} models)` : ollamaStatus === 'offline' ? 'OFFLINE (FALLS BACK TO HF)' : 'NOT CHECKED'}
              </span>
            </div>
          </div>

          <div className="flex-row gap-8 mt-12">
            <button className="view-btn view-btn-ghost" onClick={handleCheckOllama}>
              🔍 Probe Local Ollama (Port 11434)
            </button>
          </div>
        </div>

    <div className="settings-card">
          <h4 className="settings-card-title">VISUAL THEME & REACTOR AESTHETICS</h4>
          <p className="settings-card-desc">Customize HUD accent glow, 3D reactor scale, and rotation speed.</p>

          <div className="settings-accents-row">
            <span className="settings-label">Accent Color:</span>
            <div className="settings-accent-swatches">
              {ACCENTS.map((a) => (<button key={a.color} className={`settings-swatch ${ui.accent === a.color ? 'is-selected' : ''}`} style={{ backgroundColor: a.color }} title={a.label} onClick={() => applyUi({ accent: a.color })}/>))}
            </div>
          </div>

          <div className="settings-sliders">
            <div className="settings-slider-row">
              <div className="settings-slider-meta">
                <span>Reactor Scale</span>
                <span>{ui.reactor.scale.toFixed(1)}x</span>
              </div>
              <input type="range" min="0.5" max="2.0" step="0.1" value={ui.reactor.scale} onChange={(e) => applyUi({ reactor: { scale: parseFloat(e.target.value) } })} className="voice-range"/>
            </div>

            <div className="settings-slider-row">
              <div className="settings-slider-meta">
                <span>Reactor Spin Rate</span>
                <span>{ui.reactor.spin.toFixed(1)}x</span>
              </div>
              <input type="range" min="0.2" max="3.0" step="0.2" value={ui.reactor.spin} onChange={(e) => applyUi({ reactor: { spin: parseFloat(e.target.value) } })} className="voice-range"/>
            </div>

            <div className="settings-slider-row">
              <div className="settings-slider-meta">
                <span>Reactor Geometry Style</span>
                <span className="text-cyan">{ui.reactor.style.toUpperCase()}</span>
              </div>
              <div className="settings-style-btns">
                {(['ring', 'sphere', 'wire'] as const).map((style) => (<button key={style} className={`settings-mini-btn ${ui.reactor.style === style ? 'is-active' : ''}`} onClick={() => applyUi({ reactor: { style } })}>
                    {style}
                  </button>))}
              </div>
            </div>
          </div>
        </div>

    <div className="settings-card">
          <h4 className="settings-card-title">BRIDGE TELEMETRY & NETWORK</h4>
          <p className="settings-card-desc">Local Node.js bridge server status on Windows port 8787.</p>

          <div className="settings-telemetry-rows">
            <div className="settings-telemetry-item">
              <span className="settings-telemetry-label">Bridge Endpoint</span>
              <code className="settings-telemetry-val">ws://localhost:8787</code>
            </div>

            <div className="settings-telemetry-item">
              <span className="settings-telemetry-label">Connection Status</span>
              <span className="settings-tag-online">CONNECTED (AUTO-RECONNECT INDEFINITE)</span>
            </div>

            <div className="settings-telemetry-item">
              <span className="settings-telemetry-label">Keepalive Heartbeat</span>
              <span className="settings-tag-fast">15s Active Ping / 20s TCP Ping</span>
            </div>

            <div className="settings-telemetry-item">
              <span className="settings-telemetry-label">Round-Trip Latency</span>
              <span className="settings-telemetry-val">
                {pingMs !== null ? `${pingMs} ms` : 'Not tested'}
              </span>
            </div>
          </div>

          <button className="view-btn view-btn-primary" onClick={handlePing}>
            ⚡ Ping Bridge Latency
          </button>
        </div>
      </div>
    </div>);
}
