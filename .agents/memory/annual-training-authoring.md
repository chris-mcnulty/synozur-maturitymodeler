---
name: Annual-training course authoring rules
description: Content decisions for the Synozur annual-training courses that later courses in the series should follow (practice vs final questions, photos, alt text, round-trip checks).
---
- Practice questions must test a different decision than the retained final questions, even when the prompt reuses the same scenario (e.g. ask who assesses or what to tell the person, not the final question's stem). Practice intros must stop at the decision point; an intro that narrates the outcome gives away the final answer.
  **Why:** Code review flagged practice that repeated final-question stems and answers as giving the graded check away.
- Each course needs its own photos; don't reuse another course's stock photo.
  **Why:** The shared brief requires distinct topic imagery per course.
- Write photo alt text only after the actual photo is chosen and viewed.
  **Why:** Alt text drafted from a planned description ended up describing a whiteboard that wasn't in the photo.
- Graphics that depend on unapproved policy or unverified contacts carry a visible "PROPOSED — PENDING APPROVAL" badge matching the lesson's pending markers, and an approval item to re-render after sign-off.
  **Why:** Review flagged a diagram saying "approved policy" while the gift rules were still a release blocker.
- A round-trip check must normalize asset references: exports key assets by original object path, and the paths change on import, so compare content with paths replaced by asset-data hashes.

**How to apply:** When authoring or reviewing the next course in the series, check these before building and QA.
