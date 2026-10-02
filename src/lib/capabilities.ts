import { BACKEND, BRIDGE_HTTP_URL, env } from '../config';
export type Capabilities = {
    stt: boolean;
    tts: boolean;
};
let current: Capabilities = { stt: false, tts: false };
let probed = false;
export function caps(): Capabilities {
    return current;
}
export function capabilitiesProbed(): boolean {
    return probed;
}
export async function probeCapabilities(): Promise<Capabilities> {
    if (BACKEND !== 'bridge') {
        current = { stt: false, tts: false };
        probed = true;
        return current;
    }
    try {
        const res = await fetch(`${BRIDGE_HTTP_URL}/health`, {
            signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
            const h = (await res.json()) as {
                stt?: boolean;
                tts?: boolean;
            };
            current = { stt: Boolean(h.stt), tts: Boolean(h.tts) };
        }
    }
    catch {
    }
    probed = true;
    return current;
}
export function engineLabel(): string {
    const c = current;
    if (c.stt && c.tts)
        return 'ElevenLabs';
    if (c.tts)
        return 'ElevenLabs voice';
    if (env.elevenKey && BACKEND !== 'bridge')
        return 'ElevenLabs (direct)';
    return 'browser speech';
}
