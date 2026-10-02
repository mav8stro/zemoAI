import { KOKORO_VOICE } from '../config';
type Kokoro = {
    generate: (text: string, opts: {
        voice: string;
        speed?: number;
    }) => Promise<{
        toBlob: () => Blob;
    }>;
};
let model: Kokoro | null = null;
let loading: Promise<Kokoro | null> | null = null;
let failed = false;
let progress = 0;
export const loadProgress = () => progress;
export const isReady = () => model !== null;
export const isUnavailable = () => failed;
export let lastError = '';
export const VOICES = ['bm_george', 'bm_fable', 'bm_lewis', 'bm_daniel'] as const;
function resolveVoice(): string {
    if ((VOICES as readonly string[]).includes(KOKORO_VOICE))
        return KOKORO_VOICE;
    console.warn(`[zimo] VITE_KOKORO_VOICE="${KOKORO_VOICE}" is not one of ${VOICES.join(', ')} — using ${VOICES[0]}.`);
    return VOICES[0];
}
const voice = resolveVoice();
const MAX_FAILURES = 3;
let failures = 0;
export async function load(): Promise<Kokoro | null> {
    if (model)
        return model;
    if (failed)
        return null;
    if (loading)
        return loading;
    loading = (async () => {
        try {
            const { KokoroTTS } = await import('kokoro-js');
            const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
                dtype: 'q8',
                device: 'webgpu',
                progress_callback: (p: unknown) => {
                    const pct = (p as {
                        progress?: number;
                    })?.progress;
                    if (typeof pct === 'number')
                        progress = pct / 100;
                },
            });
            progress = 1;
            model = tts as unknown as Kokoro;
            return model;
        }
        catch (err) {
            console.warn('[zimo] kokoro unavailable, using the system voice:', err);
            lastError = String((err as Error)?.message ?? err);
            failed = true;
            return null;
        }
        finally {
            loading = null;
        }
    })();
    return loading;
}
export async function speak(text: string): Promise<string | null> {
    const tts = await load();
    if (!tts)
        return null;
    try {
        const audio = await tts.generate(text, {
            voice,
            speed: 0.95,
        });
        failures = 0;
        return URL.createObjectURL(audio.toBlob());
    }
    catch (err) {
        console.error('[zimo] kokoro generation failed:', err);
        lastError = String((err as Error)?.message ?? err);
        failures++;
        if (failures >= MAX_FAILURES) {
            failed = true;
            console.warn(`[zimo] kokoro failed ${failures} times running — the system voice from here on.`);
        }
        return null;
    }
}
export async function availableVoices(): Promise<string[]> {
    const tts = (await load()) as unknown as {
        voices?: Record<string, unknown>;
    } | null;
    return tts?.voices ? Object.keys(tts.voices) : [];
}
