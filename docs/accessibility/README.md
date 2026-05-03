# Screen Reader Accessibility Verification

This folder contains the **manual** screen-reader regression scripts referenced
by Task #27 (_Verify accessibility with real screen readers_). Programmatic
accessibility (ARIA labels, focus rings, the high-contrast theme, the
`role="progressbar"` on the assessment progress meter, and the form
`aria-describedby` / `role="alert"` wiring) was added in earlier tasks; what
remains is human-driven verification with real assistive technology.

## Important: This is a manual task

The Replit sandbox cannot drive native screen readers (NVDA, JAWS, or
VoiceOver). The agent therefore cannot _run_ this regression — it can only
produce the scripts and the bug-tracking template that a human tester uses.
Running the scripts requires:

- A Windows machine with **NVDA 2024.x** + **Firefox latest**
- A Windows machine with **JAWS 2024+** + **Chrome latest**
- A macOS machine with **VoiceOver** (built-in) + **Safari latest**

Each script is self-contained: the tester opens the app, follows the steps
verbatim, and records what the screen reader announces. Findings get filed in
`findings.md` using the template at the bottom of this file.

## Scripts

| Flow | File |
|---|---|
| Public assessment flow (taking an assessment end-to-end) | [`scripts/assessment-flow.md`](./scripts/assessment-flow.md) |
| Profile & results (history, charts, results page) | [`scripts/profile-results-flow.md`](./scripts/profile-results-flow.md) |
| Admin question editor | [`scripts/admin-question-editor-flow.md`](./scripts/admin-question-editor-flow.md) |

Each script includes:

1. The exact sequence of keystrokes (Tab / Shift+Tab / Arrow keys / Enter /
   Space / screen-reader-specific quick keys).
2. The **expected** announcement at every stop.
3. A pass/fail checkbox column the tester fills in.
4. WCAG 2.1 AA success criteria each step covers (so failures map cleanly to
   the checklist in `design_guidelines.md`).

## Reader-specific quick reference

| Action | NVDA | JAWS | VoiceOver |
|---|---|---|---|
| Start / stop reader | `Ctrl+Alt+N` / `Insert+Q` | already running / `Insert+F4` | `Cmd+F5` |
| Next form field | `F` | `F` | `VO+Cmd+J` |
| Next heading | `H` | `H` | `VO+Cmd+H` |
| Next landmark | `D` | `R` | `VO+U` → Landmarks |
| Next button | `B` | `B` | `VO+Cmd+J` (filter Buttons) |
| Read current line | `Insert+Up` | `Insert+Up` | `VO+L` |
| Open elements list | `Insert+F7` | `Insert+F6` (Headings) / `Insert+F5` (Forms) | `VO+U` |
| Toggle forms/focus mode | `Insert+Space` | auto / `Insert+Z` | n/a |

> NVDA + Firefox and JAWS + Chrome must be tested in **browse mode**; the
> scripts call out where forms-mode is required.

## Filing findings

All issues go in [`findings.md`](./findings.md). Use one entry per issue, even
if a single page produces several. Each entry must include the
screen-reader transcript snippet so devs can reproduce. Severities:

- **Blocker** — flow cannot be completed by a screen-reader user, or critical
  information is unannounced. Must be fixed before sign-off.
- **Major** — flow is completable but with significant friction (e.g., wrong
  role, missing label, focus is lost).
- **Minor** — verbosity, ordering, or polish issue.
- **Deferred** — accepted limitation; requires written rationale.

Sign-off requires that **all Blocker findings are resolved or explicitly
deferred with rationale**. See `findings.md` for the entry template.
