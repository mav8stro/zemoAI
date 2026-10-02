import { spawn } from "node:child_process";
import process from "node:process";
process.env.ZIMO_ELECTRON_DEV_URL = "http://localhost:5173";
const child = spawn("npx", ["electron", "."], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env
});
child.on("exit", (code) => process.exit(code ?? 0));
