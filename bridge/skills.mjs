import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "..", "skills");
function parseFrontmatter(raw) {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match)
        return { meta: {}, body: raw };
    const meta = {};
    for (const line of match[1].split("\n")) {
        const idx = line.indexOf(":");
        if (idx === -1)
            continue;
        const key = line.slice(0, idx).trim();
        let value = line.slice(idx + 1).trim();
        if (key === "triggers") {
            value = value.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        }
        meta[key] = value;
    }
    return { meta, body: match[2].trim() };
}
let cache = null;
function loadSkills() {
    if (cache)
        return cache;
    if (!existsSync(SKILLS_DIR))
        return cache = [];
    const skills = [];
    for (const folder of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
        if (!folder.isDirectory())
            continue;
        const file = join(SKILLS_DIR, folder.name, "SKILL.md");
        if (!existsSync(file))
            continue;
        const { meta, body } = parseFrontmatter(readFileSync(file, "utf8"));
        skills.push({
            id: folder.name,
            name: meta.name ?? folder.name,
            description: meta.description ?? "",
            triggers: meta.triggers ?? [],
            body
        });
    }
    return cache = skills;
}
function skillsDigest() {
    const skills = loadSkills();
    if (skills.length === 0)
        return "";
    const lines = skills.map((s) => `- ${s.name}: ${s.description}`);
    return `

SKILLS INSTALLED (their full instructions load automatically when relevant):
${lines.join("\n")}`;
}
function matchSkills(text) {
    const lower = text.toLowerCase();
    return loadSkills().filter((s) => s.triggers.some((t) => lower.includes(t))).map((s) => `

--- SKILL: ${s.name} ---
${s.body}`).join("");
}
export { loadSkills, matchSkills, skillsDigest };
