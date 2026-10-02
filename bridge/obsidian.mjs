import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
const configured = () => Boolean(process.env.OBSIDIAN_API_KEY);
const HOST = process.env.OBSIDIAN_HOST ?? "127.0.0.1:27124";
const BASE = `https://${HOST}`;
async function ob(path, init = {}) {
    if (!configured()) {
        return {
            ok: false,
            note: 'Obsidian is not connected. Install the "Local REST API" community plugin in Obsidian, copy its API key, and set OBSIDIAN_API_KEY (and OBSIDIAN_HOST if not default) before starting the bridge.'
        };
    }
    try {
        const res = await fetch(`${BASE}${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${process.env.OBSIDIAN_API_KEY}`,
                ...init.headers ?? {}
            },
            dispatcher: void 0
        });
        if (!res.ok)
            return { ok: false, note: `Obsidian REST API returned ${res.status}` };
        const ct = res.headers.get("content-type") ?? "";
        return { ok: true, data: ct.includes("json") ? await res.json() : await res.text() };
    }
    catch (err) {
        return {
            ok: false,
            note: `Could not reach Obsidian at ${BASE} \u2014 is the app open with the Local REST API plugin enabled? (${err.message})`
        };
    }
}
function obsidianServer({ allowWrites }) {
    return createSdkMcpServer({
        name: "obsidian",
        version: "1.0.0",
        tools: [
            tool("obsidian_list", "List notes in the vault, or in one folder. Use to see what's there before reading or writing.", { folder: z.string().optional().describe('Folder path within the vault, e.g. "Projects". Omit for the vault root.') }, async ({ folder }) => {
                const path = folder ? `/vault/${encodeURIComponent(folder)}/` : "/vault/";
                const r = await ob(path);
                return { content: [{ type: "text", text: r.ok ? JSON.stringify(r.data) : r.note }] };
            }),
            tool("obsidian_read", 'Read one note by its vault path (e.g. "Projects/Zimo.md").', { path: z.string().describe("Note path, including the .md extension.") }, async ({ path }) => {
                const r = await ob(`/vault/${encodeURIComponent(path)}`);
                return { content: [{ type: "text", text: r.ok ? typeof r.data === "string" ? r.data : JSON.stringify(r.data) : r.note }] };
            }),
            tool("obsidian_search", "Full-text search across the whole vault.", { query: z.string() }, async ({ query }) => {
                const r = await ob("/search/simple/", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ query, contextLength: 100 })
                });
                return { content: [{ type: "text", text: r.ok ? JSON.stringify(r.data) : r.note }] };
            }),
            tool("obsidian_write", "Create a note, or overwrite one that already exists, at the given path.", { path: z.string(), content: z.string() }, async ({ path, content }) => {
                if (!allowWrites) {
                    return { content: [{ type: "text", text: "Writes are disabled. Start the bridge with `npm run bridge:writes` to allow this." }] };
                }
                const r = await ob(`/vault/${encodeURIComponent(path)}`, {
                    method: "PUT",
                    headers: { "Content-Type": "text/markdown" },
                    body: content
                });
                return { content: [{ type: "text", text: r.ok ? `Saved ${path}.` : r.note }] };
            }),
            tool("obsidian_append", "Append text to the end of an existing note \u2014 the normal way to add a thought without disturbing what is already there.", { path: z.string(), content: z.string() }, async ({ path, content }) => {
                if (!allowWrites) {
                    return { content: [{ type: "text", text: "Writes are disabled. Start the bridge with `npm run bridge:writes` to allow this." }] };
                }
                const r = await ob(`/vault/${encodeURIComponent(path)}`, {
                    method: "POST",
                    headers: { "Content-Type": "text/markdown" },
                    body: content
                });
                return { content: [{ type: "text", text: r.ok ? `Appended to ${path}.` : r.note }] };
            })
        ]
    });
}
const obsidianConfigured = configured;
export { obsidianConfigured, obsidianServer };
