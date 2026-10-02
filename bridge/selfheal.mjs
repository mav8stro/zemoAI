import { query } from "@anthropic-ai/claude-agent-sdk";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { cp, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PATHS, ensureHome } from "./home.mjs";
const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, "..");
const HEALABLE_DIRS = ["bridge", "src"].map((d) => resolve(PROJECT_ROOT, d));
const PROTECTED_FILES = new Set([join("bridge", "selfheal.mjs")].map((p) => resolve(PROJECT_ROOT, p)));
function isHealable(path) {
    const abs = resolve(path);
    if (PROTECTED_FILES.has(abs))
        return false;
    return HEALABLE_DIRS.some((dir) => abs === dir || abs.startsWith(dir + "/"));
}
async function listFiles(dir) {
    const out = [];
    async function walk(current) {
        let entries;
        try {
            entries = await readdir(current, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (entry.name === "node_modules" || entry.name.startsWith("."))
                continue;
            const full = join(current, entry.name);
            if (entry.isDirectory())
                await walk(full);
            else
                out.push(full);
        }
    }
    await walk(dir);
    return out;
}
async function snapshot() {
    ensureHome();
    const dir = join(PATHS.selfHealBackups, (new Date()).toISOString().replace(/[:.]/g, "-"));
    mkdirSync(dir, { recursive: true });
    for (const src of HEALABLE_DIRS) {
        if (!existsSync(src))
            continue;
        await cp(src, join(dir, relative(PROJECT_ROOT, src)), { recursive: true });
    }
    return dir;
}
async function changedSince(backupDir) {
    const changed = [];
    for (const src of HEALABLE_DIRS) {
        if (!existsSync(src))
            continue;
        for (const file of await listFiles(src)) {
            const rel = relative(PROJECT_ROOT, file);
            const backupFile = join(backupDir, rel);
            let before = null;
            try {
                before = readFileSync(backupFile, "utf8");
            }
            catch {
            }
            let after = null;
            try {
                after = readFileSync(file, "utf8");
            }
            catch {
                continue;
            }
            if (before !== after)
                changed.push(file);
        }
    }
    return changed;
}
async function restore(backupDir, files) {
    for (const file of files) {
        const rel = relative(PROJECT_ROOT, file);
        const backupFile = join(backupDir, rel);
        if (existsSync(backupFile)) {
            await cp(backupFile, file, { force: true });
        }
        else {
            try {
                rmSync(file);
            }
            catch {
            }
        }
    }
}
async function validate(files) {
    const jsFiles = files.filter((f) => /\.m?js$/.test(f));
    const tsChanged = files.some((f) => /\.tsx?$/.test(f));
    for (const file of jsFiles) {
        try {
            await execFileAsync(process.execPath, ["--check", file]);
        }
        catch (err) {
            return { ok: false, reason: `node --check failed on ${relative(PROJECT_ROOT, file)}: ${err.stderr || err.message}` };
        }
    }
    if (tsChanged) {
        try {
            await execFileAsync("npx", ["tsc", "-b"], { cwd: PROJECT_ROOT });
        }
        catch (err) {
            return { ok: false, reason: `tsc -b failed: ${err.stdout || err.stderr || err.message}` };
        }
    }
    return { ok: true };
}
function canEditPath(input) {
    const path = input?.file_path ?? input?.path ?? input?.notebook_path;
    if (typeof path !== "string")
        return false;
    return isHealable(path);
}
async function heal(crash) {
    const backupDir = await snapshot();
    const prompt = `The ZIMO bridge process (bridge/server.mjs and its imports under bridge/ and src/) just crashed.

Kind: ${crash.kind}
Message: ${crash.message}
Stack:
${crash.stack}

Find the bug and fix it with the smallest change that makes the crash stop recurring. Read whatever files the stack trace points at and whatever else you need for context. You may only edit files under bridge/ or src/ \u2014 anything else (package.json, .env*, node_modules, this project's config) is off limits even if it looks relevant; work around it instead of touching it. Do not run shell commands \u2014 editing is enough, validation happens after you're done. When you're confident the fix is correct, stop; don't go looking for unrelated improvements.`;
    let turns = 0;
    const session = query({
        prompt,
        options: {
            cwd: PROJECT_ROOT,
            settingSources: [],
            model: process.env.ZIMO_HEAL_MODEL ?? "claude-opus-5",
            maxTurns: 14,
            permissionMode: "default",
            canUseTool: async (toolName, input) => {
                turns += 1;
                if (["Read", "Glob", "Grep"].includes(toolName)) {
                    return { behavior: "allow" };
                }
                if (["Edit", "MultiEdit", "Write"].includes(toolName)) {
                    return canEditPath(input) ? { behavior: "allow" } : {
                        behavior: "deny",
                        message: "That path is outside bridge/ and src/, or is the self-heal module itself \u2014 not editable during a heal."
                    };
                }
                return { behavior: "deny", message: "Self-heal may only Read, Glob, Grep, Edit or Write inside bridge/ and src/." };
            }
        }
    });
    let summary = "";
    for await (const msg of session) {
        if (msg.type === "result") {
            summary = msg.subtype === "success" ? msg.result ?? "" : `heal turn ended: ${msg.subtype}`;
        }
    }
    const changed = await changedSince(backupDir);
    if (changed.length === 0) {
        return { healed: false, filesChanged: [], summary: summary || "No files were changed." };
    }
    const result = await validate(changed);
    if (!result.ok) {
        await restore(backupDir, changed);
        return {
            healed: false,
            filesChanged: changed.map((f) => relative(PROJECT_ROOT, f)),
            summary: `Patch rejected and rolled back \u2014 ${result.reason}`
        };
    }
    return {
        healed: true,
        filesChanged: changed.map((f) => relative(PROJECT_ROOT, f)),
        summary: summary || `Patched ${changed.length} file(s).`
    };
}
export { PROJECT_ROOT, heal };
