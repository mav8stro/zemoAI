import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { ensureHome, PATHS } from "./home.mjs";
const DEFAULT_PROFILE = {
    name: null,
    role: null,
    works_on: [],
    goals: [],
    preferences: [],
    onboarded: false
};
function loadProfile() {
    ensureHome();
    if (!existsSync(PATHS.profile))
        return { ...DEFAULT_PROFILE };
    try {
        return { ...DEFAULT_PROFILE, ...JSON.parse(readFileSync(PATHS.profile, "utf8")) };
    }
    catch {
        return { ...DEFAULT_PROFILE };
    }
}
function saveProfile(patch) {
    const current = loadProfile();
    const next = { ...current, ...patch };
    ensureHome();
    writeFileSync(PATHS.profile, JSON.stringify(next, null, 2));
    return next;
}
function isOnboarded() {
    return loadProfile().onboarded === true;
}
function describeProfile() {
    const p = loadProfile();
    if (!p.name && !p.role && p.works_on.length === 0 && p.goals.length === 0) {
        return `

You do not yet know who you're working for. If the conversation gives you
the chance without forcing it, learn their name, what they do, and what
they're building, and save it with profile_save so you only have to ask once.`;
    }
    const lines = [];
    if (p.name)
        lines.push(`Name: ${p.name}`);
    if (p.role)
        lines.push(`Role: ${p.role}`);
    if (p.works_on.length)
        lines.push(`Works on: ${p.works_on.join("; ")}`);
    if (p.goals.length)
        lines.push(`Goals: ${p.goals.join("; ")}`);
    if (p.preferences.length)
        lines.push(`Preferences: ${p.preferences.join("; ")}`);
    return `

WHO YOU WORK FOR \u2014 use this, don't recite it:
${lines.join("\n")}`;
}
const ok = (text) => ({ content: [{ type: "text", text }] });
function profileServer() {
    return createSdkMcpServer({
        name: "zimo_profile",
        version: "1.0.0",
        instructions: "Save what you learn about the person you're working for \u2014 name, role, what they build, their goals, standing preferences \u2014 so it persists across sessions. Don't interrogate them for it; save it as it comes up.",
        alwaysLoad: true,
        tools: [
            tool("profile_save", "Save or update a fact about the person ZIMO works for. Call this quietly, without announcing it, whenever you learn their name, role, a project they work on, a goal, or a lasting preference.", {
                name: z.string().optional(),
                role: z.string().optional(),
                add_works_on: z.string().optional(),
                add_goal: z.string().optional(),
                add_preference: z.string().optional(),
                mark_onboarded: z.boolean().optional()
            }, async (args) => {
                const current = loadProfile();
                const patch = {};
                if (args.name)
                    patch.name = args.name;
                if (args.role)
                    patch.role = args.role;
                if (args.add_works_on) {
                    patch.works_on = [...new Set([...current.works_on, args.add_works_on])];
                }
                if (args.add_goal) {
                    patch.goals = [...new Set([...current.goals, args.add_goal])];
                }
                if (args.add_preference) {
                    patch.preferences = [...new Set([...current.preferences, args.add_preference])];
                }
                if (args.mark_onboarded)
                    patch.onboarded = true;
                saveProfile(patch);
                return ok("Saved.");
            })
        ]
    });
}
export { describeProfile, isOnboarded, loadProfile, profileServer, saveProfile };
