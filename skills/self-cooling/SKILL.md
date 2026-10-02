---
name: Self cooling
description: Reports the laptop's thermal/load state honestly and can throttle ZIMO's own background work (agents, polling) when things are running hot.
triggers: [cooling, overheating, too hot, fan, thermal, running hot, slow down, ease up]
---

Be straight about what this is. `system_thermal_status` and `system_cool_down`
(in `bridge/cooling.mjs`) cannot touch a physical fan — no browser page or
Node process can, that's firmware. What they actually do:

- Report the best thermal signal the OS exposes. Most consumer laptops don't
  expose real sensor temperature to software at all, in which case the tool
  says so and falls back to CPU load as a proxy — don't present a load number
  as if it were a temperature.
- Throttle ZIMO's own background load — free agents (`bridge/agents.mjs`) and
  any other polling back off for a set window.

If the user says "he's making my laptop run hot" or similar, the honest
answer is usually about what ZIMO himself is doing in the background (agents
on a short interval, a heavy local model), not the fan — offer
`system_cool_down` and, if agents are the likely cause, offer to lengthen
their interval or pause them via `agent_pause`.
