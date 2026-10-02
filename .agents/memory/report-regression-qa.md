---
name: Report regression QA
description: Role-specific report verification and workspace/PDF extraction pitfalls
---

Use a regular assessment owner, not an administrator, to verify personal-skills report refreshes.

**Why:** Administrator responses retain scoring configuration that regular-owner responses redact. Admin-only verification can miss a personal-skills report reverting to organizational/500-point semantics.

**How to apply:** Preserve the owner's real permission path with isolated disposable development fixtures. Treat the score-method flag as respondent-safe display semantics, but never expose remediation answer rules with it.

Live regeneration checks should make both summary caches stale before regeneration, not merely regenerate an already-correct summary.

**Why:** A no-op refresh can appear successful if cached text already contains the expected title and score.

**How to apply:** Change only the disposable model's cache entries and use the actual configured Foundry provider. Do not mock summary responses for the live acceptance check.

Workspace Chromium and Playwright's managed browser/video binaries are separate prerequisites. A usable system Chromium does not imply Playwright's video encoder is installed.

**Why:** The browser could launch using the workspace binary but page creation still failed when video recording required an absent encoder.

**How to apply:** Prefer traces and screenshots for this development check; do not require video just to verify report content.

Exclude extractor-generated page markers when comparing an entire PDF summary across page boundaries.

**Why:** The PDF extractor appends synthetic page labels to individual page text as well as combined text. A correct two-page summary can fail a contiguous-text assertion.

**How to apply:** Disable synthetic page joiners during extraction; retain assertions against every word of the refreshed summary instead of weakening them to title-only checks.