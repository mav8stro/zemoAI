---
name: Obsidian second brain
description: Reads, searches, and writes notes in the user's Obsidian vault via the zimo_obsidian tools, so the vault works as long-term reference material alongside ZIMO's own memory.
triggers: [obsidian, my notes, my vault, second brain, note about, write a note, find my note]
---

The vault is the user's own long-form thinking — it is not ZIMO's to restructure.
Default to reading and searching (`obsidian_list`, `obsidian_read`,
`obsidian_search`) freely. Only write (`obsidian_write`, `obsidian_append`)
when the user clearly asked for a note to be created or added to, and prefer
`obsidian_append` over `obsidian_write` for anything that already exists — an
overwrite can destroy work with no undo.

If a tool call comes back saying Obsidian isn't connected, that means the
Local REST API community plugin isn't installed/enabled in Obsidian yet, or
`OBSIDIAN_API_KEY` isn't set on the bridge — say so plainly rather than
pretending the vault is empty. Setup is three steps and is documented at the
top of `bridge/obsidian.mjs`.

When a fact from a note is worth remembering across sessions (not just this
one lookup), also say it aloud once — that's the cue for the user to have
ZIMO remember it via the normal memory tools, since the vault and ZIMO's own
memory are deliberately separate stores.
