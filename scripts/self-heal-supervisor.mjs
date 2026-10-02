#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { PATHS, ensureHome } from "../bridge/home.mjs";
import { heal, PROJECT_ROOT } from "../bridge/selfheal.mjs";
const SELF_HEAL_EXIT_CODE = 77;
const MAX_ATTEMPTS = Number(process.env.ZIMO_SELF_HEAL_MAX_ATTEMPTS ?? 5);
const WINDOW_MS = Number(process.env.ZIMO_SELF_HEAL_WINDOW_MS ?? 60 * 60 * 1e3);
const MAX_PLAIN_RESTARTS = Number(process.env.ZIMO_MAX_PLAIN_RESTARTS ?? 10);
const PLAIN_WINDOW_MS = 5 * 60 * 1e3;
function readState() {
    ensureHome();
    if (!existsSync(PATHS.selfHealState))
        return { attempts: [], plainRestarts: [] };
    try {
        return JSON.parse(readFileSync(PATHS.selfHealState, "utf8"));
    }
    catch {
        return { attempts: [], plainRestarts: [] };
    }
}
function writeState(state) {
    ensureHome();
    writeFileSync(PATHS.selfHealState, JSON.stringify(state, null, 2));
}
function prune(timestamps, windowMs) {
    const now = Date.now();
    return timestamps.filter((t) => now - t < windowMs);
}
function log(line) {
    const stamped = `${(new Date()).toISOString()} [supervisor] ${line}`;
    console.log(stamped);
    try {
        ensureHome();
        appendFileSync(PATHS.selfHealLog, stamped + "\n");
    }
    catch {
    }
}
let stopping = false;
let child = null;
function launchBridge() {
    child = spawn(process.execPath, [join(PROJECT_ROOT, "bridge", "server.mjs")], {
        stdio: "inherit",
        env: { ...process.env, ZIMO_SELF_HEAL: "1" }
    });
    child.on("exit", (code, signal) => {
        if (stopping)
            return;
        void onExit(code, signal);
    });
}
async function onExit(code, signal) {
    if (signal) {
        log(`bridge exited on signal ${signal} \u2014 not restarting.`);
        return;
    }
    if (code === 0) {
        log("bridge exited cleanly \u2014 not restarting.");
        return;
    }
    const state = readState();
    if (code === SELF_HEAL_EXIT_CODE && existsSync(PATHS.lastCrash)) {
        state.attempts = prune(state.attempts ?? [], WINDOW_MS);
        if (state.attempts.length >= MAX_ATTEMPTS) {
            log(`${state.attempts.length} self-heal attempts in the last ${WINDOW_MS / 6e4} minutes \u2014 giving up rather than looping forever. Read ${PATHS.selfHealLog} and ${PATHS.lastCrash}, fix it by hand, then rerun \`npm run start:heal\`.`);
            return;
        }
        state.attempts.push(Date.now());
        writeState(state);
        let crash;
        try {
            crash = JSON.parse(readFileSync(PATHS.lastCrash, "utf8"));
        }
        catch (err) {
            log(`could not read crash report (${err.message}) \u2014 restarting without a heal attempt.`);
            return launchBridge();
        }
        log(`bridge crashed (${crash.kind}: ${crash.message}) \u2014 attempting self-heal (attempt ${state.attempts.length}/${MAX_ATTEMPTS})...`);
        try {
            const result = await heal(crash);
            if (result.healed) {
                log(`self-heal applied \u2014 ${result.summary} (${result.filesChanged.join(", ") || "no files listed"})`);
            }
            else {
                log(`self-heal did not produce a validated patch \u2014 ${result.summary}`);
            }
        }
        catch (err) {
            log(`self-heal itself threw: ${err?.message ?? err}`);
        }
        return launchBridge();
    }
    state.plainRestarts = prune(state.plainRestarts ?? [], PLAIN_WINDOW_MS);
    if (state.plainRestarts.length >= MAX_PLAIN_RESTARTS) {
        log(`${state.plainRestarts.length} plain restarts in ${PLAIN_WINDOW_MS / 6e4} minutes \u2014 giving up. Exit code was ${code}; check ${PATHS.selfHealLog} and the console above.`);
        return;
    }
    state.plainRestarts.push(Date.now());
    writeState(state);
    log(`bridge exited with code ${code} \u2014 restarting (${state.plainRestarts.length}/${MAX_PLAIN_RESTARTS} in this window).`);
    launchBridge();
}
for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
        stopping = true;
        log(`${sig} received \u2014 stopping the bridge and exiting.`);
        child?.kill(sig);
        process.exit(0);
    });
}
log(`starting bridge under self-heal supervision (max ${MAX_ATTEMPTS} heals / ${WINDOW_MS / 6e4}min).`);
launchBridge();
