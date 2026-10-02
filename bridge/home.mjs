import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
function loadEnv() {
    const dirs = [
        join(import.meta.dirname, ".."),
        join(import.meta.dirname, "..", ".."),
        process.cwd(),
        join(process.cwd(), "zemo")
    ];
    const files = [".env.local", ".env"];
    const visited = new Set();
    for (const dir of dirs) {
        for (const file of files) {
            const fullPath = join(dir, file);
            if (visited.has(fullPath) || !existsSync(fullPath))
                continue;
            visited.add(fullPath);
            try {
                const content = readFileSync(fullPath, "utf8");
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
    }
}
loadEnv();
const ZIMO_HOME = process.env.ZIMO_HOME ?? join(homedir(), ".zimo");
const PATHS = {
    root: ZIMO_HOME,
    profile: join(ZIMO_HOME, "profile.json"),
    memory: join(ZIMO_HOME, "memory.json"),
    settings: join(ZIMO_HOME, "settings.json"),
    skillsCache: join(ZIMO_HOME, "skills"),
    lastCrash: join(ZIMO_HOME, "last-crash.json"),
    selfHealLog: join(ZIMO_HOME, "self-heal.log"),
    selfHealBackups: join(ZIMO_HOME, "self-heal-backups"),
    selfHealState: join(ZIMO_HOME, "self-heal-state.json")
};
function ensureHome() {
    if (!existsSync(ZIMO_HOME))
        mkdirSync(ZIMO_HOME, { recursive: true });
    return ZIMO_HOME;
}
export { PATHS, ZIMO_HOME, ensureHome, loadEnv };
