# Script B — Profile & Results Flow

**Purpose:** Verify a screen-reader user can manage their profile, change
password, browse assessment history, view a results page (including charts),
and act on each available control.

**Run on:** NVDA + Firefox, JAWS + Chrome, VoiceOver + Safari.

**Estimated time:** 20–30 minutes per reader.

**Pre-requisites:**
- A logged-in test account with at least 3 completed assessments across at
  least 2 different models (so the trend chart and filters have data).
- An unverified email state available on a separate test account (for the
  "Resend verification" alert).

WCAG 2.1 AA criteria covered: **1.3.1, 1.4.1, 2.4.3, 2.4.6, 3.3.1, 3.3.3,
4.1.2, 4.1.3**.

---

## B.1 — Page structure

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 1 | Load `/profile`. Press `H` to walk headings. | "Heading 1, My Profile" → "Heading 2, Profile Information" → "Heading 2, Assessment History" (or equivalent). No skipped heading levels. | ☐ |
| 2 | Walk landmarks. | `main` present; footer announced as `contentinfo`. | ☐ |

## B.2 — Profile form (read-only state)

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 3 | Tab through Username, Email, Name, Company. | Each input is read as "edit, disabled, _<label>_, _<value>_". Required asterisks are read (or labelled via `aria-label`/visually hidden text). | ☐ |
| 4 | Find email-verification status. | If verified: "Email verified" is reachable as text near the email field. If not verified: an alert is exposed with `role="alert"` and a "Resend" button is reachable. | ☐ |
| 5 | Activate **Edit**. | Button reads "Edit, button". On activation, focus stays sensible; previously disabled inputs re-announce as enabled. | ☐ |

## B.3 — Profile form (edit state) & validation

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 6 | Clear the **Name** field and Save. | Toast/error announces "Required field missing — Name is required" via the live region. Focus does not silently disappear. | ☐ |
| 7 | Tab to the **Job Title**, **Industry**, **Company Size**, **Country** Selects. | Each Select trigger reads role "combobox" (or "popup button" on VoiceOver), with the current value or placeholder. Down arrow opens the listbox. | ☐ |
| 8 | Inside the listbox, arrow through options. | Each option reads label + position; Enter selects + closes. Focus returns to the trigger. | ☐ |

## B.4 — Change password

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 9 | Activate **Change password**. | Form fields gain focus order: Current → New → Confirm. Each input is `type="password"` and announces as such. | ☐ |
| 10 | Submit a 4-character password. | Inline error reads "Password must be at least 8 characters long" via `role="alert"`. | ☐ |
| 11 | Submit non-matching new + confirm. | Error reads "New passwords do not match". | ☐ |
| 12 | Submit a valid password. | Toast "Password changed" announced once via polite live region. | ☐ |

## B.5 — Notifications switch

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 13 | Tab to monthly digest Switch. | "Switch, on/off, _<label>_". Space toggles; new state is announced. Toast confirms subscribe/unsubscribe. | ☐ |

## B.6 — SSO setup dialog (tenant users only)

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 14 | Activate **Get IT admin setup email**. | Dialog opens with `role="dialog"` and a labelled title. Focus moves into the dialog; first focusable item is announced. | ☐ |
| 15 | Activate **Copy email**. | Polite announcement "Email copied" through toast. Focus stays inside the dialog. Esc closes; focus returns to the trigger button. | ☐ |

## B.7 — Assessment history

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 16 | Find the model filter Select. | Trigger announces current selection ("All models" by default). Choose a single model; option list filters update. | ☐ |
| 17 | Walk the history list. | Each row exposes model name, status badge, score, and any trend icon's `aria-label` (e.g., "Score increased by 12 points"). Pure decorative icons must be `aria-hidden`. | ☐ |
| 18 | Activate a row's **View results** action. | Focus moves to results page; new page's `<h1>` is announced. | ☐ |
| 19 | Activate **Delete** on a row. | Confirmation alert dialog is reached (role `alertdialog`). Description and destructive button are announced. Cancel returns focus to the originating row's button. | ☐ |

## B.8 — Trend chart

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 20 | Filter by a single model so the chart appears. Reach the chart container. | Chart has a meaningful accessible name (e.g., "Score over time chart, _<model>_") OR is paired with a visible data table that conveys the same info. | ☐ |
| 21 | Confirm a tabular fallback exists for screen-reader users (or the chart exposes data points via `aria-label`). | Each data point or table row reads "date, score, max score". | ☐ |

> **Note for testers:** If the chart has no accessible alternative, file as a
> Blocker — Recharts SVGs are typically opaque to screen readers without one.

## B.9 — Results page

| # | Step | Expected announcement | Pass |
|---|---|---|---|
| 22 | Load `/results/<id>`. Walk headings. | Logical hierarchy: H1 page title, H2 sections (Overall score, Dimensions, Recommendations, …). | ☐ |
| 23 | Overall score is reachable. | Score is announced as text (not solely via a visual circle). The maturity level label is part of the same readable region. | ☐ |
| 24 | Each dimension card. | Reader announces dimension name, score, and recommendation summary in order. | ☐ |
| 25 | Action buttons (Download PDF, Retake, Share). | Each button has a discernible label; icon-only buttons have `aria-label`. | ☐ |
