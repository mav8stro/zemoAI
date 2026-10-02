import { randomBytes } from "node:crypto";
import { fetchText, peek, proxyError } from "./net.mjs";
const SCROLL_SHIM = `
addEventListener('message', function (e) {
  var d = e.data
  if (!d || d.zimo !== 'scroll') return
  if (d.to === 'top') { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
  if (d.to === 'bottom') { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); return }
  window.scrollBy({ top: d.dy || 0, behavior: d.smooth ? 'smooth' : 'auto' })
})
// Announce, so the blade knows the listener exists rather than posting into a
// document that has rendered but not yet run anything. Without this the first
// scroll of every article is silently dropped, which reads as scrolling being
// broken rather than early.
try { parent.postMessage({ zimo: 'ready' }, '*') } catch (e) {}
`;
const MAX_PAGE_BYTES = 8 * 1024 * 1024;
const PAGE_TIMEOUT_MS = 15e3;
const PEEK_TIMEOUT_MS = 8e3;
const KILL = [
    "script",
    "style",
    "noscript",
    "template",
    "svg",
    "canvas",
    "form",
    "iframe",
    "object",
    "embed",
    "applet",
    "link",
    "meta"
];
function stripDangerous(html) {
    let out = html.replace(/<!--[\s\S]*?-->/g, "");
    for (const tag of KILL) {
        out = out.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, "gi"), "");
        out = out.replace(new RegExp(`<${tag}\\b[^>]*/?>`, "gi"), "");
    }
    out = out.replace(/\son[a-z]+\s*=\s*(["'])[\s\S]*?\1/gi, "");
    out = out.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
    out = out.replace(/(href|src|action|poster)\s*=\s*(["'])\s*(javascript|data:text\/html|vbscript):[\s\S]*?\2/gi, '$1="#"');
    return out;
}
const textOf = (html) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))).replace(/\s+/g, " ").trim();
const escape = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function metaContent(html, names) {
    for (const name of names) {
        const re = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${name}["'][^>]*>`, "i");
        const tag = re.exec(html)?.[0];
        if (!tag)
            continue;
        const value = /content\s*=\s*["']([\s\S]*?)["']/i.exec(tag)?.[1];
        if (value)
            return textOf(value);
    }
    return "";
}
function titleOf(html) {
    return metaContent(html, ["og:title", "twitter:title"]) || textOf(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "") || "";
}
function stripFurniture(html) {
    let out = html;
    for (const tag of ["nav", "aside", "header", "footer"]) {
        out = out.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, "gi"), "");
    }
    return out;
}
function proseLength(html) {
    let total = 0;
    for (const m of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
        total += textOf(m[1]).length;
    }
    return total;
}
function articleBody(html) {
    const clean = stripFurniture(html);
    const candidates = [];
    const add = (fragment) => {
        if (!fragment)
            return;
        const prose = proseLength(fragment);
        if (prose > 200)
            candidates.push({ fragment, prose });
    };
    for (const m of clean.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi))
        add(m[1]);
    for (const m of clean.matchAll(/<main\b[^>]*>([\s\S]*?)<\/main>/gi))
        add(m[1]);
    for (const m of clean.matchAll(/<(?:div|section)\b[^>]*>([\s\S]*?)<\/(?:div|section)>/gi)) {
        add(m[1]);
    }
    if (candidates.length) {
        candidates.sort((a, b) => b.prose - a.prose || a.fragment.length - b.fragment.length);
        const best = candidates[0];
        const tight = candidates.filter((c) => c.prose >= best.prose * 0.98).sort((a, b) => a.fragment.length - b.fragment.length)[0];
        return tight.fragment;
    }
    const paras = [...clean.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)].map((m) => m[0]);
    if (paras.length)
        return paras.join("\n");
    return clean;
}
function readableText(body) {
    const parts = [];
    let seenProse = false;
    const pattern = /<(h1|h2|h3|p|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
    let m;
    while ((m = pattern.exec(body)) !== null) {
        const tag = m[1].toLowerCase();
        const text = textOf(m[2]);
        if (!text)
            continue;
        if (tag === "li" && !seenProse)
            continue;
        if (tag === "p" && text.split(/\s+/).length > 8)
            seenProse = true;
        parts.push(text);
    }
    return parts.join(" ");
}
function absolute(href, base) {
    try {
        return new URL(href, base).href;
    }
    catch {
        return null;
    }
}
function toReader(html, pageUrl, bridgeOrigin) {
    const clean = stripDangerous(html);
    const body = articleBody(clean);
    const title = titleOf(html);
    const lead = metaContent(html, ["og:image", "twitter:image"]);
    const blocks = [];
    let seenProse = false;
    const pattern = /<(h1|h2|h3|p|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1\s*>|<img\b([^>]*)>/gi;
    let m;
    while ((m = pattern.exec(body)) !== null) {
        if (m[3] !== void 0) {
            const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(m[3])?.[1];
            const abs = src ? absolute(src, pageUrl) : null;
            if (abs && /^https?:/i.test(abs)) {
                blocks.push(`<img class="rd-img" loading="lazy" src="${bridgeOrigin}/img?url=${encodeURIComponent(abs)}" alt="">`);
            }
            continue;
        }
        const tag = m[1].toLowerCase();
        const text = textOf(m[2]);
        if (!text || text.length < 2)
            continue;
        if (tag === "li") {
            if (!seenProse)
                continue;
            blocks.push(`<li class="rd-li">${escape(text)}</li>`);
        }
        else if (tag === "blockquote") {
            blocks.push(`<blockquote class="rd-q">${escape(text)}</blockquote>`);
        }
        else if (tag === "p") {
            if (text.split(/\s+/).length > 8)
                seenProse = true;
            blocks.push(`<p class="rd-p">${escape(text)}</p>`);
        }
        else {
            blocks.push(`<${tag} class="rd-h">${escape(text)}</${tag}>`);
        }
    }
    const leadImg = lead && /^https?:/i.test(lead) ? `<img class="rd-lead" src="${bridgeOrigin}/img?url=${encodeURIComponent(lead)}" alt="">` : "";
    const host = (() => {
        try {
            return new URL(pageUrl).hostname.replace(/^www\./, "");
        }
        catch {
            return "";
        }
    })();
    return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title || host)}</title>
<style>
  :root { color-scheme: dark; }
  html,body { margin:0; background:transparent; }
  body {
    font: 400 15px/1.62 ui-sans-serif, -apple-system, "Segoe UI", sans-serif;
    color: #cfe9ee; padding: 18px 22px 40px;
    -webkit-font-smoothing: antialiased;
  }
  .rd-src { font: 500 10px/1 ui-monospace, monospace; letter-spacing:.16em;
            text-transform:uppercase; color:#5fd8e0; opacity:.8; }
  .rd-title { font-size: 25px; line-height:1.2; font-weight:600; color:#eafcff;
              margin: 10px 0 18px; }
  .rd-h { font-size: 16px; color:#eafcff; margin: 22px 0 8px; font-weight:600; }
  .rd-p { margin: 0 0 14px; }
  .rd-li { margin: 0 0 7px 18px; }
  .rd-q { margin: 16px 0; padding-left: 14px; border-left: 2px solid #19c4c4;
          color:#9fdbe2; font-style: italic; }
  img { max-width:100%; height:auto; display:block; border-radius:4px;
        margin: 14px 0; }
  .rd-lead { margin-bottom: 18px; }
  ::-webkit-scrollbar { width: 9px; }
  ::-webkit-scrollbar-thumb { background: #19c4c455; border-radius: 9px; }
</style></head><body>
<div class="rd-src">${escape(host)}</div>
<h1 class="rd-title">${escape(title)}</h1>
${leadImg}
${blocks.join("\n") || '<p class="rd-p">Nothing readable could be extracted from this page.</p>'}
</body></html>`;
}
function toLive(html, pageUrl) {
    let out = stripDangerous(html);
    out = out.replace(/<base\b[^>]*>/gi, "");
    const injected = `<base href="${escape(pageUrl)}"><style>html{background:#06101a;color-scheme:dark}::-webkit-scrollbar{width:9px}::-webkit-scrollbar-thumb{background:#19c4c455;border-radius:9px}</style>`;
    if (/<head\b[^>]*>/i.test(out)) {
        out = out.replace(/<head\b[^>]*>/i, (h) => `${h}${injected}`);
    }
    else {
        out = `<!doctype html><html><head><meta charset="utf-8">${injected}</head><body>${out}</body></html>`;
    }
    return out;
}
async function renderPage(url, mode, bridgeOrigin) {
    const page = await fetchText(url, {
        maxBytes: MAX_PAGE_BYTES,
        timeoutMs: PAGE_TIMEOUT_MS
    });
    if (!/^text\/html|^application\/xhtml/.test(page.type)) {
        throw proxyError(415, `not a web page (got ${page.type || "nothing"})`);
    }
    const live = mode === "live";
    const nonce = randomBytes(16).toString("base64");
    const shim = `<script nonce="${nonce}">${SCROLL_SHIM}</script>`;
    const rendered = live ? toLive(page.text, page.url) : toReader(page.text, page.url, bridgeOrigin);
    const body = rendered.includes("</body>") ? rendered.replace("</body>", `${shim}</body>`) : rendered + shim;
    const csp = live ? `default-src 'none'; img-src https: http: data: blob:; style-src 'unsafe-inline' https: http: data:; font-src https: http: data:; media-src https: http: data:; script-src 'nonce-${nonce}'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'` : `default-src 'none'; img-src ${bridgeOrigin} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'`;
    return {
        body,
        title: titleOf(page.text),
        headers: {
            "content-type": "text/html; charset=utf-8",
            "content-security-policy": csp,
            "x-content-type-options": "nosniff",
            referrerpolicy: "no-referrer",
            "cache-control": "no-store"
        }
    };
}
async function probeUrl(url) {
    let head;
    try {
        head = await peek(url, { timeoutMs: PEEK_TIMEOUT_MS });
    }
    catch (err) {
        return {
            ok: false,
            url,
            reason: err?.message ?? String(err),
            suggestion: "unavailable"
        };
    }
    const type = head.type || "";
    const kind = /^image\//.test(type) ? "image" : /^video\//.test(type) ? "video" : /^audio\//.test(type) ? "audio" : /^application\/pdf/.test(type) ? "pdf" : /^text\/html|^application\/xhtml/.test(type) ? "page" : "other";
    const base = {
        ok: head.status === 200,
        url: head.url,
        status: head.status,
        contentType: type,
        bytes: head.bytes,
        kind
    };
    if (kind === "image") {
        return { ...base, suggestion: base.ok ? "blade_image" : "unavailable" };
    }
    if (kind === "video" || kind === "audio") {
        return { ...base, suggestion: base.ok ? "blade_video" : "unavailable" };
    }
    if (kind !== "page" || !base.ok) {
        return { ...base, suggestion: base.ok ? "speak_only" : "unavailable" };
    }
    try {
        const full = await fetchText(head.url, {
            maxBytes: MAX_PAGE_BYTES,
            timeoutMs: PAGE_TIMEOUT_MS
        });
        const clean = stripDangerous(full.text);
        const readable = readableText(articleBody(clean));
        const title = titleOf(full.text);
        const lead = metaContent(full.text, ["og:image", "twitter:image"]);
        return {
            ...base,
            title,
            readableChars: readable.length,
            leadImage: lead || null,
            excerpt: readable.slice(0, 300),
            suggestion: readable.length > 900 ? "blade_reader" : "blade_live"
        };
    }
    catch (err) {
        return { ...base, suggestion: "blade_live", reason: err?.message ?? String(err) };
    }
}
export { probeUrl, renderPage };
