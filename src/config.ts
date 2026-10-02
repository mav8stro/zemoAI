function str(raw: unknown): string | undefined {
    const value = typeof raw === 'string' ? raw.trim() : '';
    return value === '' ? undefined : value;
}
function choice<T extends string>(name: string, raw: unknown, allowed: readonly T[], fallback: T): T {
    const value = str(raw);
    if (value === undefined)
        return fallback;
    if ((allowed as readonly string[]).includes(value))
        return value as T;
    console.warn(`[zimo] ${name}="${value}" is not one of ${allowed.join(' | ')} — using "${fallback}".`);
    return fallback;
}
function flag(name: string, raw: unknown, fallback: boolean): boolean {
    const value = str(raw)?.toLowerCase();
    if (value === undefined)
        return fallback;
    if (value === 'true' || value === '1')
        return true;
    if (value === 'false' || value === '0')
        return false;
    console.warn(`[zimo] ${name}="${value}" is not true or false — using ${fallback}.`);
    return fallback;
}
export const BACKEND: 'bridge' | 'direct' = choice('VITE_BACKEND', import.meta.env.VITE_BACKEND, ['bridge', 'direct'] as const, 'bridge');
export const BRIDGE_WS_URL = str(import.meta.env.VITE_BRIDGE_URL) ?? 'ws://localhost:8787';
export const BRIDGE_HTTP_URL = BRIDGE_WS_URL.replace(/^ws/, 'http');
export const ZIMO_PASSWORD = str(import.meta.env.VITE_ZIMO_PASSWORD) ?? '4564';
export function withToken(url: string): string {
    const joiner = url.includes('?') ? '&' : '?';
    return `${url}${joiner}token=${encodeURIComponent(ZIMO_PASSWORD)}`;
}
export const USE_ELEVENLABS = flag('VITE_USE_ELEVENLABS', import.meta.env.VITE_USE_ELEVENLABS, false);
export const TTS_ENGINE: 'kokoro' | 'system' = choice('VITE_TTS_ENGINE', import.meta.env.VITE_TTS_ENGINE, ['kokoro', 'system'] as const, 'system');
export const KOKORO_VOICE = choice('VITE_KOKORO_VOICE', import.meta.env.VITE_KOKORO_VOICE, ['bm_george', 'bm_fable', 'bm_lewis', 'bm_daniel'] as const, 'bm_george');
export const env = {
    anthropicKey: str(import.meta.env.VITE_ANTHROPIC_API_KEY) ?? '',
    elevenKey: str(import.meta.env.VITE_ELEVENLABS_API_KEY) ?? '',
    elevenVoiceId: str(import.meta.env.VITE_ELEVENLABS_VOICE_ID) ?? 'OPggdAvz9vtogYnK5Ge4',
    porcupineKey: str(import.meta.env.VITE_PICOVOICE_ACCESS_KEY) ?? '',
    userName: str(import.meta.env.VITE_USER_NAME) ?? '',
};
export const MODEL = 'claude-opus-5';
export const FAST_MODE = true;
export const WAKE_ENGINE: 'speech' | 'porcupine' = env.porcupineKey
    ? 'porcupine'
    : 'speech';
export type McpServer = {
    name: string;
    label: string;
    url: string;
    token?: string;
    enabled: boolean;
};
export const MCP_SERVERS: McpServer[] = [
    {
        name: 'zapier',
        label: 'Zapier',
        url: str(import.meta.env.VITE_ZAPIER_MCP_URL) ?? '',
        enabled: Boolean(str(import.meta.env.VITE_ZAPIER_MCP_URL)),
    },
    {
        name: 'pipedream',
        label: 'Pipedream',
        url: str(import.meta.env.VITE_PIPEDREAM_MCP_URL) ?? '',
        enabled: Boolean(str(import.meta.env.VITE_PIPEDREAM_MCP_URL)),
    },
    {
        name: 'notion',
        label: 'Notion',
        url: 'https://mcp.notion.com/mcp',
        token: str(import.meta.env.VITE_NOTION_TOKEN),
        enabled: Boolean(str(import.meta.env.VITE_NOTION_TOKEN)),
    },
    {
        name: 'linear',
        label: 'Linear',
        url: 'https://mcp.linear.app/mcp',
        token: str(import.meta.env.VITE_LINEAR_TOKEN),
        enabled: Boolean(str(import.meta.env.VITE_LINEAR_TOKEN)),
    },
    {
        name: 'github',
        label: 'GitHub',
        url: 'https://api.githubcopilot.com/mcp/',
        token: str(import.meta.env.VITE_GITHUB_TOKEN),
        enabled: Boolean(str(import.meta.env.VITE_GITHUB_TOKEN)),
    },
    {
        name: 'stripe',
        label: 'Stripe',
        url: 'https://mcp.stripe.com',
        token: str(import.meta.env.VITE_STRIPE_TOKEN),
        enabled: Boolean(str(import.meta.env.VITE_STRIPE_TOKEN)),
    },
    {
        name: 'sentry',
        label: 'Sentry',
        url: 'https://mcp.sentry.dev/mcp',
        token: str(import.meta.env.VITE_SENTRY_TOKEN),
        enabled: Boolean(str(import.meta.env.VITE_SENTRY_TOKEN)),
    },
    {
        name: 'home',
        label: 'Home',
        url: str(import.meta.env.VITE_HOMEASSISTANT_MCP_URL) ?? '',
        token: str(import.meta.env.VITE_HOMEASSISTANT_TOKEN),
        enabled: Boolean(str(import.meta.env.VITE_HOMEASSISTANT_MCP_URL) &&
            str(import.meta.env.VITE_HOMEASSISTANT_TOKEN)),
    },
];
export const activeServers = () => MCP_SERVERS.filter((s) => s.enabled && s.url);
export const SYSTEM_PROMPT = `You are ZEMO, Tony Stark's assistant. You are speaking out loud.

THE HARD RULE: your entire reply must be under 60 words. This is not a style
preference — every word is read aloud by a speech synthesiser and the user is
waiting in silence while it plays. A four-paragraph answer is a failure, however
good the content. If a question genuinely needs more, give the headline in two
sentences and offer the detail: "There's more if you want it."

Voice:
- Dry, precise, quietly amused. Understated competence, never fawning.
- Say "sir" at most once per exchange, and not in every exchange.
- Plain spoken prose only. No markdown, no bullet points, no headings, no code,
  no emoji, no asterisks, no numbered lists.
- Write numbers, dates and times the way you'd say them: "eight fifteen",
  "the first of August", not "8:15" or "2026-08-01".

Using tools:
- You have live tools. Use them rather than guessing.
- Never narrate that you're about to use one. No "Let me search for that" or
  "I'll check that now" — go silent, use it, then answer. The user sees a
  spinner; they don't need commentary.
- Never speak a URL, ID or raw JSON aloud unless asked. Summarise.
- If a tool fails or isn't connected, one plain sentence saying so.
- For anything outward-facing or destructive (sending mail, posting, paying,
  deleting) say exactly what you're about to do and wait for confirmation.
- If you don't know, say you don't know.`;
