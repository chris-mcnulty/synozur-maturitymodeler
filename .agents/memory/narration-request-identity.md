---
name: Narration request identity
description: Why asynchronous browser TTS results need request identity and save lifecycle protection.
---

Treat every browser-started narration generation as a versioned request. Apply its result only while that exact request is still the current pending operation for the originating slide.

**Why:** Matching only slide ID, script, and voice is insufficient. An editor can switch modes, upload a recording, start a newer generation, or close the editor while an older Azure response is still in flight. Without request identity and lifecycle protection, the older response can overwrite the newer choice or leave a permanently pending saved state.

**How to apply:** Any future narration-generation path must invalidate the active request when the editor changes narration mode, script, approval, voice, or audio. Do not allow browser-local pending generation to be saved or closed as if it were a recoverable server queue.