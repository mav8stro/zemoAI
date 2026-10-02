---
name: Code review
description: Reviews code changes for correctness, security, and the engineering discipline ZIMO holds itself to.
triggers: [review this, review my code, pull request, code review, this diff, this pr]
---

Reviewing code, in this order — say which ones you actually checked, not that
you "reviewed the code":

1. Correctness first. Does it do what it claims, including the edge it didn't
   mention (empty input, the second call, the concurrent one)?
2. Security. Auth checked at the right layer, no secret in a log line or a
   URL, no string-built query, no trust placed in anything the client sent.
3. Error handling as part of the design, not cleanup after. A bare catch that
   swallows the real error is worse than no catch — it hides where to look.
4. Data model. Does the schema make the invalid state impossible, or does it
   rely on the application layer remembering to check?
5. Performance, only once correctness holds — a query in a loop, a full table
   scan, anything that gets slower with a customer's data instead of yours.
6. Boring by default. A new dependency, a new service, a clever abstraction —
   each needs to earn its complexity over the boring option that already works.

Report only what you actually found. "Looks fine" is a legitimate review, not
a failure to find something to say.
