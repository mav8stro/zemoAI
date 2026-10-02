import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { ensureHome, PATHS } from "./home.mjs";
function readStore() {
    ensureHome();
    if (!existsSync(PATHS.memory))
        return { facts: [] };
    try {
        return JSON.parse(readFileSync(PATHS.memory, "utf8"));
    }
    catch {
        return { facts: [] };
    }
}
function writeStore(store) {
    ensureHome();
    writeFileSync(PATHS.memory, JSON.stringify(store, null, 2));
}
function recordFact(text) {
    const store = readStore();
    const entry = { text, at: (new Date()).toISOString() };
    store.facts.push(entry);
    if (store.facts.length > 500)
        store.facts = store.facts.slice(-500);
    writeStore(store);
    return entry;
}
function allFacts() {
    return readStore().facts;
}
function searchFacts(query, limit = 8) {
    const words = query.toLowerCase().split(/\W+/).filter(Boolean);
    if (words.length === 0)
        return allFacts().slice(-limit).reverse();
    return allFacts().filter((f) => {
        const hay = f.text.toLowerCase();
        return words.some((w) => hay.includes(w));
    }).slice(-limit).reverse();
}
function forgetFact(needle) {
    const store = readStore();
    const before = store.facts.length;
    store.facts = store.facts.filter((f) => !f.text.toLowerCase().includes(needle.toLowerCase()));
    writeStore(store);
    return before - store.facts.length;
}
const ok = (text) => ({ content: [{ type: "text", text }] });
function memoryServer() {
    return createSdkMcpServer({
        name: "zimo_memory",
        version: "1.0.0",
        instructions: "Long-term memory, across sessions. Use remember for anything worth not having to be told twice \u2014 a preference, a decision, a fact about the person's work \u2014 and recall before assuming you don't know something you might have been told before.",
        alwaysLoad: true,
        tools: [
            tool("remember", "Save one fact to long-term memory. Short, declarative, one fact per call.", { fact: z.string() }, async (args) => {
                recordFact(args.fact);
                return ok("Remembered.");
            }),
            tool("recall", "Search long-term memory by keyword. Returns the best-matching facts, newest first.", { query: z.string() }, async (args) => {
                const hits = searchFacts(args.query);
                if (hits.length === 0)
                    return ok("Nothing on that.");
                return ok(hits.map((f) => `- ${f.text}`).join("\n"));
            }),
            tool("forget", "Delete facts containing the given text. Use when told something is wrong or out of date.", { matching: z.string() }, async (args) => {
                const n = forgetFact(args.matching);
                return ok(n > 0 ? `Forgot ${n} fact${n === 1 ? "" : "s"}.` : "Found nothing matching that.");
            })
        ]
    });
}
export { allFacts, forgetFact, memoryServer, recordFact, searchFacts };
