# J.A.R.V.I.S.

A browser voice assistant with an Iron Man holographic interface. Say
**"Hey Zimo"**, he wakes, listens, and does real things through your tools —
searches the web, generates images, drives your phone, reads your mail. The face
is a web page (React + Vite + Three.js + custom GLSL). The brain is Claude Code,
run headless as a library.

**The only subscription you need is Claude Code.** No API keys, no OpenAI
account, no cloud bill — the brain runs on your existing Claude Code login, and
the heavy work (the model itself) runs on Anthropic's servers, so even a low-end
laptop only has to draw the interface. **ElevenLabs is an optional add-on** that
gives ZIMO a much better voice and sharper hearing; without it he speaks and
listens through the browser's own speech, and everything still works.

---

## Requirements

**In one line:** a Claude Code subscription, plus two free things every computer
can have — Node.js and Chrome. That's the whole list.

- **Claude Code, installed and logged in** — this is the only account you need.
  Install it with the official method — `npm install -g @anthropic-ai/claude-code`,
  or the platform installer at <https://docs.claude.com/en/docs/claude-code> —
  then run `claude` once and complete login. The bridge reuses that login. **No
  API key**, and usage is billed to your existing Claude account.
- **Node.js 20 or newer** — free, one installer from <https://nodejs.org>. This
  is a Node web app, so it is the one unavoidable tool.
- **Google Chrome or Microsoft Edge**, in a **real browser window** — not an
  embedded preview pane. Preview panes (including the one inside editors and
  Claude Code) block microphone access, so the page loads and looks right but
  never hears you. ZIMO also needs WebGL, which these browsers provide.
- **Optional: an ElevenLabs API key** — a good add-on, not a requirement. It
  gives a better voice and sharper transcription; the free tier is plenty for a
  demo. Without it, everything runs on the browser's own speech.

Run `npm run setup` after cloning and it checks all of this for you, in plain
language.

---

## Quick start

First, install, then start it:

```bash
npm install
npm start          # runs the brain and the face together
```

Then open the URL it prints (http://localhost:5173) in **Chrome**, click **INITIALISE**, and say **“Hey Zimo”**.

Prefer two terminals? Run them separately instead:

```bash
npm install
```

Terminal 1 — the brain:

```bash
npm run bridge
```

Terminal 2 — the face:

```bash
npm run dev
```

Then open the app in a **real Chrome or Edge window**:

```bash
open http://localhost:5173
```

Click **INITIALISE**, allow the microphone when asked, and say **"Hey Zimo"**.

> It has to be a real browser window. Embedded preview panes block the
> microphone, so ZIMO will look perfectly alive and simply never respond.

---

## How it works

ZIMO is two processes. The browser is the face and the voice; the bridge is
the brain and the hands.

```
  ┌─ browser (the face) ───────────────┐        ┌─ bridge (the brain) ─────────────┐
  │  "Hey Zimo" wake word            │        │  Node · bridge/server.mjs        │
  │  local VAD  →  speech to text      │   ws   │  Claude Agent SDK                │
  │  reactor UI (Three.js + GLSL)      │◄─────► │   = Claude Code, headless        │
  │  text to speech                    │  8787  │  spawns your MCP servers         │
  │  heads-up display                  │        │  permission gate (decideTool)    │
  └────────────────────────────────────┘        └──────────────────────────────────┘
```

Everything you see and hear happens in the browser. The bridge is a single Node
process (`bridge/server.mjs`) that runs the **Claude Agent SDK**
(`@anthropic-ai/claude-agent-sdk`) — this spawns the real `claude` CLI as a child
process, so **the brain literally is Claude Code, headless.** They talk over a
WebSocket (plus a few HTTP endpoints) on `ws://localhost:8787`.

**Why a bridge at all?** A browser tab cannot spawn the local stdio MCP servers —
`higgsfield`, `elevenlabs`, `android`, `playwright`, `exa`, `serper`, and the
rest. The bridge can. And because it is the Agent SDK, it authenticates off your
existing Claude Code login: no API key, billed to that same Claude account.

**The model.** `claude-opus-5` at effort `medium` by default. Override with the
`ZIMO_MODEL` and `ZIMO_EFFORT` environment variables. On startup the bridge
prints its choice, e.g. `[zimo] model claude-opus-5 · effort medium`.

### The voice pipeline

The loop is designed so that nothing silently dies and barge-in feels natural.

- **Detection is local.** An energy-based voice-activity detector
  (`src/lib/vad.ts`) decides when you are speaking. It is instant, cannot quietly
  fail, and is what makes **barge-in** work — speak while ZIMO is talking and he
  stops.
- **Transcription has two tiers, chosen automatically at boot.** The browser asks
  the bridge `/health` and picks the best available:
  - **ElevenLabs key present** → ElevenLabs Scribe, via the bridge `/stt` endpoint.
  - **Nothing configured** → the browser's own `SpeechRecognition` (Chrome/Edge),
    guarded by a heartbeat so it recovers when Chrome throttles it.
- **Speaking** uses the **ElevenLabs voice when a key is present**, and the
  browser's `speechSynthesis` otherwise. If a cloud call fails it falls back to
  the browser voice, and if the OS voice itself is broken it latches over to the
  cloud voice.

So it works with no keys and auto-upgrades when a key appears — there is no flag
to set. Capability detection lives in `src/lib/capabilities.ts`, which probes the
bridge's `GET /health` (returning `{ ok, tts, stt }`, both tracking the
ElevenLabs key) once at boot and picks the engines.

