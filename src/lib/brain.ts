import { BACKEND } from '../config';
import * as direct from './anthropic';
import * as bridge from './bridge';
import type { AskHandlers, Msg } from './anthropic';
import type { Blade, Panel } from '../store';
export type { AskHandlers, Msg };
export type { ConnectionState } from './bridge';
export const usingBridge = BACKEND === 'bridge';
export async function ask(prompt: string, history: Msg[], handlers: AskHandlers): Promise<{
    text: string;
    tools: string[];
}> {
    return usingBridge
        ? bridge.ask(prompt, handlers)
        : direct.ask([...history, { role: 'user', content: prompt }], handlers);
}
export async function warm(): Promise<void> {
    if (usingBridge)
        await bridge.warmBridge();
}
export function watchServers(fn: (servers: string[]) => void): void {
    if (usingBridge)
        bridge.watchServers(fn);
}
export function watchPanels(fn: (panel: Panel) => void): void {
    if (usingBridge)
        bridge.watchPanels(fn);
}
export function watchBlades(fn: (blade: Blade) => void): void {
    if (usingBridge)
        bridge.watchBlades(fn);
}
export function watchUi(fn: (op: string, args: any) => void): void {
    if (usingBridge)
        bridge.watchUi(fn);
}
export function watchCapture(fn: (req: bridge.CaptureRequest) => Promise<bridge.CaptureResult>): void {
    if (usingBridge)
        bridge.watchCapture(fn);
}
export function cancel(): void {
    if (usingBridge)
        bridge.cancel();
    else
        direct.cancel();
}
export function interrupt(): void {
    cancel();
}
export function isConnected(): boolean {
    return usingBridge ? bridge.isConnected() : true;
}
export function watchConnection(fn: (state: bridge.ConnectionState) => void): void {
    if (usingBridge)
        bridge.watchConnection(fn);
}
export function connectedLabels(): string[] {
    return usingBridge ? bridge.bridgeServers() : direct.connectedLabels();
}
export function watchPower(fn: (action: 'shutdown' | 'sleep' | 'wakeup') => void): void {
    if (usingBridge)
        bridge.watchPower(fn);
}
export function watchBrain(fn: (brain: string) => void): void {
    if (usingBridge)
        bridge.watchBrain(fn);
}
