import { spawn } from "node:child_process";
import process from "node:process";
process.env.ZIMO_ALLOW_WRITES = "1";
const child = spawn(process.execPath, ["bridge/server.mjs"], {
    stdio: "inherit",
    env: process.env
});
child.on("exit", (code) => process.exit(code ?? 0));
