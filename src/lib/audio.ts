let stream: MediaStream | null = null;
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let buf: Uint8Array | null = null;
export async function getMic(): Promise<MediaStream> {
    if (stream)
        return stream;
    stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
        },
    });
    return stream;
}
export async function startAnalyser(): Promise<void> {
    if (analyser)
        return;
    const s = await getMic();
    ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(s);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.75;
    src.connect(analyser);
    buf = new Uint8Array(analyser.frequencyBinCount);
}
export function micLevel(): number {
    if (!analyser || !buf)
        return 0;
    analyser.getByteFrequencyData(buf as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 4; i < buf.length; i++)
        sum += buf[i];
    const avg = sum / (buf.length - 4) / 255;
    return Math.min(1, avg * 3.2);
}
export function attachOutputAnalyser(el: HTMLAudioElement): () => number {
    const c = new AudioContext();
    const src = c.createMediaElementSource(el);
    const a = c.createAnalyser();
    a.fftSize = 512;
    a.smoothingTimeConstant = 0.7;
    src.connect(a);
    a.connect(c.destination);
    const b = new Uint8Array(a.frequencyBinCount);
    return () => {
        a.getByteFrequencyData(b as Uint8Array<ArrayBuffer>);
        let sum = 0;
        for (let i = 2; i < b.length; i++)
            sum += b[i];
        return Math.min(1, sum / (b.length - 2) / 255 * 3);
    };
}
