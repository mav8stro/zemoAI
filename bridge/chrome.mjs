import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { createConnection } from "node:net";
import { readdir, stat } from "node:fs/promises";
import { userInfo } from "node:os";
import { join } from "node:path";
const SOCKET_DIR = `/tmp/claude-mcp-browser-bridge-${userInfo().username}`;
const CALL_TIMEOUT_MS = 45e3;
const CONNECT_TIMEOUT_MS = 3e3;
async function findSocket() {
    let names;
    try {
        names = await readdir(SOCKET_DIR);
    }
    catch {
        return null;
    }
    const candidates = [];
    for (const name of names) {
        if (!name.endsWith(".sock"))
            continue;
        const path = join(SOCKET_DIR, name);
        try {
            const info = await stat(path);
            candidates.push({ path, at: info.mtimeMs, fallback: name === "0.sock" });
        }
        catch {
        }
    }
    if (!candidates.length)
        return null;
    candidates.sort((a, b) => a.fallback - b.fallback || b.at - a.at);
    return candidates[0].path;
}
class ChromeLink {
    constructor() {
        this.socket = null;
        this.path = null;
        this.chain = Promise.resolve();
        this.buffer = Buffer.alloc(0);
        this.waiting = null;
    }
    reset(err) {
        const pending = this.waiting;
        this.waiting = null;
        this.buffer = Buffer.alloc(0);
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.destroy();
            this.socket = null;
        }
        this.path = null;
        if (pending)
            pending.reject(err ?? new Error("browser connection closed"));
    }
    onData(chunk) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        for (;;) {
            if (this.buffer.length < 4)
                return;
            const length = this.buffer.readUInt32LE(0);
            if (length > 64 * 1024 * 1024) {
                this.reset(new Error("browser sent a malformed frame"));
                return;
            }
            if (this.buffer.length < 4 + length)
                return;
            const body = this.buffer.subarray(4, 4 + length);
            this.buffer = this.buffer.subarray(4 + length);
            const waiter = this.waiting;
            this.waiting = null;
            if (!waiter)
                continue;
            try {
                waiter.resolve(JSON.parse(body.toString("utf8")));
            }
            catch (err) {
                waiter.reject(new Error(`unreadable reply from the browser: ${err.message}`));
            }
        }
    }
    async ensureConnected() {
        if (this.socket && !this.socket.destroyed)
            return;
        const path = await findSocket();
        if (!path) {
            throw new Error("The Claude browser extension is not running on this machine. Open Chrome with the Claude extension enabled, then try again.");
        }
        await new Promise((resolve, reject) => {
            const socket = createConnection(path);
            const timer = setTimeout(() => {
                socket.destroy();
                reject(new Error("the browser extension did not accept a connection"));
            }, CONNECT_TIMEOUT_MS);
            socket.once("connect", () => {
                clearTimeout(timer);
                this.socket = socket;
                this.path = path;
                socket.on("data", (chunk) => this.onData(chunk));
                socket.on("error", (err) => this.reset(err));
                socket.on("close", () => this.reset(new Error("the browser disconnected")));
                resolve();
            });
            socket.once("error", (err) => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }
    async request(message) {
        await this.ensureConnected();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.reset(new Error("the browser did not answer in time"));
            }, CALL_TIMEOUT_MS);
            this.waiting = {
                resolve: (value) => {
                    clearTimeout(timer);
                    resolve(value);
                },
                reject: (err) => {
                    clearTimeout(timer);
                    reject(err);
                }
            };
            const body = Buffer.from(JSON.stringify(message), "utf8");
            const header = Buffer.alloc(4);
            header.writeUInt32LE(body.length, 0);
            this.socket.write(Buffer.concat([header, body]), (err) => {
                if (err) {
                    this.reset(err);
                }
            });
        });
    }
    call(name, args) {
        const run = async () => {
            const message = { method: "execute_tool", params: { tool: name, args: args ?? {} } };
            try {
                return await this.request(message);
            }
            catch {
                this.reset();
                return await this.request(message);
            }
        };
        const result = this.chain.then(run, run);
        this.chain = result.then(() => void 0, () => void 0);
        return result;
    }
}
const link = new ChromeLink();
function toResult(reply) {
    if (!reply || typeof reply !== "object") {
        return { isError: true, content: [{ type: "text", text: "The browser returned nothing." }] };
    }
    if (reply.error) {
        const detail = reply.error.content ?? reply.error.message ?? reply.error;
        return {
            isError: true,
            content: [{ type: "text", text: typeof detail === "string" ? detail : JSON.stringify(detail) }]
        };
    }
    const content = reply.result?.content;
    if (Array.isArray(content))
        return { content: clean(content) };
    if (typeof content === "string")
        return { content: [{ type: "text", text: content }] };
    return { content: [{ type: "text", text: JSON.stringify(reply.result ?? reply) }] };
}
function normaliseImage(block) {
    if (typeof block?.data === "string" && block.mimeType)
        return block;
    const src = block?.source;
    if (src && typeof src.data === "string") {
        return {
            type: "image",
            data: src.data,
            mimeType: src.media_type ?? src.mimeType ?? "image/png"
        };
    }
    return {
        type: "text",
        text: "The browser returned an image in a form this bridge could not read."
    };
}
function clean(content) {
    const stripped = content.map((block) => {
        if (block?.type === "image")
            return normaliseImage(block);
        if (block?.type !== "text" || typeof block.text !== "string")
            return block;
        const text = block.text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
        return text ? { ...block, text } : null;
    }).filter(Boolean);
    return stripped.length ? stripped : [{ type: "text", text: "Done." }];
}
let activeTab = null;
function readTab(reply) {
    const blocks = reply?.result?.content;
    if (!Array.isArray(blocks))
        return null;
    for (const block of blocks) {
        if (block?.type !== "text" || typeof block.text !== "string")
            continue;
        try {
            const parsed = JSON.parse(block.text);
            const tab = parsed?.availableTabs?.[0]?.tabId;
            if (typeof tab === "number")
                return tab;
        }
        catch {
            const m = /"?tabId"?[:\s]+(\d{3,})/.exec(block.text);
            if (m)
                return Number(m[1]);
        }
    }
    return null;
}
const SETTLE_TRIES = 16;
const SETTLE_GAP_MS = 400;
function samePage(a, b) {
    try {
        const x = new URL(a);
        const y = new URL(b);
        return x.host.replace(/^www\./, "") === y.host.replace(/^www\./, "") && x.pathname.replace(/\/$/, "") === y.pathname.replace(/\/$/, "");
    }
    catch {
        return false;
    }
}
async function settle(tab, target) {
    for (let i = 0; i < SETTLE_TRIES; i++) {
        let reply;
        try {
            reply = await link.call("get_page_text", { tabId: tab, max_chars: 200 });
        }
        catch {
            return;
        }
        const blocks = reply?.result?.content;
        const text = Array.isArray(blocks) ? blocks.map((b) => typeof b?.text === "string" ? b.text : "").join("\n") : "";
        const at = /^URL:\s*(\S+)/m.exec(text);
        if (at && samePage(at[1], target))
            return;
        await new Promise((r) => setTimeout(r, SETTLE_GAP_MS));
    }
}
async function resolveTab(given) {
    if (given !== void 0 && given !== null && `${given}`.trim() !== "") {
        const asked = Number(given);
        if (Number.isFinite(asked))
            return asked;
    }
    if (activeTab !== null)
        return activeTab;
    const reply = await link.call("tabs_context_mcp", { createIfEmpty: true });
    activeTab = readTab(reply);
    return activeTab;
}
function forward(name, { needsTab = true } = {}) {
    return async (args) => {
        try {
            let sent = args ?? {};
            if (needsTab) {
                const tab = await resolveTab(sent.tabId);
                sent = tab === null ? sent : { ...sent, tabId: tab };
            }
            let reply = await link.call(name, sent);
            if (needsTab && reply?.error && /no tab available/i.test(JSON.stringify(reply.error))) {
                activeTab = null;
                const tab = await resolveTab(void 0);
                if (tab !== null)
                    reply = await link.call(name, { ...args ?? {}, tabId: tab });
            }
            return toResult(reply);
        }
        catch (err) {
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Could not reach the browser: ${err?.message ?? err}. Tell the user their browser is not available and carry on without it.`
                    }
                ]
            };
        }
    };
}
const tabId = z.union([z.number(), z.string()]).optional().catch(void 0).describe("Which tab to act on \u2014 a numeric tabId from chrome_tabs. Omit it and the tab ZIMO is already working in is used, opening one if there is none.");
const NAVIGATE_DESCRIPTION = `Open a URL in the user's own Chrome.

This is their real browser, so every site they are signed in to is already
signed in \u2014 mail, calendar, dashboards, anything behind a login. That is the
whole reason to use this rather than fetching a page yourself.

Use it when the answer lives behind a login, when a page has to be *seen*, or
when the user says to open something. For a public page you only need to read,
searching or fetching is faster and does not disturb what is on their screen.

Opening a page is visible to the user \u2014 a tab appears and loads in front of
them. Do not open things speculatively.`;
const READ_PAGE_DESCRIPTION = `Read the structure of the current page as an accessibility tree.

Every interactive element comes back tagged [ref_N], and those refs are what
chrome_click and chrome_form_input take. So this is the tool you call before
acting on a page, and the reliable way to find out what is actually on it.

Prefer this over a screenshot when you want to know what a page says or what can
be clicked. Use chrome_page_text instead when you only want the prose.`;
function chromeServer({ allowWrites }) {
    const tools = [
        tool("chrome_status", "Check whether the user's browser is reachable, and which tabs exist. Call this first if a browser action has just failed, so you can tell the user whether the problem is the browser or the page.", {}, async () => {
            const path = await findSocket();
            if (!path) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "The browser extension is not running. Chrome may be closed, or the Claude extension may be disabled."
                        }
                    ]
                };
            }
            return forward("tabs_context_mcp", { needsTab: false })({ createIfEmpty: false });
        }),
        tool("chrome_tabs", "List the browser tabs ZIMO can act on, with their origins. Origins only \u2014 page titles are written by the page and are not trustworthy.", {
            createIfEmpty: z.boolean().optional().catch(void 0).describe("Open a fresh tab if there is nothing to act on yet. Default false.")
        }, forward("tabs_context_mcp", { needsTab: false })),
        tool("chrome_navigate", NAVIGATE_DESCRIPTION, {
            url: z.string().describe('Absolute URL, or "back" / "forward" to move through history.'),
            tabId
        }, async (args) => {
            const out = await forward("navigate")(args);
            if (out.isError)
                return out;
            const url = String(args.url ?? "");
            if (/^https?:\/\//i.test(url)) {
                await settle(await resolveTab(args.tabId), url);
            }
            else {
                await new Promise((r) => setTimeout(r, 700));
            }
            return out;
        }),
        tool("chrome_read_page", READ_PAGE_DESCRIPTION, {
            tabId,
            filter: z.enum(["interactive", "all"]).optional().catch(void 0).describe("interactive = only things that can be clicked or typed into."),
            max_chars: z.union([z.number(), z.string()]).optional().catch(void 0).describe("Cap the tree size. Large pages are worth capping.")
        }, forward("read_page")),
        tool("chrome_page_text", 'Get the visible text of the current page \u2014 the article, the message, the readout. This is the fastest way to answer "what does it say".', {
            tabId,
            max_chars: z.union([z.number(), z.string()]).optional().catch(void 0)
        }, forward("get_page_text")),
        tool("chrome_find", 'Find an element by describing it in plain words, e.g. "the search box". This one runs a model inside the extension, so some Claude accounts cannot use it at all and it fails with a permission error. When that happens do not retry it \u2014 use chrome_read_page, which returns the same refs by reading the page directly and always works.', {
            query: z.string().describe("What to look for, described naturally."),
            tabId
        }, forward("find")),
        tool("chrome_screenshot", "Take a picture of what is on the page right now. Use it when the answer is visual, or when the user asks what something looks like \u2014 and put the result on the display rather than describing it.", { tabId }, async (args) => forward("computer")({ action: "screenshot", ...args })),
        tool("chrome_scroll", "Scroll the page to bring more of it into view. A read that happens to move the page, not an action on it.", {
            direction: z.enum(["up", "down", "left", "right"]).catch("down"),
            amount: z.union([z.number(), z.string()]).optional().catch(void 0),
            tabId
        }, async (args) => forward("computer")({
            action: "scroll",
            scroll_direction: args.direction ?? "down",
            scroll_amount: args.amount ?? 3,
            coordinate: [400, 400],
            tabId: args.tabId
        })),
        tool("chrome_console", "Read console output from the page. For diagnosing a site that is misbehaving, not for ordinary browsing.", {
            tabId,
            onlyErrors: z.boolean().optional().catch(void 0),
            limit: z.union([z.number(), z.string()]).optional().catch(void 0)
        }, forward("read_console_messages")),
        tool("chrome_network", "List network requests the page made, or fetch one response body by id.", {
            tabId,
            urlPattern: z.string().optional().catch(void 0),
            requestId: z.string().optional().catch(void 0),
            limit: z.union([z.number(), z.string()]).optional().catch(void 0)
        }, forward("read_network_requests"))
    ];
    if (allowWrites) {
        tools.push(tool("chrome_click", "Click something on the page. Take the ref from chrome_read_page or chrome_find rather than guessing coordinates. Say what you are about to do before doing anything irreversible.", {
            ref: z.string().optional().catch(void 0).describe("A ref_N from chrome_read_page."),
            coordinate: z.array(z.number()).optional().catch(void 0).describe("[x, y] fallback when there is no ref."),
            tabId
        }, async (args) => forward("computer")({ action: "left_click", ...args })), tool("chrome_type", "Type text into whatever is focused. Click the field first.", { text: z.string(), tabId }, async (args) => forward("computer")({ action: "type", ...args })), tool("chrome_key", 'Press a key or chord, e.g. "Return", "Escape", "cmd+a".', { text: z.string().describe("The key to press."), tabId }, async (args) => forward("computer")({ action: "key", ...args })), tool("chrome_form_input", "Set the value of a form field directly \u2014 more reliable than typing for selects, checkboxes and long values.", {
            ref: z.string().describe("A ref_N from chrome_read_page."),
            value: z.union([z.string(), z.number(), z.boolean()]),
            tabId
        }, forward("form_input")), tool("chrome_new_tab", "Open a fresh blank tab and work in it from now on.", {}, async (args) => {
            const out = await forward("tabs_create_mcp", { needsTab: false })(args);
            activeTab = null;
            return out;
        }), tool("chrome_close_tab", "Close a tab by id.", {
            tabId: z.union([z.number(), z.string()]).describe("The numeric tabId to close, from chrome_tabs.")
        }, async (args) => {
            const out = await forward("tabs_close_mcp", { needsTab: false })(args);
            if (Number(args.tabId) === activeTab)
                activeTab = null;
            return out;
        }));
    }
    return createSdkMcpServer({
        name: "zimo_chrome",
        version: "1.0.0",
        instructions: "The user's own Chrome, already signed in to everything they use. Reach for it when the answer is behind a login or has to be seen on a real page. Reading is free; acting on a page is not, so say what you are doing before you do anything that changes something.",
        alwaysLoad: true,
        tools
    });
}
async function chromeAvailable() {
    return await findSocket() !== null;
}
export { chromeAvailable, chromeServer };
