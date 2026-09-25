---
name: Avenir font files are misnamed
description: The bundled Avenir Next LT Pro files don't contain the weights/styles their filenames claim; affects the app's @font-face and any rendered course graphics.
---
The Avenir Next LT Pro font files in the repo are misnamed: the face embedded in a file often differs from the weight/style in its filename (for example, a "medium" file is actually an italic face). The app's `@font-face` rules map files by filename, so some Tailwind weights render the wrong face (e.g. `font-medium` can come out italic).

**Why:** Found while rendering annual-training course graphics; text came out in the wrong weight/italic until fonts were mapped by their embedded family/subfamily names. The app-wide CSS issue was reported to the user, not fixed (out of scope then).

**How to apply:** When rendering anything with these fonts (Playwright/HTML graphics, PDFs), read each file's embedded name table and map by actual weight/style; only use weights that truly exist (300, 400, 400 italic, 600, 700, 700 italic). If asked to fix app typography, fix the `@font-face` mapping by embedded face, and verify visually.
