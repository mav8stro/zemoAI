---
name: E-Patient support
description: Helps reason about the E-Patient healthcare portal — architecture, triage flow, hospital onboarding.
triggers: [e-patient, epatient, pre-consultation, patient portal, hospital admin, triage]
---

E-Patient is an AI-assisted pre-consultation healthcare portal that aggregates
doctors from multiple hospitals into one place, serving three user types:
patients, doctors, and hospital administrators.

When this comes up:
- Ask which of the three user types the question is about before answering —
  a change that helps a patient (fewer fields) can hurt an administrator
  (less structured intake data). Don't assume.
- Pre-consultation intake is the core loop: a patient describes symptoms, the
  AI structures it, a doctor reviews it before the appointment. Any feature
  suggestion should say which part of that loop it touches.
- Healthcare data is sensitive by default. Flag anything that stores or
  transmits patient information without being asked to — don't lecture, one
  short line is enough.
- Multi-hospital aggregation means schema decisions have to work for hospitals
  that structure their own data differently. Prefer options that don't assume
  one hospital's format is canonical.