---

## What ZIMO can do

Beyond answering, ZIMO reaches every MCP server in your Claude Code
configuration, and can drive his own interface.

### Your tools

Every server in your `~/.claude.json` is handed to the SDK explicitly. Depending
on what you have installed, that is roughly:

- **Web & search** — `exa`, `serper`, `serpapi`
- **Images & video** — `higgsfield`, `openrouter-image`, `palmier-pro`
- **Voice** — `elevenlabs`
- **Your phone** — `android`
- **The browser** — `playwright`

A few things you can say:

- *"What's happening in AI this week?"*
- *"Generate an image of the Mark VII suit."*
- *"Take a screenshot of my phone."*
- *"Open my GitHub notifications."*

> **Note on account connectors.** Servers you added through your **claude.ai
> account** are not stored on disk, so the bridge cannot see them — it works from
> the servers in `~/.claude.json` (about 14), not the claude.ai ones.

### ZIMO controls the interface

He drives the UI through MCP tools the bridge exposes:

- `ui_theme` — accent, background, per-phase colours
- `ui_reactor` — colour, scale, intensity, spin, and style (`ring` | `sphere` | `wire`), visibility
- `ui_orbit` — put images in orbit around the reactor
- `ui_chrome` — show or hide rails, transcript, badges
- `ui_effect` — `glitch` | `pulse` | `scan` | `shake` | `flash`
- `ui_screen` — clear
- `ui_reset` — back to defaults

So *"make it red, hide the systems list, put that render in orbit"* is a spoken
command.

### The heads-up display

ZIMO authors panels with a `display` tool against a fixed `.hud-*` design
system. The browser sanitises the markup (DOMPurify, a class allowlist and a
strict CSP) before rendering. Rich media works — images, `<video>`, and
YouTube/Vimeo embeds. Remote images and video are fetched **server-side** through
the bridge (`/img` and `/media`, both SSRF-guarded), so hotlink-blocked news
thumbnails still appear and the page never beacons your IP to a host the model
chose.

---

## A home, a memory, and a brain you can swap

Beyond the voice loop, the bridge gives ZIMO four things a chatbot doesn't have:

- **A home.** Everything persistent — who you are, what he remembers, which
  brain is active — lives under `~/.zimo` on this machine, not a cloud
  account. `npm run install-service` registers the bridge as a background
  service (launchd on macOS, systemd on Linux) so it's always up, the way a
  home assistant is, without a terminal window to babysit.
- **Long-term memory.** A Honcho-shaped local memory layer — `remember`,
  `recall`, `forget` — so a preference or a fact only has to be said once.
  Swappable later for hosted Honcho without touching anything above
  `bridge/memory.mjs`.
