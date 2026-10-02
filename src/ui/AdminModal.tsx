import { useState } from 'react';
import { useStore } from '../store';

export function AdminModal({ onClose }: { onClose: () => void }) {
  const adminUnlocked = useStore((s) => s.adminUnlocked);
  const setAdminUnlocked = useStore((s) => s.setAdminUnlocked);
  const devMode = useStore((s) => s.devMode);
  const setDevMode = useStore((s) => s.setDevMode);
  const [passcode, setPasscode] = useState('');
  const [err, setErr] = useState('');

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode === '4564' || passcode.toLowerCase() === 'zemo') {
      setAdminUnlocked(true);
      setErr('');
    } else {
      setErr('Invalid administrative passcode. Access denied.');
    }
  };

  const handleLock = () => {
    setAdminUnlocked(false);
    setDevMode(false);
  };

  return (
    <div className="admin-modal">
      <div className="admin-card">
        <div className="admin-header">
          <div className="admin-title-row">
            <span className="admin-tag">SECURITY & GOVERNANCE</span>
            <h3>Administrative Access & Terms of Safety</h3>
          </div>
          <button className="admin-close" onClick={onClose}>✕</button>
        </div>

        <div className="admin-content">
          <div className="admin-status-box">
            <div className="admin-state">
              <span className={`admin-state-indicator ${adminUnlocked ? 'active' : ''}`} />
              <div>
                <strong>ADMIN STATUS: {adminUnlocked ? 'VERIFIED (ROOT PRIVILEGES)' : 'LOCKED (RESTRICTED SANDBOX)'}</strong>
                <p>
                  {adminUnlocked
                    ? 'Root access active. Developer options and system automations unrestricted.'
                    : 'System is running under strict user-safety guidelines. Developer options locked.'}
                </p>
              </div>
            </div>

            {!adminUnlocked ? (
              <form onSubmit={handleUnlock} className="admin-form">
                <input
                  type="password"
                  placeholder="Enter Administrator Passcode..."
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  className="admin-input"
                />
                <button type="submit" className="admin-btn primary">Authenticate</button>
              </form>
            ) : (
              <div className="admin-actions-row">
                <button className="admin-btn warning" onClick={handleLock}>Lock Admin Access</button>
                <button
                  className={`admin-btn ${devMode ? 'active' : ''}`}
                  onClick={() => setDevMode(!devMode)}
                >
                  {devMode ? 'Disable Developer Mode' : 'Enable Developer Mode'}
                </button>
              </div>
            )}
            {err && <div className="admin-error">{err}</div>}
          </div>

          <div className="admin-terms-section">
            <h4>ZEMO Autonomous Safety Policies & Privacy Terms</h4>
            <div className="admin-terms-scroll">
              <section className="terms-item">
                <h5>1. Local-First Privacy Guarantee</h5>
                <p>
                  All vector embeddings, user memories, system logs, and communication data are stored strictly on your local machine (laptop server host). No personal identity or conversations are shared, sold, or distributed to any 3rd party servers.
                </p>
              </section>

              <section className="terms-item">
                <h5>2. Self-Thinking Peak Intelligence Operation</h5>
                <p>
                  ZEMO operates with high-effort multi-step logic synthesis and deep autonomous reasoning. When given a mission, the agent plans and orchestrates necessary tools with zero error tolerance.
                </p>
              </section>

              <section className="terms-item">
                <h5>3. Administrator Safety & Code Execution Control</h5>
                <p>
                  Low-level system modifications, file deletion, and shell scripting require authenticated administrator privileges. Unverified developer options remain disabled by default to protect device integrity.
                </p>
              </section>

              <section className="terms-item">
                <h5>4. Communication & Automation Policies</h5>
                <p>
                  Automations (such as WhatsApp integration, web queries, and local device searches) operate only upon explicit user instruction. The user retains complete authority to revoke background execution anytime.
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
