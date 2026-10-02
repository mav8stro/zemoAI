import DOMPurify from 'dompurify';
import { BRIDGE_HTTP_URL, withToken } from '../config';
const DISK_PATH = /^(?:[a-zA-Z]:[/\\]|\/(Users|home|root|Volumes|Applications|System|Library|private|tmp|var|opt|mnt|media|srv|data)\/)/;
function rewriteSrc(el: Element, attr: 'src' | 'poster', route: 'img' | 'media') {
    const raw = el.getAttribute(attr) ?? '';
    if (!raw)
        return;
    const path = raw.replace(/^file:\/\//, '');
    if (DISK_PATH.test(path)) {
        el.setAttribute(attr, withToken(`${BRIDGE_HTTP_URL}/file?path=${encodeURIComponent(path)}`));
        return;
    }
    if (!/^https?:\/\//i.test(raw))
        return;
    if (raw.startsWith(`${BRIDGE_HTTP_URL}/`))
        return;
    el.setAttribute(attr, withToken(`${BRIDGE_HTTP_URL}/${route}?url=${encodeURIComponent(raw)}`));
}
function rewriteMedia(root: Element) {
    root.querySelectorAll('img').forEach((img) => rewriteSrc(img, 'src', 'img'));
    root.querySelectorAll('video').forEach((video) => {
        rewriteSrc(video, 'src', 'media');
        rewriteSrc(video, 'poster', 'img');
    });
    root.querySelectorAll('source').forEach((source) => {
        const type = source.getAttribute('type') ?? '';
        rewriteSrc(source, 'src', /^image\//i.test(type) ? 'img' : 'media');
    });
}
const EMBED_HOSTS: Record<string, RegExp> = {
    'www.youtube-nocookie.com': /^\/embed\/[\w-]+/,
    'www.youtube.com': /^\/embed\/[\w-]+/,
    'player.vimeo.com': /^\/video\/\d+/,
};
const YT_ID = /^[\w-]{6,20}$/;
function toEmbedUrl(url: URL): URL | null {
    const host = url.hostname.toLowerCase().replace(/^(?:www|m|music)\./, '');
    let id = '';
    if (host === 'youtube.com' && url.pathname === '/watch')
        id = url.searchParams.get('v') ?? '';
    else if (host === 'youtu.be')
        id = url.pathname.slice(1);
    if (!YT_ID.test(id))
        return null;
    return new URL(`https://www.youtube-nocookie.com/embed/${id}`);
}
function rewriteEmbeds(root: Element) {
    root.querySelectorAll('iframe').forEach((frame) => {
        let url: URL;
        try {
            url = new URL(frame.getAttribute('src') ?? '', document.baseURI);
        }
        catch {
            frame.remove();
            return;
        }
        const embed = toEmbedUrl(url) ?? url;
        const path = EMBED_HOSTS[embed.hostname.toLowerCase()];
        if (!path || !path.test(embed.pathname)) {
            frame.remove();
            return;
        }
        embed.protocol = 'https:';
        frame.setAttribute('src', embed.toString());
    });
}
const EMBED_FEATURES = new Set([
    'accelerometer', 'autoplay', 'clipboard-write', 'encrypted-media',
    'fullscreen', 'gyroscope', 'picture-in-picture', 'web-share',
]);
function hardenMedia(root: Element) {
    root.querySelectorAll('img, video, iframe').forEach((el) => {
        el.setAttribute('referrerpolicy', 'no-referrer');
    });
    root.querySelectorAll('video').forEach((video) => {
        video.setAttribute('controls', '');
        video.setAttribute('preload', 'metadata');
        video.setAttribute('playsinline', '');
    });
    root.querySelectorAll('iframe[allow]').forEach((frame) => {
        const kept = (frame.getAttribute('allow') ?? '')
            .split(';')
            .map((part) => part.trim().split(/\s+/)[0].toLowerCase())
            .filter((feature) => EMBED_FEATURES.has(feature));
        if (kept.length)
            frame.setAttribute('allow', kept.join('; '));
        else
            frame.removeAttribute('allow');
    });
}
const ALLOWED_CLASSES = new Set([
    'hud-rows', 'hud-row', 'hud-idx', 'hud-main', 'hud-label', 'hud-sub',
    'hud-tag', 'hud-metric', 'hud-unit', 'hud-note', 'hud-img', 'hud-caption',
    'hud-grid', 'hud-bar', 'hud-dim', 'hud-hot',
    'hud-gallery', 'hud-thumb', 'hud-video', 'hud-embed', 'hud-figure',
]);
function narrowClasses(root: Element) {
    root.querySelectorAll('[class]').forEach((el) => {
        const kept = (el.getAttribute('class') ?? '')
            .split(/\s+/)
            .filter((c) => ALLOWED_CLASSES.has(c));
        if (kept.length)
            el.setAttribute('class', kept.join(' '));
        else
            el.removeAttribute('class');
    });
}
export function sanitisePanelHtml(html: string): string {
    const doc = new DOMParser().parseFromString(DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
            'div', 'span', 'p', 'ul', 'ol', 'li', 'img', 'b', 'strong', 'em', 'i',
            'br', 'small', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'code', 'pre',
            'video', 'source', 'iframe',
        ],
        ALLOWED_ATTR: [
            'class', 'src', 'alt', 'style',
            'controls', 'poster', 'loop', 'muted', 'playsinline', 'preload',
            'width', 'height', 'allow', 'allowfullscreen', 'referrerpolicy',
            'type', 'title',
        ],
        ADD_URI_SAFE_ATTR: [
            'controls', 'loop', 'muted', 'playsinline', 'preload', 'width',
            'height', 'allow', 'allowfullscreen', 'referrerpolicy', 'type',
        ],
        ALLOWED_URI_REGEXP: /^(?:data:(?:image|video|audio)\/|file:\/\/|https?:\/\/|\/)/i,
    }), 'text/html');
    doc.body.querySelectorAll('[style]').forEach((el) => {
        const style = el.getAttribute('style') ?? '';
        const v = /--v:\s*([\d.]+)/.exec(style);
        if (v)
            el.setAttribute('style', `--v:${v[1]}`);
        else
            el.removeAttribute('style');
    });
    narrowClasses(doc.body);
    rewriteMedia(doc.body);
    rewriteEmbeds(doc.body);
    hardenMedia(doc.body);
    return doc.body.innerHTML;
}