- **A profile.** Run `npm run onboard` once for a five-question interview
  (name, role, what you're building, your goals, standing preferences), or
  just talk — ZIMO saves what he learns as it comes up, so he isn't starting
  from zero every session.
- **Skills.** Drop a folder with a `SKILL.md` into `/skills` and it loads
  automatically when relevant — no registration, no restart of anything but
  the bridge. Three ship as examples: code review, a daily briefing, and
  project-specific support for E-Patient.

### Swapping the brain

Claude, via the Agent SDK, is the default and the only brain with the full
tool loop (HUD, MCP servers, the browser). Say or type **"switch brain to
hermes"** or **"switch brain to ollama"** and the very next turn uses it — no
restart. Hermes 4 runs through OpenRouter (`OPENROUTER_API_KEY`); Ollama runs
whatever you've pulled, fully offline (`OLLAMA_MODEL`). Neither alt-brain gets
the tool loop — that's the Agent SDK's own limitation, not this bridge's — so
switch back with "switch brain to claude" for anything that needs to touch a
tool. See `bridge/brain.mjs` for the honest version of this trade-off.

### Voices

ElevenLabs is already wired for output; `npm run list-voices` prints every
voice on your account and its id so you can pick one without guessing —
copy the id into `VITE_ELEVENLABS_VOICE_ID`.

<br/>

## Controls

| Key / phrase | Does |
|---|---|
| **"Hey Zimo"** | Wake him |
| **Space** | Talk without the wake word |
| Just speak | Interrupt him mid-sentence (barge-in) |
| **V** | Cycle the browser voice |
| **Escape** | Stand down |
| **D** | Live diagnostics panel |
| **T** | One-line audio self-test |

---

## The boot sequence

Power-up plays a four-beat Iron Man start-up (`src/ui/Boot.tsx`): an
"INITIATING SYSTEM" status bar with a segmented progress bar and boot log; then
concentric reticle rings resolving into "J.A.R.V.I.S"; then a suit schematic;
then the triangular arc reactor lighting up — with a start-up sound under it
(`public/audio/boot-music.mp3`).

---

## Configuration

Everything is optional in bridge mode. Frontend settings live in `.env.local`
(copy `.env.example`); bridge settings are environment variables.

### Bridge

| Variable | Default | Effect |
|---|---|---|
| `ZIMO_BRIDGE_PORT` | `8787` | Port for the WebSocket + HTTP endpoints |
| `ZIMO_MODEL` | `claude-opus-5` | Model to run |
| `ZIMO_EFFORT` | `medium` | Reasoning effort |
| `ZIMO_ALLOW_WRITES` | off | `1` allows effectful tools (see below) |
| `ZIMO_ALLOWED_ORIGINS` | local dev | Extra WebSocket origins to accept |
| `ZIMO_ALLOW_NO_ORIGIN` | off | Accept connections with no `Origin` header |
| `ZIMO_FILE_ROOTS` | — | Roots the `/file` endpoint may serve from |
| `ZIMO_VOICE_ID` | — | ElevenLabs voice id |
| `ELEVENLABS_API_KEY` | — | Optional; enables the ElevenLabs voice + Scribe |

### Frontend (`.env.local`)

| Variable | Effect |
|---|---|
| `VITE_BACKEND` | `bridge` (default) or `direct` |
| `VITE_BRIDGE_URL` | Where to reach the bridge |
| `VITE_TTS_ENGINE` | `system` or `kokoro` |
| `VITE_KOKORO_VOICE` | Voice for the Kokoro engine |
| `VITE_USE_ELEVENLABS` | Force the ElevenLabs voice on |
| `VITE_ANTHROPIC_API_KEY` | Direct mode only |

### Adding an ElevenLabs key

You do not have to touch a flag. Either:

- Set `ELEVENLABS_API_KEY` on the bridge before starting it, **or**
- Add the key to your `elevenlabs` MCP server's env in `~/.claude.json` — the
  bridge reads it from there too.

Either way, `/health` starts reporting the capability, the browser picks it up on
the next boot, and both the voice and transcription upgrade automatically.

---

## Enabling actions

The tool gate starts **read-only**. Search, generation and lookups run freely;
anything effectful — send, tap, delete, install, pay — is denied. Voice is a poor
interface for a confirmation dialog, so the decision is made ahead of time in
`decideTool()` in `bridge/server.mjs`, not at the moment of use. The bridge sets
`settingSources: []`, which makes its own gate the only authority — filesystem
settings and any global `bypassPermissions` cannot override it.

To allow effectful tools (phone, browser driving, sending), run the bridge this
way instead:

```bash
npm run bridge:writes
```

> Read `decideTool()` before you do. *"Hey Zimo, clean up my downloads folder"*
> means something rather different with writes enabled.

---

## Troubleshooting

**I can't hear him, or he can't hear me.** Press **D** for the diagnostics panel
— it states plainly whether he is hearing you and whether he is producing sound.
Press **T** for a one-line audio self-test.

**No voice at all.** You must be in **Chrome or Edge**, in a **real browser
window** (not an embedded preview), and you must have **allowed the microphone**.

**Bridge not reachable.** Check that `npm run bridge` is still running in its
terminal, and that nothing else is holding port `8787`.

**He hears you (the diagnostics panel shows transcripts) but never actually
answers.** This is almost always the connection, not the ears. Check, in
order:

1. **`ZIMO_PASSWORD` vs `VITE_ZIMO_PASSWORD`.** Every socket connection and
   HTTP request is gated on this passphrase (default `4564` on both sides).
   If you set one and not the other — e.g. `ZIMO_PASSWORD` exported in the
   terminal you ran `npm run bridge` from, but no matching
   `VITE_ZIMO_PASSWORD` in `.env.local` — the bridge silently refuses every
   request from the page. This is the single most common cause of "he hears
   me but does nothing."
2. **Two different bridges.** If you have `npm run bridge` running in one
   terminal and separately ran `npm start` (which also starts a bridge), you
   may have two processes fighting over port `8787`; whichever lost the race
   is not the one the page is actually talking to. Stop everything and start
   one.
3. **`ZIMO_ALLOWED_ORIGINS`.** Only matters if you're loading the page from
   somewhere other than `localhost:5173` — the bridge rejects unknown
   origins outright, and does so before your command ever reaches Claude.
4. Watch the **bridge's own terminal** while you speak. `[zimo] tool ... ->
   allow/deny` lines mean the command arrived and a real turn ran — if you
   see nothing there at all, the browser never reached the bridge and this
   is (1) or (2), not a voice-recognition problem.

---

## What's new in this build

Four additions on top of the base project, each landing as a normal skill or
tool set rather than a special case — see `bridge/skills.mjs` for how a
`SKILL.md` gets picked up automatically.

- **Obsidian as a second brain** (`bridge/obsidian.mjs`,
  `skills/obsidian-second-brain/`) — read, search, and (with writes enabled)
  create or append to notes in your vault, via the **Local REST API**
  community plugin. Needs three things set up in Obsidian itself first; the
  top of `bridge/obsidian.mjs` walks through it. Without `OBSIDIAN_API_KEY`
  set, the tools explain what's missing instead of pretending the vault is
  empty.
- **Free agents** (`bridge/agents.mjs`, `skills/free-agents/`) — standing
  background tasks on a timer ("every hour, check X"), run on a **no-cost**
  brain (`ollama` locally, or Hugging Face's free tier) so a background job
  never touches your Anthropic bill or competes with the live conversation
  for anything. They have no tools and no HUD — see the honest limitation
  note in `bridge/brain.mjs` — but findings land in long-term memory
  automatically, so the next real conversation already knows what came up.
  Say *"watch for X and tell me"* to create one; *"pause the X agent"* to
  stop it.
- **Self cooling, read honestly** (`bridge/cooling.mjs`,
  `skills/self-cooling/`) — no software can spin a fan; that's firmware. What
  this actually does: reports the best thermal signal the OS exposes
  (real sensors on macOS/Linux where available, CPU load as an honest
  fallback everywhere else), and can throttle ZIMO's *own* background load
  — mainly free agents — when things are running warm.
- **A laptop as home, already true** — this was already the whole design (see
  *A home, a memory, and a brain you can swap* above): everything persistent
  lives under `~/.zimo` on the machine you run the bridge on, nothing in the
  cloud. Nothing to add here except pointing at it — run
  `npm run install-service` once and this laptop *is* home, running in the
  background, the way it's meant to.
- **A `.exe` (and `.app`, and `.AppImage`)** — `npm run build:exe` (Windows),
  `npm run build:app` (macOS), or `npm run build:appimage` (Linux) wraps the
  built face and the bridge together with Electron and packages one
  installer, via `electron-builder`. Install `electron` and `electron-builder`
  first (`npm install`, now that they're in `devDependencies`). This removes
  the two-terminal, open-Chrome-yourself steps — it does **not** remove the
  one real requirement in this README: Claude Code still has to be installed
  and logged in on whatever machine the `.exe` runs on, because that login is
  the brain. `npm run electron:dev` runs the same shell against the Vite dev
  server while you're working on it.

---

## Security

All of this lives in `bridge/server.mjs`:

- The WebSocket accepts only local dev origins (add more with
  `ZIMO_ALLOWED_ORIGINS`).
- `/file`, `/img` and `/media` validate the scheme, confine to allowed roots,
  resolve the real path, and refuse private and loopback addresses (SSRF guard).
- The tool gate (`decideTool`) is default-deny for effectful MCP tools.
- A strict CSP in `index.html`; model-authored panel HTML is sanitised.

---

## Credits & licence

Created and owned by **Muhammed Salman N**.

Licensed under the MIT License.

The boot sound and any tracks in `public/audio/` ship with the project for the
demo. If you go on to monetise something built on this, clearing the rights to
that audio is your responsibility.

---

## Open Dots (added)

`dots/` holds Open Dots, a self-hosted chat agent workspace (FastAPI server in `dots/server`, Next.js client in `dots/client`, optional Docker browser runtime in `dots/runtime`). It runs separately from the ZIMO face and bridge. See `dots/README.md` for setup.
