#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { saveProfile, loadProfile } from "../bridge/profile.mjs";
import { ZIMO_HOME } from "../bridge/home.mjs";
const rl = readline.createInterface({ input: stdin, output: stdout });
async function ask(question) {
    const answer = await rl.question(question + " ");
    return answer.trim();
}
console.log(`
ZIMO \u2014 first-run setup. Saved to ${ZIMO_HOME}, this machine only.
`);
const existing = loadProfile();
const name = await ask(`Your name${existing.name ? ` [${existing.name}]` : ""}:`) || existing.name;
const role = await ask(`Your role, one line${existing.role ? ` [${existing.role}]` : ""}:`) || existing.role;
const worksOn = await ask("What are you building right now? (comma-separated, ok to leave blank):");
const goals = await ask("What are you trying to get done with ZIMO? (comma-separated):");
const preferences = await ask("Anything ZIMO should just always do, or never do?:");
const split = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
saveProfile({
    name: name || existing.name,
    role: role || existing.role,
    works_on: [...new Set([...existing.works_on, ...split(worksOn)])],
    goals: [...new Set([...existing.goals, ...split(goals)])],
    preferences: [...new Set([...existing.preferences, ...split(preferences)])],
    onboarded: true
});
console.log("\nSaved. Start ZIMO with `npm start` \u2014 he already knows this.\n");
rl.close();
