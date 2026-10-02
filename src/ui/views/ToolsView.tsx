import { useState } from 'react';
import { useStore } from '../../store';
import * as sfx from '../../lib/sfx';
interface ToolsViewProps {
    onSubmit: (text: string) => void;
}
export function ToolsView({ onSubmit }: ToolsViewProps) {
    const fireEffect = useStore((s) => s.fireEffect);
    const pushPanel = useStore((s) => s.pushPanel);
    const pushBlade = useStore((s) => s.pushBlade);
    const [clipboardContent, setClipboardContent] = useState<string | null>(null);
    const [actionNotice, setActionNotice] = useState<string | null>(null);
    const showNotice = (msg: string) => {
        setActionNotice(msg);
        setTimeout(() => setActionNotice(null), 3000);
    };
    const handleReadClipboard = async () => {
        try {
            if (navigator.clipboard?.readText) {
                const text = await navigator.clipboard.readText();
                setClipboardContent(text || '(Clipboard is currently empty)');
                showNotice('Clipboard read successfully');
            }
            else {
                showNotice('Clipboard API not permitted in this context');
            }
        }
        catch (err: any) {
            showNotice(`Clipboard read failed: ${err.message}`);
        }
    };
    const handleTestPanel = () => {
        sfx.play('wake');
        pushPanel({
            id: `p_${Date.now()}`,
            title: 'DIAGNOSTIC TELEMETRY',
            html: `
        <div style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #7fe6f0;">
          <p><strong>ZEMO HARDWARE CHECK:</strong> ALL SYSTEMS ONLINE</p>
          <p>• Memory Buffer: Nominal</p>
          <p>• Neural Model: Gemini 2.5 Flash Lite</p>
          <p>• Latency: ~380ms cutoff</p>
        </div>
      `,
            anim: 'materialise',
            slot: 'right',
            accent: 'default',
            hold: 'sticky',
        });
        showNotice('HUD Diagnostic Panel deployed');
    };
    const handleTestBlade = () => {
        sfx.play('wake');
        pushBlade({
            id: `b_${Date.now()}`,
            title: 'ZEMO ARCHITECTURE OVERVIEW',
            kind: 'markup',
            html: `
        <div style="padding: 16px; font-family: system-ui, sans-serif; line-height: 1.6; color: #eaf6f8;">
          <h3 style="color: var(--accent); margin-top: 0;">Multi-Modal Interface Operational</h3>
          <p>ZEMO operates as a low-latency native Windows intelligence assistant. Audio transcription, generative AI responses, and local tool execution are tightly coupled.</p>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px;">
            <div style="padding: 12px; border: 1px solid rgba(0,240,255,0.2); border-radius: 8px;">
              <strong>Fast Voice Engine:</strong> Native synthesis with immediate response.
            </div>
            <div style="padding: 12px; border: 1px solid rgba(0,240,255,0.2); border-radius: 8px;">
              <strong>Tools Matrix:</strong> System execution, files, apps, and persistent memory.
            </div>
          </div>
        </div>
      `,
            size: 'wide',
            hold: 'sticky',
        });
        showNotice('Interactive Blade surface deployed');
    };
    const TOOLS_LIST = [
        {
            id: 'zimo_ui',
            title: 'Interface Controller',
            desc: 'Controls HUD themes, visual effects, 3D reactor scale/spin, and UI palettes.',
            status: 'ONLINE',
            category: 'VISUAL',
        },
        {
            id: 'zimo_display',
            title: 'HUD Panels & Blades',
            desc: 'Renders dynamic holographic cards, data panels, and full-bleed reader blades.',
            status: 'ONLINE',
            category: 'DISPLAY',
        },
        {
            id: 'zimo_memory',
            title: 'Persistent Memory Vault',
            desc: 'Cross-session long-term memory fact recording and keyword recall.',
            status: 'ONLINE',
            category: 'COGNITIVE',
        },
        {
            id: 'zimo_eyes',
            title: 'Optical & Screen Vision',
            desc: 'Captures camera frames and desktop visual contexts for analysis.',
            status: 'STANDBY',
            category: 'PERCEPTION',
        },
        {
            id: 'zimo_apps',
            title: 'Windows Application Launcher',
            desc: 'Executes and controls Windows system apps (Notepad, Calc, Explorer, Terminal).',
            status: 'ONLINE',
            category: 'SYSTEM',
        },
        {
            id: 'zimo_chrome',
            title: 'Browser Automation',
            desc: 'Interacts with open tabs, page elements, and web document extraction.',
            status: 'STANDBY',
            category: 'WEB',
        },
    ];
    return (<div className="view-stage tools-view">
      <header className="view-header">
        <div>
          <div className="view-tag">INSTRUMENTATION & PROTOCOLS</div>
          <h2 className="view-title">Tools & Capabilities Matrix</h2>
        </div>
        <div className="view-header-actions">
          {actionNotice && <span className="view-notice">{actionNotice}</span>}
          <span className="view-badge">
            <span className="view-badge-dot"/>
            6 Core Protocols
          </span>
        </div>
      </header>

    <div className="tools-actions-section">
        <h3 className="section-title">DIRECT INTERFACE ACTIONS</h3>
        <div className="tools-buttons-grid">
          <button className="tool-action-btn" onClick={() => {
            fireEffect('glitch');
            showNotice('Glitch flourish fired');
        }}>
            <span className="tool-btn-icon">⚡</span>
            <span>Fire Glitch FX</span>
          </button>

          <button className="tool-action-btn" onClick={() => {
            fireEffect('pulse');
            showNotice('Reactor pulse fired');
        }}>
            <span className="tool-btn-icon">💫</span>
            <span>Trigger Pulse FX</span>
          </button>

          <button className="tool-action-btn" onClick={() => {
            fireEffect('scan');
            showNotice('Scanline sweep fired');
        }}>
            <span className="tool-btn-icon">📶</span>
            <span>Scanline Sweep</span>
          </button>

          <button className="tool-action-btn" onClick={handleTestPanel}>
            <span className="tool-btn-icon">📋</span>
            <span>Deploy HUD Card</span>
          </button>

          <button className="tool-action-btn" onClick={handleTestBlade}>
            <span className="tool-btn-icon">🖼️</span>
            <span>Deploy Blade Blade</span>
          </button>

          <button className="tool-action-btn" onClick={handleReadClipboard}>
            <span className="tool-btn-icon">📎</span>
            <span>Read Clipboard</span>
          </button>
        </div>

        {clipboardContent !== null && (<div className="clipboard-readout">
            <div className="clipboard-title">CLIPBOARD BUFFER CONTENT:</div>
            <pre className="clipboard-text">{clipboardContent}</pre>
          </div>)}
      </div>

    <div className="tools-catalog-section">
        <h3 className="section-title">ACTIVE SUBSYSTEMS & MCP CAPABILITIES</h3>
        <div className="tools-cards-grid">
          {TOOLS_LIST.map((tool) => (<div key={tool.id} className="tool-card">
              <div className="tool-card-header">
                <span className="tool-category">{tool.category}</span>
                <span className={`tool-status ${tool.status === 'ONLINE' ? 'is-online' : ''}`}>
                  {tool.status}
                </span>
              </div>
              <h4 className="tool-title">{tool.title}</h4>
              <p className="tool-desc">{tool.desc}</p>
              <div className="tool-card-footer">
                <code className="tool-code">{tool.id}</code>
                <button className="tool-run-btn" onClick={() => onSubmit(`Test and verify the ${tool.title} capability`)}>
                  Prompt ZEMO →
                </button>
              </div>
            </div>))}
        </div>
      </div>
    </div>);
}
