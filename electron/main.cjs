"use strict";
const { app, BrowserWindow, session } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
function loadEnvFile(filePath) {
    try {
        if (!fs.existsSync(filePath))
            return;
        const content = fs.readFileSync(filePath, "utf8");
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
loadEnvFile(path.join(__dirname, "..", ".env.local"));
loadEnvFile(path.join(__dirname, "..", ".env"));
let bridge = null;
let win = null;
let staticServer = null;
const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".wasm": "application/wasm",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".webm": "audio/webm",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".task": "application/octet-stream"
};
function checkPortInUse(port) {
    return new Promise((resolve) => {
        const s = http.get(`http://127.0.0.1:${port}/health`, { timeout: 800 }, (res) => {
            res.resume();
            resolve(true);
        });
        s.on("error", () => resolve(false));
        s.on("timeout", () => {
            s.destroy();
            resolve(false);
        });
    });
}
function checkDevServer(url) {
    return new Promise((resolve) => {
        const s = http.get(url, { timeout: 800 }, (res) => {
            res.resume();
            resolve(res.statusCode >= 200 && res.statusCode < 400);
        });
        s.on("error", () => resolve(false));
        s.on("timeout", () => {
            s.destroy();
            resolve(false);
        });
    });
}
async function startBridge() {
    const bridgePort = Number(process.env.ZIMO_BRIDGE_PORT || 8787);
    const isRunning = await checkPortInUse(bridgePort);
    if (isRunning) {
        console.log(`[zimo] bridge is already active on port ${bridgePort}`);
        return;
    }
    const serverPath = path.join(__dirname, "..", "bridge", "server.mjs");
    bridge = spawn(process.execPath, [serverPath], {
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: "1",
            ZIMO_ALLOW_NO_ORIGIN: "1",
            ZIMO_ALLOWED_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,file://,null"
        },
        stdio: "inherit"
    });
    bridge.on("exit", (code) => {
        if (code && code !== 0)
            console.error(`[zimo] bridge exited with code ${code}`);
    });
}
function startStaticServer(distDir) {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            try {
                const parsed = new URL(req.url, "http://127.0.0.1");
                let reqPath = decodeURIComponent(parsed.pathname);
                let filePath = path.join(distDir, reqPath === "/" ? "index.html" : reqPath);
                if (!filePath.startsWith(distDir)) {
                    res.writeHead(403);
                    return res.end("Forbidden");
                }
                if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                    filePath = path.join(distDir, "index.html");
                }
                if (!fs.existsSync(filePath)) {
                    res.writeHead(404, { "Content-Type": "text/plain" });
                    return res.end("dist not built. Run npm run build first.");
                }
                const ext = path.extname(filePath).toLowerCase();
                const contentType = mimeTypes[ext] || "application/octet-stream";
                res.writeHead(200, {
                    "Content-Type": contentType,
                    "Access-Control-Allow-Origin": "*"
                });
                fs.createReadStream(filePath).pipe(res);
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
                    server.listen(port, "127.0.0.1");
                }
                else {
                    server.listen(0, "127.0.0.1");
                }
            }
            else {
                reject(err);
            }
        });
        server.listen(port, "127.0.0.1", () => {
            const actualPort = server.address().port;
            staticServer = server;
            console.log(`[zimo] serving face from http://127.0.0.1:${actualPort}`);
            resolve(actualPort);
        });
    });
}
async function createWindow() {
    win = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "Z.E.M.O.",
        backgroundColor: "#000000",
        autoHideMenuBar: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowed = ["media", "mediaKeySystem", "notifications"];
        callback(allowed.includes(permission));
    });
    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
        return ["media", "mediaKeySystem"].includes(permission);
    });
    let targetUrl = process.env.ZIMO_ELECTRON_DEV_URL;
    if (!targetUrl) {
        const isViteUp = await checkDevServer("http://localhost:5173");
        if (isViteUp) {
            targetUrl = "http://localhost:5173";
        }
        else {
            const distDir = path.join(__dirname, "..", "dist");
            const port = await startStaticServer(distDir);
            targetUrl = `http://127.0.0.1:${port}`;
        }
    }
    console.log(`[zimo] loading interface from ${targetUrl}`);
    win.loadURL(targetUrl);
    win.webContents.on("did-fail-load", (e, code, desc, failedUrl) => {
        console.error(`[zimo] failed to load ${failedUrl}: ${desc} (${code})`);
    });
}
app.whenReady().then(async () => {
    await startBridge();
    setTimeout(createWindow, 600);
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        app.quit();
});
app.on("before-quit", () => {
    if (staticServer) {
        try {
            staticServer.close();
        }
        catch {
        }
    }
    if (bridge && !bridge.killed) {
        try {
            bridge.kill();
        }
        catch {
        }
    }
});
