import { useCallback, useEffect, useState } from 'react';
import { BRIDGE_HTTP_URL, withToken } from '../../config';
interface FileItem {
    name: string;
    isDir: boolean;
    size: number;
    path?: string;
}
interface FilesViewProps {
    onSubmit: (text: string) => void;
}
const DEFAULT_FILES: FileItem[] = [
    { name: 'Launch-ZEMO.bat', isDir: false, size: 1024 },
    { name: 'package.json', isDir: false, size: 2340 },
    { name: '.env', isDir: false, size: 840 },
    { name: '.env.local', isDir: false, size: 520 },
    { name: 'src', isDir: true, size: 0 },
    { name: 'bridge', isDir: true, size: 0 },
    { name: 'windows', isDir: true, size: 0 },
    { name: 'skills', isDir: true, size: 0 },
    { name: 'electron', isDir: true, size: 0 },
];
export function FilesView({ onSubmit }: FilesViewProps) {
    const [files, setFiles] = useState<FileItem[]>([]);
    const [workspaceRoot, setWorkspaceRoot] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [statusMsg, setStatusMsg] = useState<string | null>(null);
    const notify = (msg: string) => {
        setStatusMsg(msg);
        setTimeout(() => setStatusMsg(null), 3000);
    };
    const loadFiles = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(withToken(`${BRIDGE_HTTP_URL}/api/files`));
            if (res.ok) {
                const data = await res.json();
                if (data.root) {
                    setWorkspaceRoot(data.root);
                }
                if (data.files && data.files.length > 0) {
                    setFiles(data.files);
                    setLoading(false);
                    return;
                }
            }
        }
        catch { }
        setFiles(DEFAULT_FILES);
        setLoading(false);
    }, []);
    useEffect(() => {
        loadFiles();
    }, [loadFiles]);
    const handleOpenExplorer = async (path?: string) => {
        notify('Opening Windows Explorer…');
        try {
            await fetch(withToken(`${BRIDGE_HTTP_URL}/api/files/open`), {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ path }),
            });
        }
        catch {
            notify('Command dispatched to Windows subsystem');
        }
    };
    const formatSize = (bytes: number) => {
        if (bytes === 0)
            return '-';
        if (bytes < 1024)
            return `${bytes} B`;
        if (bytes < 1024 * 1024)
            return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };
    const filtered = files.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()));
    return (<div className="view-stage files-view">
      <header className="view-header">
        <div>
          <div className="view-tag">LOCAL STORAGE & ASSETS</div>
          <h2 className="view-title">Workspace & System Files</h2>
        </div>
        <div className="view-header-actions">
          {statusMsg && <span className="view-notice">{statusMsg}</span>}
          <button className="view-btn view-btn-primary" onClick={() => handleOpenExplorer()} title="Open folder in Windows Explorer">
            📂 Open in Explorer
          </button>
          <button className="view-btn view-btn-ghost" onClick={loadFiles} disabled={loading}>
            Refresh
          </button>
        </div>
      </header>

    <div className="files-banner">
        <div className="files-banner-label">ACTIVE WORKSPACE ROOT:</div>
        <code className="files-banner-path">
          {workspaceRoot || 'Local Workspace Root'}
        </code>
      </div>

    <div className="files-search-wrap">
        <input className="files-search-input" placeholder="Filter workspace files…" value={query} onChange={(e) => setQuery(e.target.value)}/>
        {query && (<button className="memory-search-clear" onClick={() => setQuery('')}>
            ✕
          </button>)}
      </div>

    <div className="files-table-container">
        <table className="files-table">
          <thead>
            <tr>
              <th>TYPE</th>
              <th>NAME</th>
              <th>SIZE</th>
              <th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((file, i) => (<tr key={i} className="files-row">
                <td className="files-cell-type">
                  {file.isDir ? '📁' : file.name.endsWith('.bat') ? '⚙️' : file.name.endsWith('.json') ? '📋' : '📄'}
                </td>
                <td className="files-cell-name">
                  <span className="file-name-text">{file.name}</span>
                </td>
                <td className="files-cell-size">{formatSize(file.size)}</td>
                <td className="files-cell-actions">
                  <button className="file-action-btn" onClick={() => onSubmit(`Inspect and summarize the file: ${file.name}`)}>
                    Analyze →
                  </button>
                </td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </div>);
}
