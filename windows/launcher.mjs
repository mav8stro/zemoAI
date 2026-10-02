import { spawn, execSync } from "node:child_process";
import { existsSync, createReadStream, statSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const BRIDGE_PATH = path.join(ROOT_DIR, "bridge", "server.mjs");
const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".wasm": "application/wasm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".onnx": "application/octet-stream"
};
let bridgeProcess = null;
let staticServer = null;
let browserProcess = null;
function findBrowser() {
    const localAppData = process.env.LOCALAPPDATA || "";
    const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const candidates = [
        path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(programFiles, "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
    ];
    for (const p of candidates) {
        if (existsSync(p))
            return p;
    }
    return null;
}
function checkPortInUse(port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(400);
        socket.once("connect", () => {
            socket.destroy();
            resolve(true);
        });
        socket.once("timeout", () => {
            socket.destroy();
            resolve(false);
        });
        socket.once("error", () => {
            resolve(false);
        });
        socket.connect(port, "127.0.0.1");
    });
}
async function startBridge() {
    const port = Number(process.env.ZIMO_BRIDGE_PORT || 8787);
    const isRunning = await checkPortInUse(port);
    if (isRunning) {
        console.log(`[zemo-app] bridge is already active on port ${port}`);
        return;
    }
    const interfaces = os.networkInterfaces();
    let lanIp = "127.0.0.1";
    for (const iface of Object.values(interfaces)) {
        for (const alias of iface || []) {
            if (alias.family === "IPv4" && !alias.internal) {
                lanIp = alias.address;
                break;
            }
        }
    }
    console.log("[zemo-app] starting ZEMO bridge...");
    bridgeProcess = spawn(process.execPath, [BRIDGE_PATH], {
        cwd: ROOT_DIR,
        env: {
            ...process.env,
            ZIMO_ALLOW_WRITES: "1",
            ZIMO_ALLOW_NO_ORIGIN: "1",
            ZIMO_ALLOWED_ORIGINS: `http://localhost:5173,http://127.0.0.1:5173,http://${lanIp}:5173,http://localhost:5174,http://127.0.0.1:5174,null`
        },
        stdio: "inherit"
    });
    bridgeProcess.on("exit", (code) => {
        if (code && code !== 0)
            console.error(`[zemo-app] bridge exited with code ${code}`);
    });
    for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (await checkPortInUse(port))
            break;
    }
}
function startStaticServer(distDir) {
    return new Promise((resolve, reject) => {
        const interfaces = os.networkInterfaces();
        let lanIp = "127.0.0.1";
        for (const iface of Object.values(interfaces)) {
            for (const alias of iface || []) {
                if (alias.family === "IPv4" && !alias.internal) {
                    lanIp = alias.address;
                    break;
                }
            }
        }
        const server = http.createServer((req, res) => {
            try {
                const parsed = new URL(req.url, "http://127.0.0.1");
                let reqPath = decodeURIComponent(parsed.pathname);
                let filePath = path.join(distDir, reqPath === "/" ? "index.html" : reqPath);
                if (!filePath.startsWith(distDir)) {
                    res.writeHead(403);
                    return res.end("Forbidden");
                }
                if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
                    filePath = path.join(distDir, "index.html");
                }
                if (!existsSync(filePath)) {
                    res.writeHead(404, { "Content-Type": "text/plain" });
                    return res.end("Build not found. Run npm run build first.");
                }
                const ext = path.extname(filePath).toLowerCase();
                const contentType = MIME_TYPES[ext] || "application/octet-stream";
                res.writeHead(200, {
                    "Content-Type": contentType,
                    "Access-Control-Allow-Origin": "*",
                    "Cross-Origin-Opener-Policy": "same-origin",
                    "Cross-Origin-Embedder-Policy": "require-corp"
                });
                createReadStream(filePath).pipe(res);
            }
            catch (err) {
                res.writeHead(500);
                res.end(err.message);
            }
        });
        let port = 5173;
        server.on("error", (err) => {
            if (err.code === "EADDRINUSE") {
                port++;
                if (port <= 5199) {
                    server.listen(port, "0.0.0.0");
                }
                else {
                    server.listen(0, "0.0.0.0");
                }
            }
            else {
                reject(err);
            }
        });
        server.listen(port, "0.0.0.0", () => {
            const actualPort = server.address().port;
            staticServer = server;
            console.log(`[zemo-app] laptop server home online at http://127.0.0.1:${actualPort}`);
            console.log(`[zemo-app] mobile device LAN link at http://${lanIp}:${actualPort}`);
            resolve(actualPort);
        });
    });
}
let isCleaningUp = false;
function cleanup() {
    if (isCleaningUp)
        return;
    isCleaningUp = true;
    console.log("\n[zemo-app] closing ZEMO services...");
    if (browserProcess && !browserProcess.killed) {
        try {
            browserProcess.kill();
        }
        catch {
        }
    }
    if (staticServer) {
        try {
            staticServer.close();
        }
        catch {
        }
    }
    if (bridgeProcess && !bridgeProcess.killed) {
        try {
            bridgeProcess.kill();
        }
        catch {
        }
    }
}
async function main() {
    const browserPath = findBrowser();
    if (!browserPath) {
        console.error("[zemo-app] Error: No compatible Chromium browser found (Microsoft Edge or Google Chrome).");
        process.exit(1);
    }
    process.on("SIGINT", () => {
        cleanup();
        process.exit(0);
    });
    process.on("SIGTERM", () => {
        cleanup();
        process.exit(0);
    });
    process.on("exit", cleanup);
    await startBridge();
    function checkHttpServer(url) {
        return new Promise((resolve) => {
            const req = http.get(url, { timeout: 800 }, (res) => {
                res.resume();
                resolve(res.statusCode >= 200 && res.statusCode < 400);
            });
            req.on("error", () => resolve(false));
            req.on("timeout", () => {
                req.destroy();
                resolve(false);
            });
        });
    }
    const isViteUp = await checkHttpServer("http://127.0.0.1:5173");
    let appUrl = "http://127.0.0.1:5173";
    if (!isViteUp) {
        if (!existsSync(path.join(DIST_DIR, "index.html"))) {
            console.log("[zemo-app] UI build not found. Compiling frontend bundle automatically...");
            try {
                execSync("npm run build", { cwd: ROOT_DIR, stdio: "inherit", shell: true });
            }
            catch (err) {
                console.error("[zemo-app] build error:", err.message);
            }
        }
        const port = await startStaticServer(DIST_DIR);
        appUrl = `http://127.0.0.1:${port}`;
    }
    else {
        console.log("[zemo-app] connected to active UI server on port 5173");
    }
    const profileDir = path.join(os.homedir(), ".zemo", "compact-profile");
    const defaultDir = path.join(profileDir, "Default");
    try {
        mkdirSync(defaultDir, { recursive: true });
        const prefFile = path.join(defaultDir, "Preferences");
        let prefs = {};
        if (existsSync(prefFile)) {
            try {
                prefs = JSON.parse(readFileSync(prefFile, "utf8"));
            }
            catch {
            }
        }
        if (!prefs.profile)
            prefs.profile = {};
        if (!prefs.profile.content_settings)
            prefs.profile.content_settings = {};
        if (!prefs.profile.content_settings.exceptions)
            prefs.profile.content_settings.exceptions = {};
        prefs.profile.content_settings.exceptions.media_stream_mic = {
            "http://127.0.0.1:5173,*": { setting: 1 },
            "http://localhost:5173,*": { setting: 1 },
            "http://127.0.0.1:5174,*": { setting: 1 }
        };
        prefs.profile.content_settings.exceptions.media_stream_camera = {
            "http://127.0.0.1:5173,*": { setting: 1 },
            "http://localhost:5173,*": { setting: 1 },
            "http://127.0.0.1:5174,*": { setting: 1 }
        };
        writeFileSync(prefFile, JSON.stringify(prefs, null, 2));
    }
    catch {
    }
    const browserArgs = [
        `--app=${appUrl}`,
        "--window-size=1360,860",
        "--window-position=center",
        `--user-data-dir=${profileDir}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-sync",
        "--autoplay-policy=no-user-gesture-required",
        "--enable-features=WebAssemblyThreads,SharedArrayBuffer",
        "--disable-features=Translate,OptimizationHints,MediaRouter"
    ];
    console.log(`[zemo-app] launching native window (${path.basename(browserPath)})...`);
    const startTime = Date.now();
    browserProcess = spawn(browserPath, browserArgs, {
        stdio: "ignore",
        detached: false
    });
    browserProcess.on("exit", (code) => {
        const uptime = Date.now() - startTime;
        if (uptime < 2500) {
            console.log("[zemo-app] ZEMO window is active on screen.");
            console.log("[zemo-app] Press Ctrl+C in this terminal to stop background services.");
            // Keep the event loop alive
            setInterval(() => {}, 1000 * 60 * 60);
            return;
        }
        console.log("[zemo-app] native window closed by user");
        cleanup();
        process.exit(0);
    });
}
main().catch((err) => {
    console.error("[zemo-app] launch error:", err);
    cleanup();
    process.exit(1);
});
