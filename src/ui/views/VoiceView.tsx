import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import * as sfx from '../../lib/sfx';
interface VoiceViewProps {
    onStartVoice?: () => void;
}
export function VoiceView({ onStartVoice }: VoiceViewProps) {
    const phase = useStore((s) => s.phase);
    const level = useStore((s) => s.level);
    const activeVoice = useStore((s) => s.voice);
    const setVoice = useStore((s) => s.setVoice);
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [selectedVoice, setSelectedVoice] = useState<string>(activeVoice || '');
    const [rate, setRate] = useState<number>(1.05);
    const [pitch, setPitch] = useState<number>(1.0);
    const [isSpeakingTest, setIsSpeakingTest] = useState(false);
    const [sfxEnabled, setSfxEnabled] = useState(true);
    useEffect(() => {
        const updateVoices = () => {
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                const list = window.speechSynthesis.getVoices();
                setVoices(list);
                if (!selectedVoice && list.length > 0) {
                    const en = list.find((v) => v.lang.startsWith('en') || v.name.includes('David') || v.name.includes('George')) ?? list[0];
                    setSelectedVoice(en.name);
                    setVoice(en.name);
                }
            }
        };
        updateVoices();
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.onvoiceschanged = updateVoices;
        }
        return () => {
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.onvoiceschanged = null;
            }
        };
    }, [selectedVoice, setVoice]);
    const handleVoiceChange = (name: string) => {
        setSelectedVoice(name);
        setVoice(name);
    };
    const handleTestSpeech = () => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window))
            return;
        window.speechSynthesis.cancel();
        const phrase = 'ZEMO acoustic telemetry verified. Vocal subsystems are operating with optimal low-latency turnaround.';
        const utterance = new SpeechSynthesisUtterance(phrase);
        utterance.rate = rate;
        utterance.pitch = pitch;
        if (selectedVoice) {
            const match = voices.find((v) => v.name === selectedVoice);
            if (match)
                utterance.voice = match;
        }
        utterance.onstart = () => setIsSpeakingTest(true);
        utterance.onend = () => setIsSpeakingTest(false);
        utterance.onerror = () => setIsSpeakingTest(false);
        window.speechSynthesis.speak(utterance);
    };
    const barCount = 18;
    const bars = Array.from({ length: barCount }, (_, i) => {
        const base = Math.sin((i / barCount) * Math.PI) * 0.4;
        const audioBoost = level * (0.6 + Math.sin(i * 1.5) * 0.4);
        const val = Math.min(1, Math.max(0.08, base + audioBoost));
        return Math.round(val * 100);
    });
    return (<div className="view-stage voice-view">
      <header className="view-header">
        <div>
          <div className="view-tag">ACOUSTIC & NEURAL RECOGNITION</div>
          <h2 className="view-title">Voice Telemetry & Vocal Matrix</h2>
        </div>
        <div className="view-header-actions">
          <span className={`view-badge ${phase === 'listening' ? 'is-active' : ''}`}>
            <span className="view-badge-dot"/>
            PHASE: {phase.toUpperCase()}
          </span>
        </div>
      </header>

    <div className="voice-visualizer-card">
        <div className="voice-visualizer-bars">
          {bars.map((h, i) => (<div key={i} className="voice-eq-bar" style={{ height: `${h}%` }}/>))}
        </div>
        <div className="voice-level-meter">
          <span className="voice-meter-label">INPUT SENSITIVITY</span>
          <div className="voice-meter-track">
            <div className="voice-meter-fill" style={{ width: `${Math.round(level * 100)}%` }}/>
          </div>
          <span className="voice-meter-val">{Math.round(level * 100)}%</span>
        </div>

        <div className="voice-ptt-action">
          <button className={`voice-ptt-btn ${phase === 'listening' ? 'is-listening' : ''}`} onClick={() => {
            sfx.play('wake');
            onStartVoice?.();
        }}>
            <span className="voice-ptt-icon">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9.5" y="3.5" width="5" height="9" rx="2.5"/>
                <path d="M6.5 11a5.5 5.5 0 0 0 11 0M12 16.5v3" strokeLinecap="round"/>
              </svg>
            </span>
            <span className="voice-ptt-text">
              {phase === 'listening' ? 'LISTENING (SPEAK NOW)' : 'PUSH TO TALK / TRIGGER VOICE'}
            </span>
          </button>
          <p className="voice-ptt-hint">
            Wake words recognized: <b>“Hey ZEMO”</b>, <b>“ZEMO”</b>, <b>“Hey Jarvis”</b> (Turnaround: ~380ms)
          </p>
        </div>
      </div>

    <div className="voice-settings-grid">
        <div className="voice-card">
          <h4 className="voice-card-title">SPEECH SYNTHESIS ENGINE</h4>
          <p className="voice-card-desc">
            Native hardware synthesizer (<span className="text-cyan">&lt; 20ms latency</span>). Zero network stall.
          </p>

          <div className="voice-field">
            <label className="voice-label">Vocal Persona / Voice</label>
            <select className="voice-select" value={selectedVoice} onChange={(e) => handleVoiceChange(e.target.value)}>
              {voices.map((v) => (<option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>))}
            </select>
          </div>

          <div className="voice-sliders">
            <div className="voice-slider-item">
              <div className="voice-slider-meta">
                <span>Speaking Rate</span>
                <span>{rate.toFixed(2)}x</span>
              </div>
              <input type="range" min="0.8" max="1.5" step="0.05" value={rate} onChange={(e) => setRate(parseFloat(e.target.value))} className="voice-range"/>
            </div>

            <div className="voice-slider-item">
              <div className="voice-slider-meta">
                <span>Vocal Pitch</span>
                <span>{pitch.toFixed(2)}</span>
              </div>
              <input type="range" min="0.7" max="1.3" step="0.05" value={pitch} onChange={(e) => setPitch(parseFloat(e.target.value))} className="voice-range"/>
            </div>
          </div>

          <button className="view-btn view-btn-primary" onClick={handleTestSpeech} disabled={isSpeakingTest}>
            {isSpeakingTest ? 'Testing Voice Output…' : '▶ Test Voice Output'}
          </button>
        </div>

        <div className="voice-card">
          <h4 className="voice-card-title">AUDIO & SENSORY ENVIRONMENT</h4>
          <p className="voice-card-desc">Chimes, tactical beeps, and feedback indicators.</p>

          <div className="voice-toggles">
            <div className="voice-toggle-row">
              <div>
                <div className="voice-toggle-label">Interface Sound FX</div>
                <div className="voice-toggle-sub">Chimes on wake, listen, and tool execution</div>
              </div>
              <button className={`voice-switch ${sfxEnabled ? 'is-on' : ''}`} onClick={() => {
            setSfxEnabled(!sfxEnabled);
            if (!sfxEnabled)
                sfx.play('listen');
        }}>
                {sfxEnabled ? 'ENABLED' : 'MUTED'}
              </button>
            </div>

            <div className="voice-toggle-row">
              <div>
                <div className="voice-toggle-label">Silence Cutoff (Latency)</div>
                <div className="voice-toggle-sub">Siri-Speed endpointing threshold</div>
              </div>
              <span className="voice-tag-highlight">380 ms (INSTANT)</span>
            </div>

            <div className="voice-toggle-row">
              <div>
                <div className="voice-toggle-label">Audio Fallback</div>
                <div className="voice-toggle-sub">Browser SpeechSynthesis fallback</div>
              </div>
              <span className="voice-tag-highlight">ACTIVE</span>
            </div>
          </div>
        </div>
      </div>
    </div>);
}
