import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { ensureHome, PATHS } from "./home.mjs";
import { askAltBrain } from "./brain.mjs";
import { recordFact } from "./memory.mjs";
import { throttled } from "./cooling.mjs";
const FILE = () => `${PATHS.root}/agents.json`;
function readAgents() {
    ensureHome();
    const f = FILE();
    if (!existsSync(f))
        return [];
    try {
        return JSON.parse(readFileSync(f, "utf8"));
    }
    catch {
        return [];
    }
}
function writeAgents(list) {
    ensureHome();
    writeFileSync(FILE(), JSON.stringify(list, null, 2));
}
const timers = new Map();
async function runAgent(agent) {
    if (throttled())
        return;
    try {
        let out = "";
        await askAltBrain([{ role: "user", text: agent.task }], (delta) => {
            out += delta;
        }, agent.brain);
        agent.lastRun = (new Date()).toISOString();
        agent.lastResult = out.trim().slice(0, 2e3);
        recordFact(`[agent "${agent.name}"] ${agent.lastResult}`);
    }
    catch (err) {
        agent.lastRun = (new Date()).toISOString();
        agent.lastResult = `(failed: ${err.message})`;
    }
    const list = readAgents().map((a) => a.id === agent.id ? agent : a);
    writeAgents(list);
}
function schedule(agent) {
    unschedule(agent.id);
    if (!agent.active)
        return;
    const ms = Math.max(1, agent.everyMinutes) * 6e4;
    const t = setInterval(() => runAgent(agent), ms);
    t.unref?.();
    timers.set(agent.id, t);
}
function unschedule(id) {
    const t = timers.get(id);
    if (t)
        clearInterval(t);
    timers.delete(id);
}
function startAgents() {
    for (const a of readAgents())
        schedule(a);
}
function agentsServer() {
    return createSdkMcpServer({
        name: "agents",
        version: "1.0.0",
        tools: [
            tool("agent_create", "Start a free background agent: a standing task that runs on a timer using a no-cost brain (ollama or hf by default, never the paid Claude brain unless explicitly told to), and saves what it finds to memory for the next real conversation.", {
                name: z.string().describe('Short label, e.g. "AI news watcher".'),
                task: z.string().describe('The instruction the agent re-runs every interval, e.g. "Summarise anything new and notable in local AI news."'),
                everyMinutes: z.number().min(5).max(1440).default(60),
                brain: z.enum(["ollama", "hf", "hermes"]).default("ollama").describe("Which free brain runs it. ollama needs a local install; hf needs HF_TOKEN; hermes needs OPENROUTER_API_KEY.")
            }, async ({ name, task, everyMinutes, brain }) => {
                const agent = { id: `${Date.now()}`, name, task, everyMinutes, brain, active: true, lastRun: null, lastResult: null };
                writeAgents([...readAgents(), agent]);
                schedule(agent);
                return { content: [{ type: "text", text: `Agent "${name}" is running, every ${everyMinutes} minutes, on ${brain}.` }] };
            }),
            tool("agent_list", "List all free agents and their last result.", {}, async () => {
                const list = readAgents();
                return { content: [{ type: "text", text: list.length ? JSON.stringify(list, null, 2) : "No agents running yet." }] };
            }),
            tool("agent_pause", "Pause or resume a free agent by name.", { name: z.string(), active: z.boolean() }, async ({ name, active }) => {
                const list = readAgents();
                const a = list.find((a2) => a2.name.toLowerCase() === name.toLowerCase());
                if (!a)
                    return { content: [{ type: "text", text: `No agent named "${name}".` }] };
                a.active = active;
                writeAgents(list);
                if (active)
                    schedule(a);
                else
                    unschedule(a.id);
                return { content: [{ type: "text", text: `Agent "${name}" ${active ? "resumed" : "paused"}.` }] };
            }),
            tool("agent_remove", "Stop and delete a free agent by name.", { name: z.string() }, async ({ name }) => {
                const list = readAgents();
                const a = list.find((a2) => a2.name.toLowerCase() === name.toLowerCase());
                if (!a)
                    return { content: [{ type: "text", text: `No agent named "${name}".` }] };
                unschedule(a.id);
                writeAgents(list.filter((x) => x.id !== a.id));
                return { content: [{ type: "text", text: `Agent "${name}" removed.` }] };
            })
        ]
    });
}
export { agentsServer, startAgents };
