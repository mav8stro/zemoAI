import Anthropic from '@anthropic-ai/sdk';
import { env, MODEL, FAST_MODE, SYSTEM_PROMPT, activeServers } from '../config';
const client = new Anthropic({
    apiKey: env.anthropicKey,
    dangerouslyAllowBrowser: true,
});
export type Msg = Anthropic.Beta.BetaMessageParam;
export type AskHandlers = {
    onText: (delta: string) => void;
    onTool: (name: string) => void;
};
let active: ReturnType<typeof client.beta.messages.stream> | null = null;
let cancelled = false;
const MAX_CONTINUATIONS = 3;
export async function ask(history: Msg[], handlers: AskHandlers): Promise<{
    text: string;
    tools: string[];
}> {
    const servers = activeServers();
    const usedTools: string[] = [];
    let text = '';
    cancelled = false;
    const betas = ['mcp-client-2025-11-20'];
    if (FAST_MODE)
        betas.push('fast-mode-2026-02-01');
    const params = {
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        betas,
        ...(FAST_MODE ? { speed: 'fast' as const } : {}),
        thinking: { type: 'adaptive' as const },
        output_config: { effort: 'low' as const },
        mcp_servers: servers.map((s) => ({
            type: 'url' as const,
            name: s.name,
            url: s.url,
            ...(s.token ? { authorization_token: s.token } : {}),
        })),
        tools: [
            { type: 'web_search_20260209' as const, name: 'web_search' as const },
            ...servers.map((s) => ({
                type: 'mcp_toolset' as const,
                mcp_server_name: s.name,
            })),
        ],
    };
    let messages: Msg[] = history;
    try {
        for (let turn = 0;; turn++) {
            if (cancelled)
                return { text: text.trim(), tools: usedTools };
            const stream = client.beta.messages.stream({ ...params, messages });
            active = stream;
            stream.on('text', (delta) => {
                text += delta;
                handlers.onText(delta);
            });
            stream.on('streamEvent', (event) => {
                if (event.type !== 'content_block_start')
                    return;
                const block = event.content_block;
                if (block.type === 'mcp_tool_use') {
                    usedTools.push(block.name);
                    handlers.onTool(block.name);
                }
                else if (block.type === 'server_tool_use') {
                    usedTools.push(block.name);
                    handlers.onTool(block.name.replace(/_/g, ' '));
                }
            });
            let final: Anthropic.Beta.BetaMessage;
            try {
                final = await stream.finalMessage();
            }
            catch (err) {
                if (cancelled)
                    return { text: text.trim(), tools: usedTools };
                throw err;
            }
            finally {
                active = null;
            }
            if (final.stop_reason === 'pause_turn' && turn < MAX_CONTINUATIONS) {
                messages = [...messages, { role: 'assistant', content: final.content }];
                continue;
            }
            if (final.stop_reason === 'refusal') {
                const line = "I can't help with that one, sir.";
                handlers.onText(line);
                return { text: line, tools: usedTools };
            }
            if (final.stop_reason === 'max_tokens') {
                const line = ' There is more, if you want it.';
                handlers.onText(line);
                text += line;
            }
            else if (final.stop_reason === 'pause_turn') {
                const line = ' That is taking longer than it should, sir. Ask me again.';
                handlers.onText(line);
                text += line;
            }
            return { text: text.trim(), tools: usedTools };
        }
    }
    finally {
        active = null;
    }
}
export function cancel(): void {
    cancelled = true;
    active?.abort();
}
export function connectedLabels(): string[] {
    return activeServers().map((s) => s.label);
}
