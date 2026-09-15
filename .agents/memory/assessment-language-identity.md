---
name: Assessment language identity
description: Language variants, portable translations, and questionnaire-specific scoring constraints.
---

Language variants must share one canonical assessment model and answer identity; supplied custom translations take precedence over machine translation.

**Why:** The requested Personal AI Skills assessment uses reviewed Spanish text and one population regardless of language. Separate models would split benchmarks and cohorts.

**How to apply:** Keep translations display-only, preserve canonical answer values and references across language changes, and include optional authored translations in portable model files. Machine translations use Foundry without silently replacing custom text.

Apply questionnaire-specific averaging only to explicitly configured models.

**Why:** This questionnaire averages scored, applicable answers, not dimension averages. Context questions and not-applicable answers must not lower the result, while existing assessments retain their original scoring.

**How to apply:** Preserve these semantics through export/import and renamed models, including the safety-training recommendation independent of the resulting track.