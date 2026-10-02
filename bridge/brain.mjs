import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ensureHome, PATHS } from "./home.mjs";
const VALID = ["claude", "gemini", "kimi", "moonshot", "hermes", "ollama", "hf", "huggingface", "qwen", "gwen"];
let brain = null;
function readSettings() {
    ensureHome();
    if (!existsSync(PATHS.settings))
        return {};
    try {
        return JSON.parse(readFileSync(PATHS.settings, "utf8"));
    }
    catch {
        return {};
    }
}
function writeSettings(patch) {
    const next = { ...readSettings(), ...patch };
    ensureHome();
    writeFileSync(PATHS.settings, JSON.stringify(next, null, 2));
}
function currentBrain() {
    if (brain)
        return brain;
    const fromEnv = process.env.ZIMO_BRAIN;
    const fromSettings = readSettings().brain;
    if (fromEnv && VALID.includes(fromEnv)) {
        brain = fromEnv;
        return brain;
    }
    if (fromSettings && VALID.includes(fromSettings)) {
        brain = fromSettings;
        return brain;
    }
    if (process.env.GEMINI_API_KEY) {
        brain = "gemini";
        return brain;
    }
    brain = "claude";
    return brain;
}
function setBrain(name) {
    const normalised = String(name).toLowerCase().trim();
    if (!VALID.includes(normalised))
        return null;
    brain = normalised;
    writeSettings({ brain: normalised });
    return normalised;
}
function parseBrainCommand(text) {
    const m = text.trim().toLowerCase().match(/^(?:hey (?:zimo|zemo),?\s*)?(?:switch|change|use)\s+(?:your\s+)?brain\s+(?:to\s+)?(\w+)$/);
    if (!m)
        return null;
    const b = m[1];
    if (b === "gwen")
        return "qwen";
    if (b === "huggingface")
        return "hf";
    return VALID.includes(b) ? b : null;
}
async function streamOpenAiCompatible({ url, headers, model, messages, onDelta }) {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ model, messages, stream: true })
    });
    if (!res.ok || !res.body) {
        throw new Error(`brain request failed: ${res.status} ${await res.text().catch(() => "")}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:"))
                continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]")
                continue;
            try {
                const json = JSON.parse(payload);
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) {
                    full += delta;
                    onDelta(delta);
                }
            }
            catch {
            }
        }
    }
    return full;
}
async function askAltBrain(history, onDelta, brainName) {
    const name = brainName ?? currentBrain();
    if (name === "gemini") {
        const key = process.env.GEMINI_API_KEY;
        if (!key)
            throw new Error("GEMINI_API_KEY is not set \u2014 needed for Gemini brain.");
        let sysText = "";
        const chatMessages = [];
        for (const h of history) {
            if (h.role === "system") {
                sysText += (sysText ? "\n\n" : "") + h.text;
            }
            else {
                chatMessages.push({ role: h.role, content: h.text });
            }
        }
        const messages2 = [];
        if (sysText) {
            messages2.push({ role: "system", content: sysText });
        }
        for (let i = 0; i < chatMessages.length; i++) {
            const msg = chatMessages[i];
            if (i === 0 && msg.role === "user" && !msg.content.includes("[Persona:")) {
                messages2.push({
                    role: "user",
                    content: `[Directive: You are ZEMO (Zero Error Machine Operator), an elite holographic AI assistant. Stay in character as ZEMO.]

${msg.content}`
                });
            }
            else {
                messages2.push(msg);
            }
        }
        const candidates = Array.from(new Set([
            process.env.GEMINI_MODEL,
            "gemini-3.5-flash-lite",
            "gemini-3.7-flash",
            "gemini-2.5-flash-lite",
            "gemini-2.0-flash"
        ].filter(Boolean)));
        let lastError = null;
        for (const model of candidates) {
            try {
                return await streamOpenAiCompatible({
                    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                    headers: { Authorization: `Bearer ${key}` },
                    model,
                    messages: messages2,
                    onDelta
                });
            }
            catch (err) {
                lastError = err;
                const errStr = String(err?.message ?? "");
                if (errStr.includes("503") || errStr.includes("UNAVAILABLE") || errStr.includes("429") || errStr.includes("404")) {
                    console.warn(`[zimo] Gemini model "${model}" returned error, trying fallback... (${errStr.slice(0, 80)})`);
                    continue;
                }
                throw err;
            }
        }
        if (process.env.HF_TOKEN) {
            console.warn("[zimo] Gemini rate-limited or quota exceeded (429). Seamlessly routing to Qwen 2.5 AI...");
            return await askAltBrain(history, onDelta, "qwen");
        }
        throw lastError;
    }
    const messages = history.map((h) => ({ role: h.role, content: h.text }));
    if (name === "kimi" || name === "moonshot") {
        const key = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
        if (!key)
            throw new Error("KIMI_API_KEY is not set \u2014 needed for Kimi / Moonshot brain.");
        return streamOpenAiCompatible({
            url: process.env.KIMI_BASE_URL ?? "https://api.moonshot.ai/v1/chat/completions",
            headers: { Authorization: `Bearer ${key}` },
            model: process.env.KIMI_MODEL ?? "moonshot-v1-8k",
            messages,
            onDelta
        });
    }
    if (name === "hermes") {
        const key = process.env.OPENROUTER_API_KEY;
        if (!key)
            throw new Error("OPENROUTER_API_KEY is not set \u2014 needed for Hermes via OpenRouter.");
        return streamOpenAiCompatible({
            url: "https://openrouter.ai/api/v1/chat/completions",
            headers: { Authorization: `Bearer ${key}` },
            model: process.env.HERMES_MODEL ?? "nousresearch/hermes-4-405b",
            messages,
            onDelta
        });
    }
    if (name === "ollama") {
        const host = process.env.OLLAMA_HOST ?? "http://localhost:11434";
        return streamOpenAiCompatible({
            url: `${host}/v1/chat/completions`,
            headers: {},
            model: process.env.OLLAMA_MODEL ?? "llama3.1",
            messages,
            onDelta
        });
    }
    if (name === "hf" || name === "huggingface") {
        const key = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN;
        if (!key) {
            throw new Error("HF_TOKEN is not set. Add your free Hugging Face token in .env.local to use the HF brain.");
        }
        const models = [
            process.env.HF_MODEL,
            "Qwen/Qwen2.5-72B-Instruct",
            "meta-llama/Llama-3.1-8B-Instruct"
        ].filter(Boolean);
        let lastErr = null;
        for (const model of models) {
            try {
                return await streamOpenAiCompatible({
                    url: "https://router.huggingface.co/v1/chat/completions",
                    headers: { Authorization: `Bearer ${key}` },
                    model,
                    messages,
                    onDelta
                });
            }
            catch (err) {
                lastErr = err;
                console.warn(`[zimo] Hugging Face model ${model} failed, trying fallback:`, err.message);
            }
        }
        throw lastErr ?? new Error("Hugging Face inference failed");
    }
    if (name === "qwen" || name === "gwen") {
        const host = process.env.OLLAMA_HOST ?? "http://localhost:11434";
        try {
            const ping = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(600) });
            if (ping.ok) {
                const data = await ping.json();
                const hasQwen = data.models?.some((m) => m.name.toLowerCase().includes("qwen"));
                if (hasQwen) {
                    console.log("[zimo] routing Qwen request to local Ollama instance");
                    return await streamOpenAiCompatible({
                        url: `${host}/v1/chat/completions`,
                        headers: {},
                        model: process.env.OLLAMA_MODEL ?? "qwen2.5",
                        messages,
                        onDelta
                    });
                }
            }
        }
        catch {
        }
        const key = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN;
        if (!key) {
            throw new Error("HF_TOKEN is not set in .env.local. Please add your Hugging Face token or set GEMINI_API_KEY.");
        }
        const qwenModels = [
            process.env.QWEN_MODEL,
            "Qwen/Qwen2.5-72B-Instruct",
            "Qwen/Qwen2.5-Coder-32B-Instruct"
        ].filter(Boolean);
        let lastErr = null;
        for (const model of qwenModels) {
            try {
                return await streamOpenAiCompatible({
                    url: "https://router.huggingface.co/v1/chat/completions",
                    headers: { Authorization: `Bearer ${key}` },
                    model,
                    messages,
                    onDelta
                });
            }
            catch (err) {
                lastErr = err;
                console.warn(`[zimo] Qwen model ${model} failed, trying fallback:`, err.message);
            }
        }
        throw lastErr ?? new Error("Failed to query Qwen AI via Hugging Face");
    }
    throw new Error(`no alt-brain handler for "${name}"`);
}
async function diagnoseError({ errorText, contextText }) {
    const candidates = [
        currentBrain(),
        "gemini",
        "kimi",
        "hf",
        "hermes",
        "ollama"
    ].filter((b, i, arr) => VALID.includes(b) && b !== "claude" && arr.indexOf(b) === i);
    const hasCreds = {
        gemini: Boolean(process.env.GEMINI_API_KEY),
        kimi: Boolean(process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY),
        hf: Boolean(process.env.HF_TOKEN),
        hermes: Boolean(process.env.OPENROUTER_API_KEY),
        ollama: true
    };
    const prompt = [
        {
            role: "system",
            text: "You are a second opinion brought in to debug a failed step in another AI agent's turn. Be terse: 2-4 sentences, likely cause first, then a concrete next step. No preamble."
        },
        {
            role: "user",
            text: `Context: ${contextText}

Error: ${errorText}`
        }
    ];
    for (const name of candidates) {
        if (!hasCreds[name])
            continue;
        try {
            const text = await askAltBrain(prompt, () => {
            }, name);
            return { brain: name, text };
        }
        catch (err) {
            console.warn(`[zimo] self-diagnose via ${name} failed:`, err?.message ?? err);
        }
    }
    return null;
}
export { askAltBrain, currentBrain, diagnoseError, parseBrainCommand, setBrain };
