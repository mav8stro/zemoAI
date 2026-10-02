import { execFile } from "node:child_process";
import { cpus, loadavg, platform } from "node:os";
import { promisify } from "node:util";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
const run = promisify(execFile);
let throttleUntil = 0;
function throttled() {
    return Date.now() < throttleUntil;
}
function setThrottle(ms) {
    throttleUntil = Date.now() + ms;
}
async function macTherm() {
    try {
        const { stdout } = await run("pmset", ["-g", "therm"]);
        const pressure = /CPU_Scheduler_Limit\s*=\s*(\d+)/.exec(stdout)?.[1];
        const speed = /CPU_Speed_Limit\s*=\s*(\d+)/.exec(stdout)?.[1];
        if (!pressure && !speed)
            return null;
        return { source: "pmset -g therm", schedulerLimitPct: pressure ? Number(pressure) : null, speedLimitPct: speed ? Number(speed) : null };
    }
    catch {
        return null;
    }
}
async function linuxTherm() {
    try {
        const { readdirSync, readFileSync } = await import("node:fs");
        const zones = readdirSync("/sys/class/thermal").filter((n) => n.startsWith("thermal_zone"));
        const readings = zones.map((z2) => {
            try {
                const milli = Number(readFileSync(`/sys/class/thermal/${z2}/temp`, "utf8").trim());
                const type = readFileSync(`/sys/class/thermal/${z2}/type`, "utf8").trim();
                return { zone: type, celsius: milli / 1e3 };
            }
            catch {
                return null;
            }
        }).filter(Boolean);
        return readings.length ? { source: "/sys/class/thermal", readings } : null;
    }
    catch {
        return null;
    }
}
async function windowsTherm() {
    try {
        const { stdout } = await run("powershell", [
            "-NoProfile",
            "-Command",
            'Get-CimInstance MSAcpi_ThermalZoneTemperature -Namespace "root/wmi" | Select-Object -ExpandProperty CurrentTemperature'
        ]);
        const raw = stdout.split(/\s+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
        if (!raw.length)
            return null;
        const celsius = raw.map((k) => k / 10 - 273.15);
        return { source: "MSAcpi_ThermalZoneTemperature", readings: celsius.map((celsius2, i) => ({ zone: `zone${i}`, celsius: celsius2 })) };
    }
    catch {
        return null;
    }
}
async function readThermal() {
    const p = platform();
    const native = p === "darwin" ? await macTherm() : p === "linux" ? await linuxTherm() : p === "win32" ? await windowsTherm() : null;
    return {
        platform: p,
        load: loadavg(),
        cores: cpus().length,
        native,
        nativeAvailable: Boolean(native)
    };
}
function coolingServer() {
    return createSdkMcpServer({
        name: "cooling",
        version: "1.0.0",
        tools: [
            tool("system_thermal_status", "Report the laptop's current thermal/load state, and whether ZIMO is currently throttling his own background work because of it. Honest about the limits: most laptops do not expose real temperature to software without a vendor tool, so this falls back to CPU load as the best available signal.", {}, async () => {
                const t = await readThermal();
                const summary = t.nativeAvailable ? `Native thermal data available via ${t.native.source}.` : `No native thermal sensor exposed on ${t.platform} \u2014 reporting CPU load (${t.cores} cores, 1-min load ${t.load[0].toFixed(2)}) as the best available proxy.`;
                return {
                    content: [
                        {
                            type: "text",
                            text: `${summary} Self-throttle is currently ${throttled() ? "ON" : "off"}.
${JSON.stringify(t, null, 2)}`
                        }
                    ]
                };
            }),
            tool("system_cool_down", "Back off ZIMO's own heavy background work (agent loop frequency, proactive polling) for a while, because the machine is running hot or the user asked him to ease up. This does not and cannot control a physical fan.", { minutes: z.number().min(1).max(180).default(15).describe("How long to stay throttled.") }, async ({ minutes }) => {
                setThrottle(minutes * 6e4);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Throttling background work for ${minutes} minutes. Note honestly: this reduces what ZIMO himself does, it does not and cannot spin your fan \u2014 that's firmware, not something a web page or Node process can reach.`
                        }
                    ]
                };
            })
        ]
    });
}
export { coolingServer, setThrottle, throttled };
