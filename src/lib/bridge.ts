import type { AskHandlers } from './anthropic';
import type { Blade, Panel } from '../store';
import { BRIDGE_WS_URL, withToken } from '../config';
type Frame = {
    type?: string;
    delta?: string;
    name?: string;
    text?: string;
    message?: string;
    panel?: Panel;
    blade?: Blade;
    op?: string;
    args?: unknown;
    id?: string;
    ask?: string;
    reason?: string;
    mode?: string;
    seconds?: number;
    when?: string;
    action?: string;
    servers?: Array<string | {
        name?: string;
    }>;
};
let askSeq = 0;
let socket: WebSocket | null = null;
let connecting: Promise<WebSocket> | null = null;
let servers: string[] = [];
export const bridgeServers = () => servers;
let onServers: ((s: string[]) => void) | null = null;
export function watchServers(fn: (s: string[]) => void) {
    onServers = fn;
}
let onBrain: ((brain: string) => void) | null = null;
export function watchBrain(fn: (brain: string) => void) {
    onBrain = fn;
}
let onPower: ((action: 'shutdown' | 'sleep' | 'wakeup') => void) | null = null;
export function watchPower(fn: (action: 'shutdown' | 'sleep' | 'wakeup') => void) {
    onPower = fn;
}
export function sendBrainChange(brain: string) {
    if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'set_brain', name: brain }));
    }
}
let onPanel: ((panel: Panel) => void) | null = null;
export function watchPanels(fn: (panel: Panel) => void) {
    onPanel = fn;
}
export type CaptureRequest = {
    mode: 'look' | 'watch';
    reason: string;
    seconds: number;
    when: 'now' | 'past';
};
export type CaptureResult = {
    data?: string;
    mimeType?: string;
    error?: string;
};
let onCapture: ((req: CaptureRequest) => Promise<CaptureResult>) | null = null;
export function watchCapture(fn: (req: CaptureRequest) => Promise<CaptureResult>) {
    onCapture = fn;
}
let onBlade: ((blade: Blade) => void) | null = null;
export function watchBlades(fn: (blade: Blade) => void) {
    onBlade = fn;
}
let onUi: ((op: string, args: any) => void) | null = null;
export function watchUi(fn: (op: string, args: any) => void) {
    onUi = fn;
}
export type ConnectionState = 'open' | 'lost' | 'reconnected';
let onConnection: ((state: ConnectionState) => void) | null = null;
export function watchConnection(fn: (state: ConnectionState) => void) {
    onConnection = fn;
}
export function isConnected(): boolean {
    return socket?.readyState === WebSocket.OPEN;
}
function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}
let firstReady = deferred();
let everConnected = false;
const RECONNECT_DELAYS = [500, 1000, 1500, 2000, 3000, 5000];
let attempt = 0;
let reconnectTimer: any = null;
let heartbeatTimer: any = null;
function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    const delay = attempt < RECONNECT_DELAYS.length ? RECONNECT_DELAYS[attempt] : 5000;
    attempt += 1;
    reconnectTimer = window.setTimeout(() => {
        void connect().catch(() => {
            scheduleReconnect();
        });
    }, delay);
}
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        if (!isConnected())
            void connect().catch(() => { });
    });
    window.addEventListener('focus', () => {
        if (!isConnected())
            void connect().catch(() => { });
    });
}
function dispatch(ws: WebSocket) {
    ws.addEventListener('message', (e: MessageEvent) => {
        let msg: Frame;
        try {
            msg = JSON.parse(e.data as string);
        }
        catch {
            return;
        }
        if (msg.type === 'ready') {
            servers = (msg.servers ?? [])
                .map((s) => (typeof s === 'string' ? s : (s.name ?? '')))
                .filter(Boolean);
            onServers?.(servers);
            firstReady.resolve();
        }
        else if (msg.type === 'panel' && msg.panel) {
            onPanel?.(msg.panel);
        }
        else if (msg.type === 'blade' && msg.blade) {
            onBlade?.(msg.blade);
        }
        else if (msg.type === 'capture' && msg.id) {
            const id = msg.id;
            const reply = (payload: Record<string, unknown>) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'reply', id, ...payload }));
                }
            };
            if (!onCapture) {
                reply({ error: 'The interface has no camera handler.' });
            }
            else {
                onCapture({
                    mode: msg.mode === 'watch' ? 'watch' : 'look',
                    reason: msg.reason ?? '',
                    seconds: Math.max(2, Math.min(15, Number(msg.seconds) || 6)),
                    when: msg.when === 'past' ? 'past' : 'now',
                })
                    .then(reply)
                    .catch((err) => reply({ error: String(err?.message ?? err) }));
            }
        }
        else if (msg.type === 'ui' && msg.op) {
            onUi?.(msg.op, (msg.args ?? {}) as Record<string, unknown>);
        }
        else if (msg.type === 'brain' && msg.name) {
            onBrain?.(msg.name);
        }
        else if (msg.type === 'power' && msg.action) {
            onPower?.(msg.action as 'shutdown' | 'sleep' | 'wakeup');
        }
    });
}
function connect(): Promise<WebSocket> {
    if (socket?.readyState === WebSocket.OPEN)
        return Promise.resolve(socket);
    if (connecting)
        return connecting;
    firstReady = deferred();
    connecting = new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(withToken(BRIDGE_WS_URL));
        let settled = false;
        const settle = (err: Error | null) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            connecting = null;
            if (err)
                reject(err);
            else
                resolve(ws);
        };
        const timer = setTimeout(() => {
            ws.close();
            settle(new Error('Bridge not responding — is `npm run bridge` running?'));
        }, 6000);
        ws.onopen = () => {
            socket = ws;
            attempt = 0;
            dispatch(ws);
            settle(null);
            onConnection?.(everConnected ? 'reconnected' : 'open');
            everConnected = true;
            clearInterval(heartbeatTimer);
            heartbeatTimer = setInterval(() => {
                if (socket?.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ type: 'ping' }));
                }
            }, 15000);
        };
        ws.onerror = () => {
            settle(new Error(`Cannot reach the bridge at ${BRIDGE_WS_URL}. Either it is not ` +
                'running (start it with `npm start`), or this page is on a port it ' +
                `refuses — it accepts localhost:5173-5199 and 4173-4199, and this ` +
                `page is on ${location.port || '80'}.`));
        };
        ws.onclose = () => {
            clearInterval(heartbeatTimer);
            settle(new Error('The bridge closed the connection.'));
            if (socket === ws) {
                socket = null;
                onConnection?.('lost');
                scheduleReconnect();
            }
        };
    });
    return connecting;
}
export async function warmBridge(): Promise<void> {
    await connect();
    await Promise.race([
        firstReady.promise,
        new Promise<void>((resolve) => setTimeout(resolve, 2500)),
    ]);
}
const IDLE_TIMEOUT_MS = 120000;
let pending: {
    finish: (fallback?: string) => void;
} | null = null;
export async function ask(prompt: string, handlers: AskHandlers): Promise<{
    text: string;
    tools: string[];
}> {
    if (pending)
        cancel();
    let cancelledWhileDialling = false;
    pending = {
        finish: () => {
            cancelledWhileDialling = true;
        },
    };
    let ws: WebSocket;
    try {
        ws = await connect();
    }
    catch (err) {
        pending = null;
        throw err;
    }
    if (cancelledWhileDialling) {
        pending = null;
        return { text: '', tools: [] };
    }
    const id = `a${++askSeq}`;
    const tools: string[] = [];
    let text = '';
    return new Promise((resolve, reject) => {
        let done = false;
        let timer = 0;
        const cleanup = () => {
            done = true;
            pending = null;
            clearTimeout(timer);
            ws.removeEventListener('message', onMessage);
            ws.removeEventListener('close', onClose);
            ws.removeEventListener('error', onError);
        };
        const finish = (fallback = '') => {
            if (done)
                return;
            cleanup();
            resolve({ text: (text || fallback).trim(), tools });
        };
        const fail = (err: Error) => {
            if (done)
                return;
            cleanup();
            reject(err);
        };
        const arm = () => {
            clearTimeout(timer);
            timer = window.setTimeout(() => {
                fail(new Error('The bridge went quiet — that turn was lost, sir.'));
            }, IDLE_TIMEOUT_MS);
        };
        const onMessage = (e: MessageEvent) => {
            arm();
            let msg: Frame;
            try {
                msg = JSON.parse(e.data as string);
            }
            catch {
                return;
            }
            if (msg.ask && msg.ask !== id)
                return;
            try {
                switch (msg.type) {
                    case 'text':
                        text += msg.delta ?? '';
                        handlers.onText(msg.delta ?? '');
                        break;
                    case 'tool':
                        if (!msg.name)
                            break;
                        tools.push(msg.name);
                        handlers.onTool(prettyToolName(msg.name));
                        break;
                    case 'done':
                        finish(msg.text ?? '');
                        break;
                    case 'error':
                        fail(new Error(msg.message ?? 'The bridge reported an error.'));
                        break;
                }
            }
            catch (err) {
                fail(err instanceof Error ? err : new Error(String(err)));
            }
        };
        const onClose = () => {
            fail(new Error('The bridge disconnected mid-answer — that session is gone.'));
        };
        const onError = () => {
            fail(new Error('The connection to the bridge failed.'));
        };
        pending = { finish };
        ws.addEventListener('message', onMessage);
        ws.addEventListener('close', onClose);
        ws.addEventListener('error', onError);
        arm();
        try {
            ws.send(JSON.stringify({ type: 'ask', text: prompt, id }));
        }
        catch (err) {
            fail(err instanceof Error ? err : new Error(String(err)));
        }
    });
}
export function cancel(): void {
    if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'interrupt' }));
    }
    pending?.finish();
}
export function interrupt(): void {
    cancel();
}
function prettyToolName(raw: string): string {
    if (!raw.startsWith('mcp__'))
        return raw;
    const [, server, ...rest] = raw.split('__');
    return `${server} · ${rest.join(' ').replace(/_/g, ' ')}`;
}
