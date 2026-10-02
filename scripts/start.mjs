import { spawn } from "node:child_process";
import process from "node:process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
function vendorWasm() {
    const from = "node_modules/@mediapipe/tasks-vision/wasm";
    const to = "public/mediapipe";
    if (!existsSync(from))
        return;
    if (existsSync(`${to}/vision_wasm_internal.wasm`))
        return;
    try {
        mkdirSync(to, { recursive: true });
        cpSync(from, to, { recursive: true });
        console.log("  vendored the hand-tracking runtime into public/mediapipe.");
    }
    catch (err) {
        console.warn(`  could not vendor the hand-tracking runtime: ${err.message}`);
    }
}
const writes = process.argv.includes("--writes");
const paint = (tag, colour) => (line) => line.toString().split("\n").filter((l) => l.length).map((l) => `\x1B[${colour}m${tag}\x1B[0m ${l}`).join("\n");
const children = [];
function run(name, command, args, colour, env) {
    const label = paint(name, colour);
    const child = spawn(command, args, {
        env: { ...process.env, ...env },
        shell: false
    });
    child.stdout.on("data", (d) => process.stdout.write(label(d) + "\n"));
    child.stderr.on("data", (d) => process.stderr.write(label(d) + "\n"));
    child.on("exit", (code) => {
        console.log(`\x1B[${colour}m${name}\x1B[0m exited (${code}); stopping the rest.`);
        shutdown(code ?? 0);
    });
    children.push(child);
    return child;
}
let stopping = false;
function shutdown(code) {
    if (stopping)
        return;
    stopping = true;
    for (const c of children) {
        try {
            c.kill("SIGTERM");
        }
        catch {
        }
    }
    setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
const port = process.env.PORT;
const bridgeEnv = writes ? { ZIMO_ALLOW_WRITES: "1" } : {};
if (port) {
    bridgeEnv.ZIMO_ALLOWED_ORIGINS = `http://localhost:${port},http://127.0.0.1:${port}`;
    console.log(`  serving the face on port ${port}; the bridge will accept it.
`);
}
vendorWasm();
console.log("\nJ.A.R.V.I.S. starting \u2014 the brain and the face.\n");
run("bridge", "node", ["bridge/server.mjs"], "36", bridgeEnv);
run("face", process.execPath, ["node_modules/vite/bin/vite.js"], "35", {});
console.log('\nWhen it says the dev server is ready, open the URL it prints in Chrome,\nclick INITIALISE, and say "Hey Zimo". Ctrl-C stops everything.\n');
