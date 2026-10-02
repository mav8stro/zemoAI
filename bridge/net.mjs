import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";
const MAX_REDIRECTS = 4;
const PROXY_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const BLOCKED_HOSTNAME = /(^|\.)(localhost|local|internal|intranet|home\.arpa)$/i;
function blockedAddress(ip) {
    let addr = String(ip ?? "").toLowerCase().split("%")[0];
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(addr);
    if (mapped)
        addr = mapped[1];
    if (addr.includes(".")) {
        const parts = addr.split(".").map(Number);
        if (parts.length !== 4)
            return true;
        if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
            return true;
        const [a, b] = parts;
        if (a === 0)
            return true;
        if (a === 10)
            return true;
        if (a === 127)
            return true;
        if (a === 169 && b === 254)
            return true;
        if (a === 172 && b >= 16 && b <= 31)
            return true;
        if (a === 192 && b === 168)
            return true;
        if (a === 192 && b === 0)
            return true;
        if (a === 100 && b >= 64 && b <= 127)
            return true;
        if (a === 198 && (b === 18 || b === 19))
            return true;
        if (a >= 224)
            return true;
        return false;
    }
    if (addr === "::" || addr === "::1")
        return true;
    if (/^::ffff:/.test(addr)) {
        const hex = addr.slice(7).split(":");
        if (hex.length === 2) {
            const high = parseInt(hex[0], 16);
            const low = parseInt(hex[1], 16);
            if (Number.isFinite(high) && Number.isFinite(low)) {
                return blockedAddress([high >> 8, high & 255, low >> 8, low & 255].join("."));
            }
        }
        return true;
    }
    if (/^f[cd]/.test(addr))
        return true;
    if (/^fe[89ab]/.test(addr))
        return true;
    if (/^ff/.test(addr))
        return true;
    return false;
}
function guardedLookup(hostname, options, callback) {
    const opts = typeof options === "function" ? {} : options ?? {};
    const done = typeof options === "function" ? options : callback;
    dnsLookup(hostname, { ...opts, all: true }, (err, addresses) => {
        if (err)
            return done(err);
        const list = Array.isArray(addresses) ? addresses : [addresses];
        if (!list.length)
            return done(new Error("no address"));
        for (const entry of list) {
            if (blockedAddress(entry.address)) {
                const blocked = new Error(`refusing ${hostname}: resolves to the private address ${entry.address}`);
                blocked.code = "EBLOCKEDADDRESS";
                return done(blocked);
            }
        }
        if (opts.all)
            return done(null, list);
        return done(null, list[0].address, list[0].family);
    });
}
function proxyError(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
}
function vetTarget(raw) {
    let url;
    try {
        url = new URL(String(raw ?? ""));
    }
    catch {
        throw proxyError(400, "absolute http(s) url required");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw proxyError(400, "absolute http(s) url required");
    }
    if (!url.hostname)
        throw proxyError(400, "absolute http(s) url required");
    if (BLOCKED_HOSTNAME.test(url.hostname))
        throw proxyError(403, "blocked host");
    const literal = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(literal) && blockedAddress(literal)) {
        throw proxyError(403, "blocked host");
    }
    return url;
}
function requestOnce(url, headers, timeoutMs) {
    return new Promise((resolve, reject) => {
        const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
            method: "GET",
            headers,
            lookup: guardedLookup
        });
        const deadline = setTimeout(() => {
            req.destroy(proxyError(504, "upstream timed out"));
        }, timeoutMs);
        req.setTimeout(timeoutMs, () => {
            req.destroy(proxyError(504, "upstream stalled"));
        });
        req.on("response", (res) => {
            clearTimeout(deadline);
            resolve(res);
        });
        req.on("error", (err) => {
            clearTimeout(deadline);
            reject(err.code === "EBLOCKEDADDRESS" ? proxyError(403, "blocked host") : err.status ? err : proxyError(502, "upstream unreachable"));
        });
        req.end();
    });
}
async function openRemote(startUrl, headers, timeoutMs) {
    let url = startUrl;
    for (let hop = 0;; hop++) {
        const res = await requestOnce(url, headers, timeoutMs);
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location) {
            res.resume();
            if (hop >= MAX_REDIRECTS)
                throw proxyError(502, "too many redirects");
            let next;
            try {
                next = new URL(location, url);
            }
            catch {
                throw proxyError(502, "bad redirect");
            }
            url = vetTarget(next.href);
            continue;
        }
        return { res, url };
    }
}
async function fetchText(url, { maxBytes, timeoutMs, accept }) {
    const target = vetTarget(url);
    const { res, url: finalUrl } = await openRemote(target, {
        "user-agent": PROXY_UA,
        accept: accept ?? "text/html,application/xhtml+xml,*/*;q=0.8",
        "accept-language": "en-GB,en;q=0.9",
        "accept-encoding": "identity"
    }, timeoutMs);
    const status = res.statusCode ?? 0;
    const type = String(res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (status !== 200) {
        res.resume();
        throw proxyError(status === 404 ? 404 : 502, `upstream said ${status}`);
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of res) {
        size += chunk.length;
        if (size > maxBytes) {
            res.destroy();
            throw proxyError(413, "page too large");
        }
        chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks);
    const declared = /charset=["']?([\w-]+)/i.exec(String(res.headers["content-type"] ?? ""));
    const meta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(raw.subarray(0, 4096).toString("latin1"));
    const charset = (declared?.[1] ?? meta?.[1] ?? "utf-8").toLowerCase();
    let text;
    try {
        text = new TextDecoder(charset).decode(raw);
    }
    catch {
        text = raw.toString("utf8");
    }
    return { text, type, url: finalUrl.href, headers: res.headers, bytes: size };
}
async function peek(url, { timeoutMs }) {
    const target = vetTarget(url);
    const { res, url: finalUrl } = await openRemote(target, { "user-agent": PROXY_UA, accept: "*/*", "accept-encoding": "identity" }, timeoutMs);
    const out = {
        status: res.statusCode ?? 0,
        type: String(res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase(),
        bytes: Number(res.headers["content-length"]) || null,
        headers: res.headers,
        url: finalUrl.href
    };
    res.destroy();
    return out;
}
export { MAX_REDIRECTS, PROXY_UA, blockedAddress, fetchText, guardedLookup, openRemote, peek, proxyError, requestOnce, vetTarget };
