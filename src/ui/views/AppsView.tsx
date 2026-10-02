import { useState } from 'react';
import { useStore } from '../../store';
import { BRIDGE_HTTP_URL, withToken } from '../../config';
import * as sfx from '../../lib/sfx';
export function AppsView() {
    const [customApp, setCustomApp] = useState('');
    const [statusMsg, setStatusMsg] = useState<string | null>(null);
    const [launching, setLaunching] = useState<string | null>(null);
    const notify = (msg: string) => {
        setStatusMsg(msg);
        setTimeout(() => setStatusMsg(null), 3500);
    };
    const handleLaunch = async (appId: string, appName: string) => {
        setLaunching(appId);
        sfx.play('tool');
        notify(`Launching ${appName} on Windows…`);
        try {
            const res = await fetch(withToken(`${BRIDGE_HTTP_URL}/api/apps/launch`), {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ app: appId }),
            });
            if (res.ok) {
                notify(`${appName} launched successfully.`);
            }
            else {
                notify(`Failed to launch ${appName}.`);
            }
        }
        catch {
            notify(`Application triggered (${appName})`);
        }
        finally {
            setTimeout(() => setLaunching(null), 1000);
        }
    };
    const handleSleep = () => {
        sfx.play('done');
        notify('Entering standby sleep mode…');
        useStore.getState().setPhase('dormant');
    };
    const handlePowerOff = async () => {
        sfx.play('done');
        notify('Powering down ZEMO systems… Goodbye.');
        useStore.getState().setPhase('offline');
        try {
            await fetch(withToken(`${BRIDGE_HTTP_URL}/api/system/shutdown`), { method: 'POST' });
        }
        catch { }
        setTimeout(() => {
            window.close();
        }, 800);
    };
    const APPS = [
        {
            id: 'notepad',
            name: 'Notepad',
            desc: 'Default Windows lightweight text editor.',
            icon: '📝',
            cat: 'PRODUCTIVITY',
        },
        {
            id: 'calc',
            name: 'Calculator',
            desc: 'Windows standard and scientific calculator.',
            icon: '🔢',
            cat: 'UTILITY',
        },
        {
            id: 'chrome',
            name: 'Google Chrome',
            desc: 'Fast, secure web browsing.',
            icon: '🌐',
            cat: 'BROWSER',
        },
        {
            id: 'explorer',
            name: 'File Explorer',
            desc: 'Browse directories, drives, and network files.',
            icon: '📁',
            cat: 'SYSTEM',
        },
        {
            id: 'taskmgr',
            name: 'Task Manager',
            desc: 'Monitor CPU, GPU, RAM, and active processes.',
            icon: '⚡',
            cat: 'PERFORMANCE',
        },
        {
            id: 'vscode',
            name: 'VS Code',
            desc: 'Open the current workspace in Visual Studio Code.',
            icon: '👨‍💻',
            cat: 'DEV',
        },
        {
            id: 'powershell',
            name: 'PowerShell Terminal',
            desc: 'Windows command-line console and scripting.',
            icon: '💻',
            cat: 'SYSTEM',
        },
        {
            id: 'msedge',
            name: 'Microsoft Edge',
            desc: 'Hardware-accelerated web browser.',
            icon: '🌊',
            cat: 'BROWSER',
        },
        {
            id: 'paint',
            name: 'Paint',
            desc: 'Windows drawing, canvas, and markup tool.',
            icon: '🎨',
            cat: 'CREATIVE',
        },
        {
            id: 'settings',
            name: 'Windows Settings',
            desc: 'System preferences, devices, and network.',
            icon: '⚙️',
            cat: 'SYSTEM',
        },
        {
            id: 'camera',
            name: 'Camera',
            desc: 'Windows default webcam capture tool.',
            icon: '📷',
            cat: 'MEDIA',
        },
        {
            id: 'snippingtool',
            name: 'Snipping Tool',
            desc: 'Take screenshots, annotations, and screen clips.',
            icon: '✂️',
            cat: 'UTILITY',
        },
        {
            id: 'control',
            name: 'Control Panel',
            desc: 'Legacy Windows system management applets.',
            icon: '🎛️',
            cat: 'SYSTEM',
        },
        {
            id: 'spotify',
            name: 'Spotify',
            desc: 'Music streaming and playback.',
            icon: '🎵',
            cat: 'MEDIA',
        },
        {
            id: 'discord',
            name: 'Discord',
            desc: 'Voice, video, and chat communities.',
            icon: '💬',
            cat: 'SOCIAL',
        },
        {
            id: 'steam',
            name: 'Steam',
            desc: 'Gaming hub and software library.',
            icon: '🎮',
            cat: 'GAMES',
        },
        {
            id: 'youtube',
            name: 'YouTube',
            desc: 'Video streaming and tutorials.',
            icon: '▶️',
            cat: 'WEB',
        },
        {
            id: 'github',
            name: 'GitHub',
            desc: 'Code repositories and version control.',
            icon: '🐙',
            cat: 'DEV',
        },
    ];
    return (<div className="view-stage apps-view">
      <header className="view-header">
        <div>
          <div className="view-tag">WINDOWS SUBSYSTEM BRIDGING</div>
          <h2 className="view-title">Application Launchpad</h2>
        </div>
        <div className="view-header-actions">
          {statusMsg && <span className="view-notice">{statusMsg}</span>}
          <button className="view-btn view-btn-ghost" onClick={handleSleep} title="Enter low-power standby mode">
            💤 Standby Sleep
          </button>
          <button className="view-btn view-btn-danger" onClick={handlePowerOff} title="Gracefully power down and close ZEMO">
            🛑 Turn Off ZEMO
          </button>
        </div>
      </header>

    <div className="apps-custom-card">
        <h4 className="section-title">CUSTOM EXECUTABLE OR COMMAND</h4>
        <form className="apps-custom-form" onSubmit={(e) => {
            e.preventDefault();
            const val = customApp.trim();
            if (!val)
                return;
            handleLaunch(val, val);
            setCustomApp('');
        }}>
          <input className="apps-custom-input" placeholder="Enter executable name, URL, or command (e.g. 'chrome', 'cmd', 'https://google.com')…" value={customApp} onChange={(e) => setCustomApp(e.target.value)}/>
          <button type="submit" className="view-btn view-btn-primary" disabled={!customApp.trim()}>
            Execute →
          </button>
        </form>
      </div>

    <div className="apps-grid">
        {APPS.map((app) => (<div key={app.id} className="app-card">
            <div className="app-card-top">
              <span className="app-icon">{app.icon}</span>
              <span className="app-cat">{app.cat}</span>
            </div>
            <h4 className="app-name">{app.name}</h4>
            <p className="app-desc">{app.desc}</p>
            <button className="app-launch-btn" onClick={() => handleLaunch(app.id, app.name)} disabled={launching === app.id}>
              {launching === app.id ? 'Launching…' : 'Launch ↗'}
            </button>
          </div>))}
      </div>
    </div>);
}
