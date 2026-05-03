# Script A — Public Assessment Flow

**Purpose:** Verify a screen-reader user can discover an assessment, log in (or
proceed anonymously), answer every supported question type, navigate forward
and back, and submit.

**Run on:** NVDA + Firefox, JAWS + Chrome, VoiceOver + Safari.

**Estimated time:** 25–35 minutes per reader.

**Pre-requisites:**
- A test account with at least one published assessment that contains every
  question type: `multiple_choice`, `multi_select`, `true_false`, `numeric`,
  and `text`.
- Browser zoom at 100%, default OS contrast (run high-contrast pass separately).

WCAG 2.1 AA criteria covered: **1.3.1, 1.3.2, 2.1.1, 2.4.3, 2.4.6, 2.4.7,
3.2.2, 3.3.1, 3.3.2, 4.1.2, 4.1.3**.

---

## A.1 — Landing page & navigation

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 1 | Load `/`. Press `H` until you reach the page heading. | "Heading level 1, _<page title>_". | ☐ |
| 2 | Press `D` (NVDA) / `R` (JAWS) / `VO+U → Landmarks` to walk landmarks. | "banner", "navigation", "main", "contentinfo" — each present exactly once. | ☐ |
| 3 | Tab through the header. | Logo link reads its accessible name (not "image"); each nav link reads as "link, _<name>_"; the theme toggle reads as a button with state. | ☐ |
| 4 | Activate the link to start an assessment. | Focus moves to the assessment page; first focused element is announced (page heading or skip-link). | ☐ |

## A.2 — Progress bar

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 5 | With the first question on screen, press `Tab` until the progress bar receives focus, or use elements list to find it. | "Assessment progress: question 1 of N, X percent complete, progress bar". | ☐ |
| 6 | Answer the first question and advance to question 2. | Progress bar live region (or refocus) reflects "question 2 of N". (If using `aria-valuenow` only, confirm browse-mode rereads the new value.) | ☐ |

## A.3 — Multiple choice question

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 7 | Tab to the radio group. | Group label is read = the question text; first option is announced as "radio button, not checked, _<label>_, 1 of N". | ☐ |
| 8 | Use Down/Up arrows to traverse options. | Each option reads label + state; selection moves with arrows (no Space required). | ☐ |
| 9 | Tab to **Next** button and activate. | Focus moves to next question; new question's `<h2>` is announced. | ☐ |

## A.4 — Multi-select question

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 10 | Tab to first checkbox. | "Checkbox, not checked, _<label>_". The "Select all that apply" hint is reachable as text **before** the first checkbox. | ☐ |
| 11 | Toggle two checkboxes with Space. | Each toggle reads the new state. The polite live region announces "_2_ options selected" without stealing focus. | ☐ |

## A.5 — True / false question

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 12 | Arrow through the two radios. | Group label = question; "True" and "False" each announced with state. | ☐ |

## A.6 — Numeric question (validation)

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 13 | Tab to numeric input. | Label = question; helper text "Enter a value between MIN and MAX UNIT" is part of the field's accessible description. | ☐ |
| 14 | Type a value below `minValue` and Tab away. | Error "Value must be at least MIN" is announced via `role="alert"` without focus moving; the input is announced as "invalid entry". | ☐ |
| 15 | Correct the value. | Error region is cleared; field no longer announces "invalid". | ☐ |

## A.7 — Text question

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 16 | Tab to textarea. | "Edit, multi-line, _<question>_". Placeholder is **not** read as the label. | ☐ |
| 17 | Type 10 characters. | Character counter ("10 characters") is reachable as static text and does not interrupt typing. | ☐ |

## A.8 — Submit & completion

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 18 | Reach final question, press **Submit**. | Button reads "Submit, button"; activation triggers a confirmation dialog or a route change. | ☐ |
| 19 | If a dialog appears: focus moves into it; first reader-announced item is the dialog title; Esc and the close button both work. | Dialog has `role="dialog"` and `aria-labelledby`. | ☐ |
| 20 | After submit, results page loads. | Page `<h1>` is announced; user lands inside `main` landmark. | ☐ |

---

## Cross-cutting checks (run once per reader after A.8)

- [ ] **Skip link** works: Tab from address bar reveals "Skip to main content" first; activating it moves focus to `<main>`.
- [ ] **Focus visibility:** every focused control shows the focus ring (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`).
- [ ] **No keyboard traps:** Shift+Tab from any control reverses cleanly.
- [ ] **Toasts** ("Answer saved" etc.) are announced via the polite live region exactly once.
- [ ] **Page titles** change on navigation (`<title>` updates per route).
