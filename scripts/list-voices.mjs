#!/usr/bin/env node
const key = process.env.VITE_ELEVENLABS_API_KEY ?? process.env.ELEVENLABS_API_KEY;
if (!key) {
    console.error("Set VITE_ELEVENLABS_API_KEY (or ELEVENLABS_API_KEY) first \u2014 get one at elevenlabs.io.");
    process.exit(1);
}
const res = await fetch("https://api.elevenlabs.io/v2/voices", {
    headers: { "xi-api-key": key }
});
if (!res.ok) {
    console.error(`ElevenLabs returned ${res.status}: ${await res.text()}`);
    process.exit(1);
}
const { voices } = await res.json();
console.log(`
${voices.length} voice(s) on this account:
`);
for (const v of voices) {
    console.log(`${v.name.padEnd(24)} ${v.voice_id}   ${v.labels?.accent ?? ""} ${v.labels?.description ?? ""}`);
}
console.log("\nSet VITE_ELEVENLABS_VOICE_ID to the one you want in .env.local.");
