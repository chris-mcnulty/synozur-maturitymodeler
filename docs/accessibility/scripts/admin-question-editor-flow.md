# Script C — Admin Question Editor Flow

**Purpose:** Verify a screen-reader user with admin/modeler privileges can
navigate the Admin sidebar, manage models, and create/edit/delete questions
including answer rows.

**Run on:** NVDA + Firefox, JAWS + Chrome, VoiceOver + Safari.

**Estimated time:** 25–35 minutes per reader.

**Pre-requisites:**
- An admin or tenant-modeler test account.
- At least one model with one dimension already created so the question editor
  has a parent context.

WCAG 2.1 AA criteria covered: **1.3.1, 1.4.1, 2.1.1, 2.1.2, 2.4.3, 2.4.6,
2.4.7, 3.2.2, 3.3.1, 3.3.3, 4.1.2, 4.1.3**.

---

## C.1 — Sidebar navigation

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 1 | Load `/admin`. | Page H1 announced; sidebar is reachable as a `complementary` or `navigation` landmark. | ☐ |
| 2 | Open the sidebar (mobile width) via the trigger. | Trigger button reads "Toggle sidebar, button, expanded/collapsed". | ☐ |
| 3 | Tab through sidebar items. | Each item is announced as a button or link with its label; the active item exposes selected state (e.g., `aria-current="page"` or "selected"). | ☐ |
| 4 | Activate **Models**. | Section heading is announced; focus lands inside the section. | ☐ |

## C.2 — Model list

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 5 | Walk the models table. | Table has a caption or `aria-label`; column headers ("Name", "Status", "Updated", "Actions") are announced for each cell when navigating with table-navigation keys (Ctrl+Alt+Arrow in NVDA, Ctrl+Alt+Arrow in JAWS, VO+Cmd+Arrow in VoiceOver). | ☐ |
| 6 | Find the row's actions kebab/dropdown. | Trigger reads "More actions, button"; menu items each readable; Esc closes; focus returns to trigger. | ☐ |

## C.3 — Open the question editor

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 7 | Activate **Edit questions** for a model. | Editor opens (dialog or routed page). If dialog: `role="dialog"` + `aria-labelledby`; focus moves inside; Esc closes. | ☐ |
| 8 | The question list is reachable. | Each row reads order, dimension, type, text. Drag handles, if present, expose keyboard alternatives (e.g., move-up/move-down buttons with labels). | ☐ |

## C.4 — Create a question

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 9 | Activate **Add question**. | Dialog opens; first focusable item is the **Question text** field. | ☐ |
| 10 | Submit empty form. | Validation errors fire via `role="alert"`; first invalid field receives focus or is referenced via `aria-describedby`. | ☐ |
| 11 | Choose a question Type via the Select. | Trigger announces selection; listbox options each readable; selecting a type changes which fields are visible and the change is not silent (focus moves to a sensible next field). | ☐ |
| 12 | For `multiple_choice`/`multi_select`, add 2 answers. | "Add answer" button reads its label; each new row gains focus on its label input. Each row exposes a Remove button with an accessible name like "Remove answer _<label>_" — not just an `X` icon. | ☐ |
| 13 | For `numeric`, set min/max/unit. | Each numeric input has a visible label and is reachable in a logical tab order. | ☐ |
| 14 | Save. | Toast "Question created" announced once. Dialog closes; focus returns to the **Add question** button or to the new row. | ☐ |

## C.5 — Edit a question

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 15 | Activate **Edit** on an existing question. | Dialog opens pre-populated; reader announces field values. | ☐ |
| 16 | Change the question text and Save. | Toast announced; row in list updates; reader can re-find the row by heading/text search. | ☐ |

## C.6 — Reorder & delete

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 17 | Use keyboard reorder controls (up/down buttons). | After each move, a polite announcement (e.g., "Question moved to position 3 of N") confirms the change. _If only drag-and-drop is supported, file as a Blocker (WCAG 2.1.1)._ | ☐ |
| 18 | Activate **Delete**. | Confirmation `alertdialog` opens; destructive button labelled clearly ("Delete question, button"). Cancel returns focus to triggering row. | ☐ |

## C.7 — Bulk import / export

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 19 | Activate **Import questions**. | File input is reachable (NVDA browse mode may need forms-mode toggled with Insert+Space). Label "Choose questions file" is announced. | ☐ |
| 20 | Submit a malformed file. | Error summary appears in a live region; each error item is readable. | ☐ |

---

## Cross-cutting admin checks (run once per reader after C.7)

- [ ] All icon-only buttons in the admin (kebab menus, copy, archive, restore, etc.) have `aria-label`.
- [ ] All Switches expose on/off state (not solely color).
- [ ] All Tooltips have `aria-describedby` wiring so the trigger is announced with the tooltip on focus.
- [ ] No hover-only interactions: every hover affordance has a focus or click equivalent.
- [ ] Status colors (badges) have a non-color textual indicator (e.g., the word "Archived").
