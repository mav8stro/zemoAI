#!/usr/bin/env node
import { platform, homedir } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const NODE = process.execPath;
function macos() {
    const label = "dev.zimo.bridge";
    const plistDir = join(homedir(), "Library", "LaunchAgents");
    const plistPath = join(plistDir, `${label}.plist`);
    mkdirSync(plistDir, { recursive: true });
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE}</string>
    <string>${join(ROOT, "bridge", "server.mjs")}</string>
  </array>
  <key>WorkingDirectory</key><string>${ROOT}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${join(homedir(), ".zimo", "bridge.log")}</string>
  <key>StandardErrorPath</key><string>${join(homedir(), ".zimo", "bridge.err.log")}</string>
</dict>
</plist>`;
    mkdirSync(join(homedir(), ".zimo"), { recursive: true });
    writeFileSync(plistPath, plist);
    execSync(`launchctl unload "${plistPath}" 2>/dev/null || true`);
    execSync(`launchctl load "${plistPath}"`);
    console.log(`Installed and started. Logs: ~/.zimo/bridge.log`);
    console.log(`Uninstall: launchctl unload "${plistPath}" && rm "${plistPath}"`);
}
function linux() {
    const unitDir = join(homedir(), ".config", "systemd", "user");
    mkdirSync(unitDir, { recursive: true });
    const unitPath = join(unitDir, "zimo-bridge.service");
    const unit = `[Unit]
Description=ZIMO bridge

[Service]
ExecStart=${NODE} ${join(ROOT, "bridge", "server.mjs")}
WorkingDirectory=${ROOT}
Restart=on-failure

[Install]
WantedBy=default.target
`;
    writeFileSync(unitPath, unit);
    execSync("systemctl --user daemon-reload");
    execSync("systemctl --user enable --now zimo-bridge.service");
    console.log("Installed and started. Logs: journalctl --user -u zimo-bridge -f");
    console.log("Uninstall: systemctl --user disable --now zimo-bridge.service");
}
function unsupported() {
    console.log(`No installer for ${platform()} yet. Run "npm run bridge" in a terminal that stays open, or wire it into your own startup tooling \u2014 bridge/server.mjs takes no arguments.`);
}
const os = platform();
if (os === "darwin")
    macos();
else if (os === "linux")
    linux();
else
    unsupported();
