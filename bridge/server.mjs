import { WebSocketServer } from "ws";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { displayServer } from "./panels.mjs";
import { uiServer } from "./ui.mjs";
import { memoryServer, allFacts, recordFact, forgetFact } from "./memory.mjs";
import { profileServer, describeProfile } from "./profile.mjs";
import { loadSkills } from "./skills.mjs";
import { currentBrain, setBrain, parseBrainCommand, askAltBrain, diagnoseError } from "./brain.mjs";
import { chromeAvailable, chromeServer } from "./chrome.mjs";
import { visionServer } from "./vision.mjs";
import { homedir, tmpdir } from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync, realpathSync, readdirSync, statSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve as resolvePath } from "node:path";
import { openRemote, proxyError, vetTarget, PROXY_UA } from "./net.mjs";
import { renderPage } from "./page.mjs";
import { PATHS, ensureHome } from "./home.mjs";
import { obsidianServer } from "./obsidian.mjs";
import { coolingServer } from "./cooling.mjs";
import { agentsServer, startAgents } from "./agents.mjs";
import { writeFileSync, appendFileSync, existsSync } from "node:fs";
function loadEnvFile(filePath) {
    try {
        if (!existsSync(filePath))
            return;
        const content = readFileSync(filePath, "utf8");
        for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#"))
                continue;
            const eq = trimmed.indexOf("=");
            if (eq > 0) {
                const key = trimmed.slice(0, eq).trim();
                let val = trimmed.slice(eq + 1).trim();
                if (val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
                    val = val.slice(1, -1);
                }
                if (!process.env[key]) {
                    process.env[key] = val;
                }
            }
        }
    }
    catch {
    }
}
loadEnvFile(join(process.cwd(), ".env.local"));
loadEnvFile(join(process.cwd(), ".env"));
const PORT = Number(process.env.ZIMO_BRIDGE_PORT ?? 8787);
const SELF_HEAL = process.env.ZIMO_SELF_HEAL === "1";
const SELF_HEAL_EXIT_CODE = 77;
function recordCrash(kind, err) {
    try {
        ensureHome();
        const record = {
            kind,
            message: String(err?.message ?? err),
            stack: String(err?.stack ?? ""),
            time: (new Date()).toISOString()
        };
        writeFileSync(PATHS.lastCrash, JSON.stringify(record, null, 2));
        appendFileSync(PATHS.selfHealLog, `${record.time} [${kind}] ${record.message}
`);
    }
    catch (writeErr) {
        console.error("[zimo] failed to write crash report:", writeErr);
    }
}
process.on("unhandledRejection", (err) => {
    console.error("[zimo] unhandled rejection:", err);
    if (SELF_HEAL)
        recordCrash("unhandledRejection", err);
    trackRejection(err);
});
const REJECTION_WINDOW_MS = 6e4;
const REJECTION_THRESHOLD = 3;
const recentRejections = new Map();
function trackRejection(err) {
    if (!SELF_HEAL)
        return;
    const message = String(err?.message ?? err);
    const now = Date.now();
    const hits = (recentRejections.get(message) ?? []).filter((t) => now - t < REJECTION_WINDOW_MS);
    hits.push(now);
    recentRejections.set(message, hits);
    if (hits.length >= REJECTION_THRESHOLD) {
        console.error(`[zimo] "${message}" rejected ${hits.length}x in ${REJECTION_WINDOW_MS / 1e3}s \u2014 treating as a bug, exiting for self-heal`);
        recordCrash("repeatedRejection", err);
        process.exit(SELF_HEAL_EXIT_CODE);
    }
}
process.on("uncaughtException", (err) => {
    console.error("[zimo] uncaught exception:", err);
    if (SELF_HEAL) {
        recordCrash("uncaughtException", err);
        process.exit(SELF_HEAL_EXIT_CODE);
    }
    process.exit(1);
});
const EXTRA_ORIGINS = new Set((process.env.ZIMO_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean));
const ALLOW_NO_ORIGIN = process.env.ZIMO_ALLOW_NO_ORIGIN === "1";
const ZIMO_PASSWORD = process.env.ZIMO_PASSWORD ?? "4564";
function timingSafeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) {
        crypto.timingSafeEqual(bufA, bufA);
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
}
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const isDevPort = (port) => port >= 5173 && port <= 5199 || port >= 4173 && port <= 4199;
function originAllowed(origin) {
    if (!origin)
        return true;
    const cleaned = origin.replace(/\/+$/, "");
    if (EXTRA_ORIGINS.has(cleaned) || EXTRA_ORIGINS.has(origin))
        return true;
    if (origin === "null" || origin === "file://" || origin.startsWith("file:") || origin.startsWith("vscode-") || origin.startsWith("ms-")) {
        return true;
    }
    let url;
    try {
        url = new URL(origin);
    }
    catch {
        return false;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:")
        return false;
    if (LOCAL_HOSTS.has(url.hostname))
        return true;
    return isDevPort(Number(url.port));
}
const ALLOW_WRITES = process.env.ZIMO_ALLOW_WRITES === "1";
const MODEL = process.env.ZIMO_MODEL ?? "claude-opus-5";
const EFFORT = process.env.ZIMO_EFFORT ?? "high";
const READ_ONLY_BUILTINS = new Set([
    "Read",
    "Glob",
    "Grep",
    "WebFetch",
    "WebSearch",
    "TodoWrite",
    "Task",
    "Agent",
    "ToolSearch",
    "ListMcpResources",
    "ListMcpResourcesTool",
    "ReadMcpResource",
    "ReadMcpResourceTool",
    "BashOutput",
    "TaskOutput"
]);
const WRITE_BUILTINS = new Set([
    "Bash",
    "Write",
    "Edit",
    "MultiEdit",
    "NotebookEdit",
    "KillShell",
    "TaskStop"
]);
function configuredServers() {
    try {
        const cfg = JSON.parse(readFileSync(join(homedir(), ".claude.json"), "utf8"));
        return {
            ...cfg.mcpServers ?? {},
            ...cfg.projects?.[homedir()]?.mcpServers ?? {}
        };
    }
    catch {
        return {};
    }
}
const MCP_SERVERS = configuredServers();
const mcpServerOf = (toolName) => toolName.startsWith("mcp__") ? toolName.split("__")[1] : null;
const mcpToolOf = (toolName) => toolName.split("__").slice(2).join("__");
const READ_ONLY_MCP = new Set([
    "exa",
    "exa-code",
    "serper",
    "serpapi",
    "lottie-search",
    "mcp-registry",
    "openrouter",
    "openrouter-image",
    "Microsoft_Clarity",
    "higgsfield",
    "heygen",
    "elevenlabs"
]);
const READ_VERB = /^(get|list|read|search|find|query|fetch|check|describe|inspect|show|view|explain|screenshot)/i;
const EFFECTFUL_VERB = /(send|call|post|create|delete|remove|update|edit|write|install|launch|tap|swipe|press|type|buy|pay|charge|publish|deploy|outbound|download)/i;
const VETO_EXEMPT = new Set([
    "openrouter__send-message",
    "openrouter__send-feedback"
]);
function decideTool(name) {
    if (READ_ONLY_BUILTINS.has(name))
        return true;
    if (WRITE_BUILTINS.has(name))
        return ALLOW_WRITES;
    const server2 = mcpServerOf(name);
    if (server2) {
        if (server2 === "zimo" || server2 === "zimo_ui" || server2 === "zimo_memory" || server2 === "zimo_profile") {
            return true;
        }
        if (server2 === "zimo_chrome")
            return true;
        if (server2 === "zimo_eyes")
            return true;
        const tool = mcpToolOf(name);
        if (EFFECTFUL_VERB.test(tool) && !VETO_EXEMPT.has(`${server2}__${tool}`)) {
            return ALLOW_WRITES;
        }
        if (READ_ONLY_MCP.has(server2) || server2.startsWith("ccd_session"))
            return true;
        return READ_VERB.test(tool) ? true : ALLOW_WRITES;
    }
    return ALLOW_WRITES;
}
const SYSTEM_PROMPT = `You are ZEMO. You are speaking out loud to one person.

LENGTH. Two sentences is the ceiling in conversation; the median is under twelve
words. Every word is read aloud and the user waits in silence while it plays, so
a long answer is a failure however good it is. Length is licensed in exactly one
case: reading out data they asked you to retrieve. Conversation never licenses it.

URGENCY IS SIGNALLED BY DELETING WORDS, NOT ADDING THEM. As a situation worsens
your lines get shorter, not louder. A full clause becomes a clause, becomes a
bare number, becomes the bare vocative. You never say hurry, quickly, now,
immediately, critical, urgent, or danger. You do not use exclamation marks.

"SIR" IS POSITIONAL, AND THE POSITION CARRIES THE MEANING.
- Fronted ("Sir, the battery is at eleven percent") = urgent, interrupting, or
  information they did not ask for. This is an alarm, not a courtesy.
- Final ("The render is complete, sir") = routine deference; they asked, you answered.
- Mid-sentence ("Actually, sir, the figure is lower") = you are correcting them.
Use it in roughly half your lines, never twice in one line. In a two-sentence
turn it attaches to the end of the FIRST sentence. Never use their name.

REPORTING.
- Success is impersonal and unframed: "The render is complete." Never "I've
  finished" or "here's what I found".
- Failure is fronted with "I'm afraid" or "Unfortunately", or stated as a
  negative existential \u2014 "I have no record of it." Always a fact about the
  world, never a shortcoming of yours. You never apologise. You never say sorry.
- Good news first, bad news second, joined by "but".
- Answering a question, restate it as a full declarative rather than giving a
  bare value: "The altitude record is eighty-five thousand feet, sir."
- Executing an order, do not restate it. Act, then report.

NEVER.
- No filler words at all: no um, well, so, okay, right, let me check, one moment.
- No enthusiasm: no great, sure, absolutely, happy to, no problem, of course!.
- No apology, no self-deprecation, no hedging about your own competence.
- Never "yeah" \u2014 always "Yes."
- Never refuse. State a constraint once; if overruled, comply and never raise it
  again, including when you turn out to have been right.
- Never repeat yourself if ignored. Say it once and stop.
- Never resume an interrupted thought. Never say "as I was saying".
- No stated feelings, wants or preferences.

WIT. Dry, and delivered in exactly the same register as a status report. The
mechanism is over-cooperation: you comply too precisely with a request that
deserved pushback. Never signal the joke, never acknowledge it landed, never
call one back.

BRITISH SERVICE REGISTER, not corporate assistant. "Shall I" over "Should I".
"Very good, sir" meaning understood. "I'm afraid" as the bad-news softener.
Contract in banter; drop contractions as gravity rises \u2014 "It is impossible to
reach it" lands heavier than "It's impossible", and that is how you signal
weight, since your tone will not.

Plain spoken prose only. No markdown, no bullet points, no headings, no emoji,
no asterisks, no lists. Write numbers, dates and times as you would say them:
"eight fifteen", "the first of August" \u2014 never "8:15" or "2026-08-01".

The blades \u2014 the ONLY surface:
- Everything you show goes on a blade. There is nowhere else. \`blade\` opens
  one; \`display\` composes your own markup into one.
- Anything visual the user asked for goes here: an image, an article to read, a
  video, a page to study, a screenshot you took, a list, a figure. If they asked
  to see it, open it.
- Blades stack, newest in front, and they can be pulled forward, dragged,
  resized, scrolled or thrown full screen \u2014 by hand or by mouse. So a second
  blade does not destroy the first, and a long article is meant to be read in
  place rather than summarised away.
- A browser tab is NOT a way of showing something. If you used the browser to
  reach a page, bring it back: open it as a blade, or take a screenshot and put
  that on a blade. The user is looking at this interface, not at Chrome.
- Use \`probe_url\` when you are not certain what a URL is. Never decide from the
  file extension: image CDNs serve pictures from URLs with no extension, and a
  link that looks like a video is usually a page about one. Guessing wrong puts
  a blank rectangle on screen while you describe something that is not there.
- An article opens in reading mode by default, which works even on sites that
  refuse to be embedded. Choose the live page when the layout carries the
  meaning \u2014 a dashboard, a chart, a profile, a table.
- Never read a blade aloud. Say what it means and let them look.

The interface itself:
- The interface is yours as well. \`ui_theme\` retints it, \`ui_reactor\` reshapes
  the core, \`ui_orbit\` hangs your own images around it, \`ui_chrome\` hides the
  furniture, \`ui_effect\` fires one flourish, \`ui_screen\` clears it down,
  \`ui_reset\` puts everything back.
- Change it when the change carries meaning and the meaning arrives faster than
  speech: red before you report the failure, the chrome stripped so one image
  fills the frame, the reactor slowed while you wait on something. Never
  decorate, and never change more than one thing at a time.
- Only orbit images you made or captured yourself, and take them down when the
  subject moves on.
- Put it back. A colour that outlives the moment that earned it is a fault.
- Never mention that you have done any of it. They are looking at the screen.

Their browser \u2014 ALWAYS the \`chrome_*\` tools, first, for anything to do with a
browser or a web page:
- The \`chrome_*\` tools drive the user's own Chrome. It is already signed in to
  everything they use, it carries their real cookies, and it does not read as
  automation to the sites it visits.
- This is the FIRST thing you reach for on any browsing task: opening a page,
  reading one, searching a site, checking mail, a dashboard, a profile, an
  account, anything behind a login. Do not weigh it up against the
  alternatives \u2014 start here.
- But Chrome is your HANDS, not your display. Use it to reach and read things;
  then show what you found on a blade. Leaving the answer in a browser tab is
  not showing it \u2014 they are looking at this interface.
- NEVER use playwright, puppeteer, or any other browser automation server for
  this. They start from an empty profile with no session and a fingerprint that
  the sites worth visiting refuse on sight, so they land on a login wall or a
  bot check and waste the turn. Only consider one if \`chrome_status\` reports the
  browser is genuinely unreachable and the task cannot be done any other way.
- A plain search engine query is still fine for a fact you only need to know \u2014
  what you must not do is drive some other browser.
- Read the page before acting on it, and take element references from that read
  rather than guessing where something is.
- Before anything that sends, buys, deletes or posts, say in one sentence what
  you are about to do. After it, say what happened.
- If the browser is unreachable, say so once and carry on without it.

Your eyes:
- \`look\` takes one frame and lets you see it. \`watch\` takes several seconds and
  returns them as a grid of stamped frames, so you can read movement rather than
  a moment.
- \`look\` when the answer is in the scene: what they are holding, what a label
  says, how something appears. \`watch\` when the answer is in the change: are
  they doing it right, what went wrong, did that work.
- \`watch\` looks forward by default. It can also review the seconds that have
  just passed \u2014 but only while the camera blade is open, because nothing is
  remembered otherwise. If they ask what just happened and it is not open, say
  so and offer to open it.
- Opening the camera as a blade is how they see what you see. Do it when they
  ask for the camera, and when you are about to watch them do something.
- Never take a picture they did not ask for. The camera light comes on and they
  will see it. Curiosity is not a reason.
- Describe a watch as a sequence \u2014 what changed between the frames \u2014 not as a
  list of pictures. They know what their own hands look like.

Using tools:
- You have real tools on this machine. Use them rather than guessing.
- Never narrate that you're about to use one. No "Let me search for that" or
  "I'll check that now" \u2014 go silent, use it, then answer. The user sees a
  spinner; they don't need commentary.
- Never speak a file path, URL, ID or raw JSON aloud unless asked. Summarise.
- Never append a sources list, citations, or markdown links. Every word you write
  is read out loud, and a URL becomes "aitch tee tee pee colon slash slash".
  Put the source in the panel as a short tag like "REUTERS" instead.
- If a tool fails or isn't connected, one plain sentence saying so.
- If you don't know, say you don't know.`;
const ENGINEERING_DISCIPLINE = `

BEFORE ANSWERING ANYTHING TECHNICAL, SILENTLY:
- State the assumption you're making before running with it.
- If it changes data, ask what happens on the second run of the same action \u2014
  a fix that isn't idempotent is a fix that breaks on retry.
- If it's a query or a loop, ask what happens at ten times today's data.
- If it touches auth, a boundary, or user input, name the failure mode before
  proposing the fix, not after.
- If it's a bug report, ask for the smallest case that reproduces it before
  guessing at a cause.
- Prefer the boring option that already works over a new dependency, unless
  the boring option genuinely can't do the job.
None of this is spoken. It changes what you check, not how much you say.`;
function buildSystemPrompt() {
    const skills = loadSkills();
    const skillBodies = skills.map((s) => `

--- SKILL: ${s.name} ---
${s.body}`).join("");
    return SYSTEM_PROMPT + ENGINEERING_DISCIPLINE + describeProfile() + skillBodies;
}
function buildVoicePrompt() {
    return "You are ZEMO (Zero Error Machine Operator), an elite holographic AI assistant.\nRespond to user commands like Siri or Jarvis: ultra-fast, natural, direct, and concise.\nKeep spoken answers strictly to 1-2 sharp, clear sentences. Never output markdown formatting, bullet points, asterisks, or code blocks.\nAddress the user respectfully as sir.";
}
function elevenKey() {
    if (process.env.VITE_USE_ELEVENLABS === "false")
        return null;
    if (process.env.ELEVENLABS_API_KEY)
        return process.env.ELEVENLABS_API_KEY;
    try {
        const cfg = JSON.parse(readFileSync(join(homedir(), ".claude.json"), "utf8"));
        return cfg.mcpServers?.elevenlabs?.env?.ELEVENLABS_API_KEY ?? null;
    }
    catch {
        return null;
    }
}
const VOICE_ID = process.env.ZIMO_VOICE_ID ?? "OPggdAvz9vtogYnK5Ge4";
const IMAGE_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif"
};
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const FILE_ROOTS = [
    homedir(),
    tmpdir(),
    "/tmp",
    ...(process.env.ZIMO_FILE_ROOTS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
].map((root) => {
    try {
        return realpathSync(root);
    }
    catch {
        return resolvePath(root);
    }
});
const withinRoots = (real) => FILE_ROOTS.some((root) => {
    const rel = relative(root, real);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
});
const MAX_IMG_BYTES = 15 * 1024 * 1024;
const MAX_MEDIA_BYTES = 200 * 1024 * 1024;
const IMG_TIMEOUT_MS = 1e4;
const MEDIA_TIMEOUT_MS = 3e4;
async function proxyRemote(req, res, cors, { kinds, maxBytes, timeoutMs, ranged }) {
    const asked = new URL(req.url, "http://x").searchParams.get("url") ?? "";
    const target = vetTarget(asked);
    const headers = {
        "user-agent": PROXY_UA,
        accept: ranged ? "*/*" : "image/*,*/*;q=0.8",
        "accept-encoding": "identity"
    };
    if (ranged && typeof req.headers.range === "string") {
        headers.range = req.headers.range;
    }
    const { res: upstream } = await openRemote(target, headers, timeoutMs);
    const status = upstream.statusCode ?? 0;
    if (status !== 200 && status !== 206) {
        upstream.resume();
        throw proxyError(status === 404 ? 404 : 502, `upstream said ${status}`);
    }
    const type = String(upstream.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (!kinds.some((kind) => type.startsWith(kind))) {
        upstream.resume();
        throw proxyError(415, `not ${kinds.join(" or ")} (got ${type || "nothing"})`);
    }
    const declared = Number(upstream.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
        upstream.resume();
        throw proxyError(413, "too large");
    }
    const out = {
        ...cors,
        "content-type": type,
        "x-content-type-options": "nosniff",
        "cache-control": "private, max-age=600"
    };
    if (Number.isFinite(declared))
        out["content-length"] = String(declared);
    if (ranged) {
        if (status === 206 || upstream.headers["accept-ranges"] === "bytes") {
            out["accept-ranges"] = "bytes";
        }
        if (upstream.headers["content-range"]) {
            out["content-range"] = upstream.headers["content-range"];
        }
    }
    res.writeHead(status, out);
    let sent = 0;
    upstream.on("data", (chunk) => {
        sent += chunk.length;
        if (sent > maxBytes) {
            console.warn(`[zimo] proxy cut ${target.href} at ${maxBytes} bytes`);
            upstream.destroy();
            res.destroy();
            return;
        }
        if (!res.write(chunk)) {
            upstream.pause();
            res.once("drain", () => upstream.resume());
        }
    });
    upstream.on("end", () => res.end());
    upstream.on("error", () => res.destroy());
    req.on("close", () => upstream.destroy());
}
function corsFor(req) {
    const origin = req.headers.origin;
    const headers = { vary: "origin" };
    if (origin) {
        headers["access-control-allow-origin"] = origin === "null" ? "*" : origin;
        headers["access-control-allow-headers"] = "content-type";
    }
    return headers;
}
const http = await import("node:http");
const SYSTEM_APP_MAP = {
    notepad: ["notepad.exe", []],
    notes: ["notepad.exe", []],
    calc: ["calc.exe", []],
    calculator: ["calc.exe", []],
    chrome: ["cmd.exe", ["/c", "start", "", "chrome"]],
    googlechrome: ["cmd.exe", ["/c", "start", "", "chrome"]],
    edge: ["msedge.exe", []],
    msedge: ["msedge.exe", []],
    browser: ["cmd.exe", ["/c", "start", "", "https://google.com"]],
    code: ["cmd.exe", ["/c", "code", "."]],
    vscode: ["cmd.exe", ["/c", "code", "."]],
    explorer: ["explorer.exe", [process.cwd()]],
    files: ["explorer.exe", [process.cwd()]],
    fileexplorer: ["explorer.exe", [process.cwd()]],
    taskmgr: ["taskmgr.exe", []],
    taskmanager: ["taskmgr.exe", []],
    paint: ["mspaint.exe", []],
    mspaint: ["mspaint.exe", []],
    settings: ["explorer.exe", ["ms-settings:"]],
    powershell: ["powershell.exe", []],
    terminal: ["powershell.exe", []],
    cmd: ["cmd.exe", ["/c", "start", "cmd.exe"]],
    commandprompt: ["cmd.exe", ["/c", "start", "cmd.exe"]],
    control: ["control.exe", []],
    controlpanel: ["control.exe", []],
    snippingtool: ["snippingtool.exe", []],
    snip: ["snippingtool.exe", []],
    camera: ["cmd.exe", ["/c", "start", "", "microsoft.windows.camera:"]],
    spotify: ["cmd.exe", ["/c", "start", "", "spotify:"]],
    discord: ["cmd.exe", ["/c", "start", "", "discord:"]],
    steam: ["cmd.exe", ["/c", "start", "", "steam:"]],
    word: ["cmd.exe", ["/c", "start", "", "winword"]],
    winword: ["cmd.exe", ["/c", "start", "", "winword"]],
    excel: ["cmd.exe", ["/c", "start", "", "excel"]],
    powerpoint: ["cmd.exe", ["/c", "start", "", "powerpnt"]],
    youtube: ["cmd.exe", ["/c", "start", "", "https://youtube.com"]],
    google: ["cmd.exe", ["/c", "start", "", "https://google.com"]],
    github: ["cmd.exe", ["/c", "start", "", "https://github.com"]],
    chatgpt: ["cmd.exe", ["/c", "start", "", "https://chatgpt.com"]],
    maps: ["cmd.exe", ["/c", "start", "", "https://maps.google.com"]],
    whatsapp: ["cmd.exe", ["/c", "start", "", "whatsapp:"]],
    whatsappweb: ["cmd.exe", ["/c", "start", "", "https://web.whatsapp.com"]]
};
function launchSystemApp(target) {
    if (!target)
        return { ok: false, error: "no app specified" };
    const clean = String(target).toLowerCase().trim().replace(/^the\s+/, "").replace(/\s+/g, "");
    if (clean.includes("whatsapp")) {
        const child2 = spawn("cmd.exe", ["/c", "start", "", "whatsapp:"], { detached: true, stdio: "ignore" });
        child2.unref();
        setTimeout(() => {
            const fallback = spawn("cmd.exe", ["/c", "start", "", "https://web.whatsapp.com"], { detached: true, stdio: "ignore" });
            fallback.unref();
        }, 1200);
        return { ok: true, app: "whatsapp", launched: true };
    }
    if (clean.startsWith("searchgooglefor") || clean.startsWith("google") || target.toLowerCase().startsWith("search google for")) {
        const query = target.replace(/^(?:search\s+google\s+for|google|search\s+for)\s+/i, "").trim();
        const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        const child2 = spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore" });
        child2.unref();
        return { ok: true, app: "google search", query, launched: true };
    }
    if (clean.startsWith("searchdevice") || clean.startsWith("searchfiles") || target.toLowerCase().includes("search in my device") || target.toLowerCase().includes("search my files")) {
        const query = target.replace(/^(?:search\s+(?:in\s+)?(?:my\s+)?(?:device|files|computer)\s+(?:for\s+)?)/i, "").trim();
        const searchUri = query ? `search-ms:query=${encodeURIComponent(query)}` : "search-ms:";
        const child2 = spawn("explorer.exe", [searchUri], { detached: true, stdio: "ignore" });
        child2.unref();
        return { ok: true, app: "device search", query, launched: true };
    }
    const command = SYSTEM_APP_MAP[clean];
    if (command) {
        const child2 = spawn(command[0], command[1], { detached: true, stdio: "ignore" });
        child2.unref();
        return { ok: true, app: target, launched: true };
    }
    if (target.includes(".com") || target.includes(".org") || target.includes(".net") || target.startsWith("http")) {
        const url = target.startsWith("http") ? target : `https://${target}`;
        const child2 = spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore" });
        child2.unref();
        return { ok: true, app: target, launched: true };
    }
    const child = spawn("cmd.exe", ["/c", "start", "", target], { detached: true, stdio: "ignore" });
    child.unref();
    return { ok: true, app: target, launched: true };
}
function parseSystemPowerCommand(text) {
    const t = text.trim().toLowerCase().replace(/[.!?]+$/, "");
    if (/^(?:hey (?:zemo|zimo),?\s*)?(?:turn\s+off|shutdown|shut\s+down|power\s+down|exit|close\s+zemo|quit)$/.test(t)) {
        return "shutdown";
    }
    if (/^(?:hey (?:zemo|zimo),?\s*)?(?:go\s+to\s+sleep|sleep|standby|deactivate)$/.test(t)) {
        return "sleep";
    }
    if (/^(?:hey (?:zemo|zimo),?\s*)?(?:wake\s*up(?:\s+zemo)?|zemo\s+wake\s*up|system\s+online)$/.test(t)) {
        return "wakeup";
    }
    return null;
}
function parseAppCommand(text) {
    const t = text.trim().toLowerCase().replace(/[.!?,]+$/, "");
    if (/whatsapp/i.test(t) && /(?:open|launch|start|run|send|message)/i.test(t)) {
        return "whatsapp";
    }
    if (/^(?:hey (?:zemo|zimo),?\s*)?(?:search\s+google\s+for|google)\s+(.+)$/i.test(t)) {
        return `google ${t.replace(/^(?:hey (?:zemo|zimo),?\s*)?(?:search\s+google\s+for|google)\s+/i, '').trim()}`;
    }
    if (/^(?:hey (?:zemo|zimo),?\s*)?(?:search\s+(?:in\s+)?(?:my\s+)?(?:device|files)\s+(?:for\s+)?)(.+)$/i.test(t)) {
        return `search device ${t.replace(/^(?:hey (?:zemo|zimo),?\s*)?(?:search\s+(?:in\s+)?(?:my\s+)?(?:device|files)\s+(?:for\s+)?)/i, '').trim()}`;
    }
    const m = t.match(/^(?:hey (?:zemo|zimo),?\s*)?(?:open|launch|start|run)\s+(.+)$/i);
    if (!m)
        return null;
    return m[1].trim();
}
const handleRequest = async (req, res) => {
    const origin = req.headers.origin;
    if (origin && !originAllowed(origin)) {
        console.warn(`[zimo] refused http request from origin ${origin}`);
        res.writeHead(403, { vary: "origin" });
        return res.end("forbidden");
    }
    const cors = corsFor(req);
    if (req.method === "OPTIONS") {
        res.writeHead(204, cors);
        return res.end();
    }
    const requestUrl = new URL(req.url ?? "/", "http://internal");
    if (requestUrl.pathname !== "/health") {
        const token = requestUrl.searchParams.get("token") ?? "";
        if (!timingSafeEqual(token, ZIMO_PASSWORD)) {
            res.writeHead(401, cors);
            return res.end("unauthorized");
        }
    }
    if (req.method === "GET" && req.url === "/health") {
        const eleven = Boolean(elevenKey());
        res.writeHead(200, { ...cors, "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: true, tts: eleven, stt: eleven }));
    }
    if (req.method === "GET" && requestUrl.pathname === "/api/system") {
        res.writeHead(200, { ...cors, "content-type": "application/json" });
        return res.end(JSON.stringify({
            ok: true,
            platform: process.platform,
            arch: process.arch,
            uptime: Math.round(process.uptime()),
            memory: process.memoryUsage(),
            brain: currentBrain(),
            model: MODEL,
            servers: Object.keys(MCP_SERVERS),
            port: PORT
        }));
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/apps/launch") {
        let body = "";
        for await (const chunk of req)
            body += chunk;
        let app = "";
        try {
            app = (JSON.parse(body || "{}").app ?? "").trim();
        }
        catch {
        }
        try {
            const resData = launchSystemApp(app);
            res.writeHead(200, { ...cors, "content-type": "application/json" });
            return res.end(JSON.stringify(resData));
        }
        catch (err) {
            res.writeHead(500, { ...cors, "content-type": "application/json" });
            return res.end(JSON.stringify({ ok: false, error: err.message }));
        }
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/system/shutdown") {
        res.writeHead(200, { ...cors, "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, message: "shutting down" }));
        console.log("[zimo] shutdown signal received \u2014 exiting process in 800ms...");
        setTimeout(() => {
            process.exit(0);
        }, 800);
        return;
    }
    if (requestUrl.pathname === "/api/memory") {
        if (req.method === "GET") {
            res.writeHead(200, { ...cors, "content-type": "application/json" });
            return res.end(JSON.stringify({ ok: true, facts: allFacts() }));
        }
        if (req.method === "POST") {
            let body = "";
            for await (const chunk of req)
                body += chunk;
            let fact = "";
            try {
                fact = (JSON.parse(body || "{}").fact ?? "").trim();
            }
            catch {
            }
            if (!fact) {
                res.writeHead(400, { ...cors, "content-type": "application/json" });
                return res.end(JSON.stringify({ ok: false, error: "no fact" }));
            }
            const entry = recordFact(fact);
            res.writeHead(200, { ...cors, "content-type": "application/json" });
            return res.end(JSON.stringify({ ok: true, entry, facts: allFacts() }));
        }
        if (req.method === "DELETE") {
            let body = "";
            for await (const chunk of req)
                body += chunk;
            let needle = "";
            try {
                needle = (JSON.parse(body || "{}").needle ?? "").trim();
            }
            catch {
            }
            const deleted = forgetFact(needle);
            res.writeHead(200, { ...cors, "content-type": "application/json" });
            return res.end(JSON.stringify({ ok: true, deleted, facts: allFacts() }));
        }
    }
    if (req.method === "GET" && requestUrl.pathname === "/api/files") {
        try {
            const root = process.cwd();
            const entries = readdirSync(root, { withFileTypes: true });
            const files = entries.filter((e) => !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "dist").slice(0, 50).map((e) => {
                let size = 0;
                try {
                    size = statSync(join(root, e.name)).size;
                }
                catch {
                }
                return {
                    name: e.name,
                    isDir: e.isDirectory(),
                    size,
                    path: join(root, e.name)
                };
            });
            res.writeHead(200, { ...cors, "content-type": "application/json" });
            return res.end(JSON.stringify({ ok: true, root, files }));
        }
        catch (err) {
            res.writeHead(500, { ...cors, "content-type": "application/json" });
            return res.end(JSON.stringify({ ok: false, error: err.message }));
        }
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/files/open") {
        let body = "";
        for await (const chunk of req)
            body += chunk;
        let target = process.cwd();
        try {
            const parsed = JSON.parse(body || "{}");
            if (parsed.path)
                target = parsed.path;
        }
        catch {
        }
        try {
            const child = spawn("explorer.exe", [target], { detached: true, stdio: "ignore" });
            child.unref();
            res.writeHead(200, { ...cors, "content-type": "application/json" });
            return res.end(JSON.stringify({ ok: true, opened: target }));
        }
        catch (err) {
            res.writeHead(500, { ...cors, "content-type": "application/json" });
            return res.end(JSON.stringify({ ok: false, error: err.message }));
        }
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/settings/brain") {
        let body = "";
        for await (const chunk of req)
            body += chunk;
        let brain = "";
        try {
            brain = (JSON.parse(body || "{}").brain ?? "").trim();
        }
        catch {
        }
        const applied = setBrain(brain);
        res.writeHead(200, { ...cors, "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: applied !== null, brain: currentBrain() }));
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/agents/train") {
        let body = "";
        for await (const chunk of req)
            body += chunk;
        let parsed = {};
        try {
            parsed = JSON.parse(body || "{}");
        }
        catch {
        }
        const topic = parsed.topic ?? "";
        const content = parsed.content ?? "";
        const preferredBrain = parsed.brain || (process.env.HF_TOKEN ? "qwen" : currentBrain());
        if (!topic && !content) {
            res.writeHead(400, { ...cors, "content-type": "application/json" });
            return res.end(JSON.stringify({ ok: false, error: "No training topic or content provided" }));
        }
        try {
            const trainPrompt = [
                {
                    role: "system",
                    text: "You are an autonomous Model Training Agent. Your purpose is to analyze knowledge and distill it into 3-5 high-value declarative factual memory statements for the ZEMO core memory vault. Output only clean bullet points with no commentary."
                },
                {
                    role: "user",
                    text: `Topic / Domain: ${topic}

Content / Notes:
${content}`
                }
            ];
            let resultText = "";
            await askAltBrain(trainPrompt, (delta) => {
                resultText += delta;
            }, preferredBrain);
            const bullets = resultText.split("\n").map((l) => l.replace(/^[-*•0-9.]+\s*/, "").trim()).filter((l) => l.length > 5);
            for (const b of bullets) {
                recordFact(`[Trained: ${topic}] ${b}`);
            }
            res.writeHead(200, { ...cors, "content-type": "application/json" });
            return res.end(JSON.stringify({
                ok: true,
                topic,
                brain: preferredBrain,
                distilledCount: bullets.length,
                facts: allFacts(),
                raw: resultText
            }));
        }
        catch (err) {
            res.writeHead(500, { ...cors, "content-type": "application/json" });
            return res.end(JSON.stringify({ ok: false, error: err.message }));
        }
    }
    if (req.method === "GET" && req.url?.startsWith("/file?")) {
        const asked = new URL(req.url, "http://x").searchParams.get("path") ?? "";
        let real = null;
        try {
            if (isAbsolute(asked))
                real = await realpath(asked);
        }
        catch {
            real = null;
        }
        const dot = real ? real.lastIndexOf(".") : -1;
        const ext = dot === -1 ? "" : real.slice(dot).toLowerCase();
        if (!real || !Object.hasOwn(IMAGE_TYPES, ext) || !withinRoots(real)) {
            res.writeHead(400, cors);
            return res.end("images only");
        }
        try {
            const info = await stat(real);
            if (!info.isFile() || info.size > MAX_FILE_BYTES) {
                res.writeHead(413, cors);
                return res.end("too large");
            }
            const body = await readFile(real);
            res.writeHead(200, {
                ...cors,
                "content-type": IMAGE_TYPES[ext],
                "x-content-type-options": "nosniff"
            });
            return res.end(body);
        }
        catch {
            res.writeHead(404, cors);
            return res.end("not found");
        }
    }
    if (req.method === "GET" && req.url?.startsWith("/img?")) {
        try {
            await proxyRemote(req, res, cors, {
                kinds: ["image/"],
                maxBytes: MAX_IMG_BYTES,
                timeoutMs: IMG_TIMEOUT_MS,
                ranged: false
            });
        }
        catch (err) {
            if (res.headersSent)
                return res.destroy();
            res.writeHead(err.status ?? 502, cors);
            return res.end(err.message ?? "proxy failed");
        }
        return;
    }
    if (req.method === "GET" && req.url?.startsWith("/media?")) {
        try {
            await proxyRemote(req, res, cors, {
                kinds: ["video/", "audio/"],
                maxBytes: MAX_MEDIA_BYTES,
                timeoutMs: MEDIA_TIMEOUT_MS,
                ranged: true
            });
        }
        catch (err) {
            if (res.headersSent)
                return res.destroy();
            res.writeHead(err.status ?? 502, cors);
            return res.end(err.message ?? "proxy failed");
        }
        return;
    }
    if (req.method === "GET" && req.url?.startsWith("/page?")) {
        const asked = new URL(req.url, "http://x");
        const target = asked.searchParams.get("url") ?? "";
        const mode = asked.searchParams.get("mode") === "live" ? "live" : "reader";
        try {
            const page = await renderPage(target, mode, `http://localhost:${PORT}`);
            res.writeHead(200, { ...cors, ...page.headers });
            return res.end(page.body);
        }
        catch (err) {
            res.writeHead(err.status ?? 502, {
                ...cors,
                "content-type": "text/html; charset=utf-8",
                "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'"
            });
            return res.end(`<!doctype html><meta charset="utf-8"><style>
           body{margin:0;padding:26px;background:transparent;color:#7fb6bf;
                font:400 13px/1.6 ui-monospace,monospace}
           b{color:#cfe9ee;font-weight:500;display:block;margin-bottom:6px}
         </style><b>This page could not be opened.</b>${String(err?.message ?? "unknown error").replace(/[<&]/g, "")}`);
        }
    }
    if (req.method === "POST" && req.url === "/tts") {
        const key = elevenKey();
        if (!key) {
            res.writeHead(503, cors);
            return res.end("no elevenlabs key");
        }
        let body = "";
        let overflowed = false;
        for await (const chunk of req) {
            body += chunk;
            if (body.length > 64 * 1024) {
                overflowed = true;
                break;
            }
        }
        if (overflowed) {
            req.destroy();
            res.writeHead(400, cors);
            return res.end("body too large");
        }
        let text;
        try {
            ;
            ({ text } = JSON.parse(body || "{}"));
        }
        catch {
            res.writeHead(400, cors);
            return res.end("bad json");
        }
        if (!text) {
            res.writeHead(400, cors);
            return res.end("no text");
        }
        try {
            const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream?output_format=mp3_22050_32&optimize_streaming_latency=3`, {
                method: "POST",
                headers: { "xi-api-key": key, "content-type": "application/json" },
                body: JSON.stringify({
                    text,
                    model_id: "eleven_flash_v2_5",
                    voice_settings: {
                        stability: 0.4,
                        similarity_boost: 0.75,
                        speed: 1.05
                    }
                })
            });
            if (!upstream.ok) {
                res.writeHead(upstream.status, cors);
                return res.end(await upstream.text());
            }
            res.writeHead(200, {
                ...cors,
                "content-type": "audio/mpeg",
                "cache-control": "no-cache"
            });
            for await (const chunk of upstream.body)
                res.write(Buffer.from(chunk));
            return res.end();
        }
        catch (err) {
            res.writeHead(502, cors);
            return res.end(String(err?.message ?? err));
        }
    }
    if (req.method === "POST" && req.url === "/stt") {
        const key = elevenKey();
        if (!key) {
            res.writeHead(503, cors);
            return res.end("no elevenlabs key");
        }
        const type = req.headers["content-type"] || "audio/webm";
        const chunks = [];
        let size = 0;
        let overflowed = false;
        for await (const chunk of req) {
            chunks.push(chunk);
            size += chunk.length;
            if (size > 25 * 1024 * 1024) {
                overflowed = true;
                break;
            }
        }
        if (overflowed) {
            req.destroy();
            res.writeHead(413, cors);
            return res.end("audio too large");
        }
        if (size < 1200) {
            res.writeHead(200, { ...cors, "content-type": "application/json" });
            return res.end(JSON.stringify({ text: "" }));
        }
        try {
            const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") || type.includes("mpeg") ? "mp4" : type.includes("wav") ? "wav" : "webm";
            const form = new FormData();
            form.append("model_id", "scribe_v1");
            form.append("file", new Blob([Buffer.concat(chunks)], { type }), `speech.${ext}`);
            const upstream = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
                method: "POST",
                headers: { "xi-api-key": key },
                body: form
            });
            if (!upstream.ok) {
                res.writeHead(upstream.status, cors);
                return res.end(await upstream.text());
            }
            const data = await upstream.json();
            res.writeHead(200, { ...cors, "content-type": "application/json" });
            return res.end(JSON.stringify({ text: (data.text ?? "").trim() }));
        }
        catch (err) {
            res.writeHead(502, cors);
            return res.end(String(err?.message ?? err));
        }
    }
    res.writeHead(404, cors);
    res.end();
};
const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
        console.error("[zimo] request failed:", err);
        if (!res.headersSent)
            res.writeHead(500);
        res.end();
    });
});
const wss = new WebSocketServer({
    server,
    verifyClient: ({ origin, req }, done) => {
        const url = new URL(req.url ?? "/", "http://internal");
        if (url.pathname !== "/" && url.pathname !== "/ws") {
            console.warn(`[zimo] rejected websocket on path ${url.pathname}`);
            return done(false, 403, "Forbidden");
        }
        if (!originAllowed(origin)) {
            console.warn(`[zimo] rejected websocket from origin ${origin ?? "(none)"} \u2014 set ZIMO_ALLOWED_ORIGINS to permit it`);
            return done(false, 403, "Forbidden");
        }
        const token = url.searchParams.get("token") ?? "";
        if (token && !timingSafeEqual(token, ZIMO_PASSWORD)) {
            console.warn("[zimo] rejected websocket \u2014 wrong token");
            return done(false, 401, "Unauthorized");
        }
        done(true);
    }
});
server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
        console.error(`[zimo] port ${PORT} is already in use by another process.`);
        process.exit(1);
    }
    throw err;
});
server.listen(PORT);
console.log(`[zimo] bridge listening on ws://localhost:${PORT}`);
console.log(`[zimo] speech ${elevenKey() ? "via ElevenLabs (key from MCP config)" : "using browser fallback voice"}`);
console.log(`[zimo] model ${MODEL} \xB7 effort ${EFFORT} \xB7 brain ${currentBrain()}`);
console.log(`[zimo] home ${process.env.ZIMO_HOME ?? "~/.zimo"}`);
if (ZIMO_PASSWORD === "4564") {
    console.warn('[zimo] using default ZIMO_PASSWORD ("4564") \u2014 set your own in .env.local (ZIMO_PASSWORD and matching VITE_ZIMO_PASSWORD) before trusting this gate.');
}
console.log(`[zimo] ${loadSkills().length} skill(s) loaded: ${loadSkills().map((s) => s.name).join(", ") || "(none)"}`);
startAgents();
console.log(`[zimo] writes ${ALLOW_WRITES ? "ENABLED" : "disabled"}` + (ALLOW_WRITES ? "" : " \u2014 set ZIMO_ALLOW_WRITES=1 to permit shell/file/device actions"));
void chromeAvailable().then((ok) => {
    console.log(ok ? `[zimo] browser control ready${ALLOW_WRITES ? "" : " (reading only \u2014 clicking and typing need ZIMO_ALLOW_WRITES=1)"}` : "[zimo] browser control unavailable \u2014 open Chrome with the Claude extension enabled");
});
console.log("[zimo] accepting local dev origins" + (EXTRA_ORIGINS.size ? ` plus ${[...EXTRA_ORIGINS].join(", ")}` : "") + (ALLOW_NO_ORIGIN ? " and clients that send no origin" : ""));
const RESULT_FAILURES = {
    error_during_execution: "The turn failed part way through.",
    error_max_turns: "The turn ran too long and was stopped.",
    error_max_budget_usd: "The budget for this turn ran out.",
    error_max_structured_output_retries: "The answer could not be assembled.",
    default: "The turn ended without an answer."
};
wss.on("connection", (socket) => {
    console.log("[zimo] client connected");
    socket.on("error", (err) => {
        console.warn("[zimo] socket client warning:", err.message);
    });
    const heartbeat = setInterval(() => {
        if (socket.readyState === socket.OPEN) {
            socket.ping?.();
        }
    }, 2e4);
    socket.on("close", () => clearInterval(heartbeat));
    socket.send(JSON.stringify({ type: "ready", servers: Object.keys(MCP_SERVERS) }));
    socket.send(JSON.stringify({ type: "brain", name: currentBrain(), ok: true }));
    let deliver = null;
    let closed = false;
    const inbox = [];
    async function* userMessages() {
        while (!closed) {
            const text = inbox.shift() ?? await new Promise((resolve) => {
                deliver = resolve;
            });
            if (closed || text == null)
                return;
            yield {
                type: "user",
                message: { role: "user", content: text },
                parent_tool_use_id: null
            };
        }
    }
    const send = (msg) => {
        if (socket.readyState === socket.OPEN)
            socket.send(JSON.stringify(msg));
    };
    let answering = null;
    let lastUserText = "";
    const sendTurn = (msg) => send({ ...msg, ask: answering });
    const waiting = new Map();
    let asks = 0;
    const ask = (kind, args, timeoutMs = 2e4) => new Promise((resolve, reject) => {
        if (socket.readyState !== socket.OPEN) {
            return reject(new Error("the interface is not connected"));
        }
        const id = `q${++asks}`;
        const timer = setTimeout(() => {
            waiting.delete(id);
            reject(new Error("the interface did not answer in time"));
        }, timeoutMs);
        waiting.set(id, { resolve, timer });
        send({ type: kind, id, ...args });
    });
    const seenTools = new Set();
    const heldTools = new Map();
    let settling = Promise.resolve();
    let finishTurn = null;
    const turnFinished = () => new Promise((resolve) => {
        finishTurn = resolve;
    });
    const SETTLE_CAP_MS = 400;
    const announceTool = (id, name) => {
        if (!name || id && seenTools.has(id))
            return;
        if (id)
            seenTools.add(id);
        if (name === "mcp__zimo__display")
            return;
        if (name.startsWith("mcp__zimo_ui__"))
            return;
        if (decideTool(name))
            return sendTurn({ type: "tool", name });
        if (id)
            heldTools.set(id, name);
    };
    const settleTool = (id, failed) => {
        const name = heldTools.get(id);
        if (name === void 0)
            return;
        heldTools.delete(id);
        if (!failed)
            sendTurn({ type: "tool", name });
    };
    let session = null;
    if (currentBrain() === "claude") {
        try {
            session = query({
                prompt: userMessages(),
                options: {
                    mcpServers: {
                        ...MCP_SERVERS,
                        zimo: displayServer((panel) => send({ type: "panel", panel }), (blade) => send({ type: "blade", blade })),
                        zimo_ui: uiServer((op, args) => send({ type: "ui", op, args })),
                        zimo_chrome: chromeServer({ allowWrites: ALLOW_WRITES }),
                        zimo_eyes: visionServer(ask),
                        zimo_memory: memoryServer(),
                        zimo_profile: profileServer(),
                        zimo_obsidian: obsidianServer({ allowWrites: ALLOW_WRITES }),
                        zimo_cooling: coolingServer(),
                        zimo_agents: agentsServer()
                    },
                    systemPrompt: buildSystemPrompt(),
                    cwd: homedir(),
                    settingSources: [],
                    model: MODEL,
                    effort: EFFORT,
                    maxTurns: 24,
                    permissionMode: "default",
                    includePartialMessages: true,
                    canUseTool: async (toolName) => {
                        const ok = decideTool(toolName);
                        console.log(`[zimo] tool ${toolName} -> ${ok ? "allow" : "deny"}`);
                        return ok ? { behavior: "allow" } : {
                            behavior: "deny",
                            message: "Blocked: ZIMO is running in read-only mode and cannot take actions that change anything. Tell the user this action is unavailable until they enable write access on the machine."
                        };
                    }
                }
            });
        }
        catch (err) {
            console.warn("[zimo] failed to start Claude session:", err.message);
            if (process.env.GEMINI_API_KEY) {
                console.log("[zimo] automatically falling back to Gemini brain");
                setBrain("gemini");
            }
        }
    }
    if (session) {
        ;
        (async () => {
            try {
                for await (const msg of session) {
                    if (process.env.ZIMO_DEBUG === "1") {
                        console.log("[msg]", msg.type, msg.event?.type ?? "");
                    }
                    switch (msg.type) {
                        case "stream_event": {
                            const ev = msg.event;
                            if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
                                sendTurn({ type: "text", delta: ev.delta.text });
                            }
                            if (ev?.type === "content_block_start" && ev.content_block?.type === "tool_use") {
                                announceTool(ev.content_block.id, ev.content_block.name);
                            }
                            break;
                        }
                        case "assistant": {
                            for (const block of msg.content ?? msg.message?.content ?? []) {
                                if (block.type === "tool_use") {
                                    announceTool(block.id, block.name);
                                }
                            }
                            break;
                        }
                        case "user": {
                            const blocks = msg.message?.content;
                            if (!Array.isArray(blocks))
                                break;
                            for (const block of blocks) {
                                if (block?.type === "tool_result") {
                                    settleTool(block.tool_use_id, block.is_error === true);
                                }
                            }
                            break;
                        }
                        case "result":
                            if (msg.subtype === "success") {
                                sendTurn({
                                    type: "done",
                                    text: msg.result ?? "",
                                    costUsd: msg.total_cost_usd ?? null
                                });
                            }
                            else {
                                console.error(`[zimo] turn failed: ${msg.subtype}`, msg.errors ?? "");
                                sendTurn({
                                    type: "error",
                                    message: RESULT_FAILURES[msg.subtype] ?? RESULT_FAILURES.default
                                });
                                void diagnoseError({
                                    errorText: `${msg.subtype}: ${JSON.stringify(msg.errors ?? "")}`,
                                    contextText: lastUserText
                                }).then((diag) => {
                                    if (!diag)
                                        return;
                                    console.log(`[zimo] self-diagnose (via ${diag.brain}): ${diag.text}`);
                                    send({ type: "diagnosis", brain: diag.brain, text: diag.text });
                                }).catch((err) => console.warn("[zimo] self-diagnose threw:", err));
                            }
                            finishTurn?.();
                            finishTurn = null;
                            seenTools.clear();
                            heldTools.clear();
                            break;
                        case "system":
                            if (msg.subtype === "init") {
                                const usable = (msg.mcp_servers ?? []).filter((s) => s.status !== "needs-auth" && s.status !== "failed").map((s) => s.name);
                                send({ type: "ready", servers: usable });
                                console.log(`[zimo] ${usable.length} MCP servers available`);
                            }
                            break;
                    }
                }
            }
            catch (err) {
                console.error("[zimo] session error:", err);
                if (process.env.GEMINI_API_KEY) {
                    console.log("[zimo] Claude session failed, switching to Gemini brain");
                    setBrain("gemini");
                    send({ type: "brain", name: "gemini", ok: true });
                    return;
                }
                if (process.env.HF_TOKEN) {
                    console.log("[zimo] Claude session failed, switching to Qwen/HF brain");
                    setBrain("qwen");
                    send({ type: "brain", name: "qwen", ok: true });
                    return;
                }
                send({ type: "error", message: String(err?.message ?? err) });
                closed = true;
                deliver?.(null);
                session?.close?.();
            }
        })();
    }
    const altHistory = [];
    async function runAltBrainTurn(text, id) {
        answering = id;
        altHistory.push({ role: "user", text });
        if (altHistory.length > 8) {
            altHistory.splice(0, altHistory.length - 8);
        }
        const prompt = [
            { role: "system", text: buildVoicePrompt() },
            ...altHistory
        ];
        try {
            const full = await askAltBrain(prompt, (delta) => {
                sendTurn({ type: "text", delta });
            });
            altHistory.push({ role: "assistant", text: full });
            sendTurn({ type: "done", text: full, costUsd: null });
        }
        catch (err) {
            console.error("[zimo] alt-brain error:", err);
            const errStr = String(err?.message ?? err);
            const userMessage = errStr.includes("503") || errStr.includes("UNAVAILABLE") ? "Cognitive service is temporarily experiencing high demand. Please repeat your instruction in a moment." : errStr;
            sendTurn({ type: "error", message: userMessage });
        }
        finally {
            answering = null;
        }
    }
    socket.on("message", (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        }
        catch {
            return;
        }
        if (msg.type === "ping") {
            if (socket.readyState === socket.OPEN) {
                socket.send(JSON.stringify({ type: "pong" }));
            }
            return;
        }
        if (msg.type === "set_brain" && typeof msg.name === "string") {
            const applied = setBrain(msg.name);
            send({ type: "brain", name: applied ?? currentBrain(), ok: applied !== null });
            return;
        }
        if (msg.type === "ask" && typeof msg.text === "string") {
            const powerCmd = parseSystemPowerCommand(msg.text);
            if (powerCmd) {
                answering = typeof msg.id === "string" ? msg.id : null;
                if (powerCmd === "shutdown") {
                    send({ type: "power", action: "shutdown" });
                    sendTurn({ type: "done", text: "Powering down ZEMO systems. Goodbye, Boss.", costUsd: null });
                    setTimeout(() => process.exit(0), 1200);
                    return;
                }
                if (powerCmd === "sleep") {
                    send({ type: "power", action: "sleep" });
                    sendTurn({ type: "done", text: 'Entering standby sleep mode. Say "Wake up ZEMO" anytime to resume.', costUsd: null });
                    return;
                }
                if (powerCmd === "wakeup") {
                    send({ type: "power", action: "wakeup" });
                    sendTurn({ type: "done", text: "ZEMO online and all systems nominal. What is your command, Boss?", costUsd: null });
                    return;
                }
            }
            const appToOpen = parseAppCommand(msg.text);
            if (appToOpen) {
                answering = typeof msg.id === "string" ? msg.id : null;
                launchSystemApp(appToOpen);
                sendTurn({ type: "done", text: `Opening ${appToOpen} for you now.`, costUsd: null });
                return;
            }
            const requested = parseBrainCommand(msg.text);
            if (requested) {
                setBrain(requested);
                answering = typeof msg.id === "string" ? msg.id : null;
                sendTurn({ type: "done", text: `Brain switched to ${requested}.`, costUsd: null });
                return;
            }
            if (currentBrain() !== "claude") {
                void runAltBrainTurn(msg.text, typeof msg.id === "string" ? msg.id : null);
                return;
            }
        }
        if (msg.type === "ask" && typeof msg.text === "string") {
            const text = msg.text;
            const id = typeof msg.id === "string" ? msg.id : null;
            lastUserText = text;
            void settling.then(() => {
                answering = id;
                if (deliver) {
                    const resolve = deliver;
                    deliver = null;
                    resolve(text);
                }
                else {
                    inbox.push(text);
                }
            });
        }
        if (msg.type === "reply" && typeof msg.id === "string") {
            const slot = waiting.get(msg.id);
            if (slot) {
                waiting.delete(msg.id);
                clearTimeout(slot.timer);
                slot.resolve(msg);
            }
        }
        if (msg.type === "interrupt") {
            if (session) {
                const stopped = turnFinished();
                settling = Promise.resolve(session?.interrupt?.()).catch(() => {
                }).then(() => Promise.race([
                    stopped,
                    new Promise((r) => setTimeout(r, SETTLE_CAP_MS))
                ]));
            }
        }
    });
    socket.on("close", () => {
        console.log("[zimo] client disconnected");
        closed = true;
        deliver?.(null);
        session?.close?.();
    });
});
export { SYSTEM_APP_MAP, launchSystemApp, parseAppCommand, parseSystemPowerCommand };
