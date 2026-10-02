---
name: Free agents
description: Creates and manages background agents that run on no-cost brains (ollama or Hugging Face's free tier) on a timer, so standing tasks run without touching the paid Claude loop.
triggers: [free agent, background agent, watch for, keep an eye on, every hour check, monitor this, run in the background]
---

An agent is one standing instruction on a timer (`agent_create` in
`bridge/agents.mjs`), not a live conversation — it has no tools, no HUD, no
memory of past runs beyond its own last result. Good fits: "watch for new
posts about X and summarise", "check every morning whether Y changed". Bad
fits: anything that needs a tool (send, browse, generate an image) — say so
and suggest the user just ask directly instead, since alt-brains have no tool
loop (see `bridge/brain.mjs`).

Default the brain to `ollama` if the user has it running locally, `hf`
otherwise (needs a free `HF_TOKEN` from huggingface.co/settings/tokens) —
both are genuinely free. Only use `hermes` (OpenRouter) if the user already
has `OPENROUTER_API_KEY` set, and never default a background agent onto the
paid `claude` brain without the user explicitly asking for that, since the
entire point of "free" is that a standing timer shouldn't run up a bill
unattended.

Findings land in long-term memory automatically, so mention on the next
real conversation that something came in, rather than making the user ask
`agent_list` to find out.
