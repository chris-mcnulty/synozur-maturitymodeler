# Orion automated tests

This directory holds the project's automated test foundation. It is
deliberately small — it covers the highest-risk business logic and one
end-to-end journey — and is meant to grow alongside new features.

## Layout

```
tests/
├── README.md                  ← you are here
├── unit/                      ← Vitest unit tests (node env, no DB, no network)
│   ├── scoring.test.ts        ← scoring engine: 100/500-point scales, edge cases
│   ├── registry.test.ts       ← AI provider registry: selection + fallback
│   └── galaxy-webhooks.test.ts← galaxy HMAC signer + secret generator
├── integration/               ← Vitest integration tests (mocked db, supertest)
│   ├── helpers/               ← shared test app + galaxy fake-db helper
│   ├── galaxy-api.test.ts     ← Galaxy /api/galaxy/v1/* contract + webhook E2E
│   ├── oauth-clients.test.ts  ← OAuth admin CRUD
│   ├── og-routes.test.ts      ← OpenGraph share pages
│   └── …                      ← assessment-flow, auth-change-password, admin-models
└── e2e/                       ← Playwright smoke suite (requires running app)
    ├── smoke.spec.ts          ← signup → assessment → results → admin edit
    └── mobile-layouts.spec.ts ← mobile-layout regression at 375/414/768
```

The Galaxy contract suite (`integration/galaxy-api.test.ts`) exercises every
`/api/galaxy/v1/*` endpoint with valid + invalid bearer tokens, missing
scopes, disabled tenants, audience-role exclusion, exposure-policy filtering,
and rate-limit overflow. It also verifies webhook delivery and HMAC signatures
end-to-end against a local `http.createServer` listener (with
`GALAXY_WEBHOOK_ALLOW_PRIVATE=true`). It runs in CI on every PR via
`.github/workflows/test.yml`.

The pure scoring engine under test lives at
`server/services/scoring.ts` and is invoked from
`server/routes.ts` (`POST /api/assessments/:id/calculate`). The provider
registry under test lives at `server/services/ai-providers/registry.ts`.

## Continuous integration

Both suites run automatically on every pull request and on every push to
`main` via the [`Tests` workflow](../.github/workflows/test.yml):

- The **`vitest`** job spins up an isolated Postgres 16 service, applies the
  Drizzle schema with `npx drizzle-kit push --force`, and runs
  `npx vitest run --reporter=default`.
- The **`playwright`** job runs after Vitest passes. It installs the
  Chromium browser, seeds the minimal published "individual" model the
  smoke suite needs via
  [`scripts/seed-e2e-fixtures.mjs`](../scripts/seed-e2e-fixtures.mjs),
  provisions a non-production admin account from the
  `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD` repository secrets (via
  [`scripts/provision-e2e-admin.mjs`](../scripts/provision-e2e-admin.mjs)),
  starts the app via Playwright's `webServer` (with a CI-only
  `SESSION_SECRET`), and runs `npx playwright test`. On failure the HTML
  report and traces are uploaded as workflow artifacts
  (`playwright-report`, `playwright-traces`).

To exercise the full smoke suite (including the admin "edit question" leg)
in CI, configure two repository (or organization) secrets pointing at a
dedicated, non-production admin account:

| Secret | Purpose |
| --- | --- |
| `E2E_ADMIN_USERNAME` | Username of the QA admin account. |
| `E2E_ADMIN_PASSWORD` | Password for that account. |

If either secret is missing, the admin leg is skipped automatically and the
job still runs the public signup → assessment → results journey.

## Running tests

The canonical entry point is `npm test`. The following scripts are wired up in
`package.json`:

| Script | What it runs |
| --- | --- |
| `npm test` | `vitest run` (alias for the unit/integration suite) |
| `npm run test:unit` | `vitest run` |
| `npm run test:watch` | `vitest` (watch mode) |
| `npm run test:e2e` | `playwright test` |
| `npm run test:mobile-layouts` | `playwright test mobile-layouts` |

The underlying CLIs are still available via `npx vitest` / `npx playwright` if
you need flags or filters that the npm scripts don't forward.

### Unit tests (Vitest)

```bash
npm test                  # one-shot
npm run test:watch        # watch mode
npm test -- scoring       # filter by file/name (forwarded to vitest)
```

Unit tests must be hermetic: no live DB, no network, no real Postgres
connection. The provider-registry tests demonstrate the pattern — use
`vi.doMock('../../server/db', …)` and `vi.resetModules()` so the registry
imports the mocked `db` for that test only.

### End-to-end tests (Playwright)

```bash
# First-time setup: install browser binaries (~150 MB).
npx playwright install chromium

# Run the smoke suite against http://localhost:5000 (Playwright will start
# `npm run dev` automatically and reuse it if it is already running).
npm run test:e2e

# Run against a different host (e.g. a deployed preview).
E2E_BASE_URL=https://staging.example.com E2E_NO_SERVER=1 npm run test:e2e

# Open the HTML report after a CI run.
npx playwright show-report
```

The smoke test signs up a fresh user with a unique username on each run, so it
is safe to re-run repeatedly against the same database.

#### Mobile layout regression

The mobile-layout suite (`tests/e2e/mobile-layouts.spec.ts`) is the recurring
guard for the mobile-first pass. It loads `/`, `/auth`, the public
`/results/:id` error surface, and the authenticated assessment + real results
pages (after signing up a fresh user and submitting an assessment) at three
viewports (375x812, 414x896, 768x1024) and asserts:

  - the document never horizontally overflows,
  - the route's primary CTA is visible without scrolling,
  - the mobile-only landmarks (`mobile-value-prop`, `mobile-disclaimer`,
    `button-mobile-overflow`, `text-question`, `text-score`) are still
    rendered.

Run it via the dedicated npm script:

```bash
npm run test:mobile-layouts
```

(equivalent to `npx playwright test mobile-layouts`; the
`scripts/test-mobile-layouts.sh` wrapper accepts extra Playwright flags such
as `--headed`). The same script runs in CI on every PR via the
`mobile-layouts` job in `.github/workflows/test.yml`.

#### Admin step (required for full coverage)

The admin "open model → edit question" leg of the smoke suite is gated on two
environment variables. **Without them, that leg is `skip`-ed** and the suite
covers only the public signup → assessment → results journey. To exercise all
four steps from task #9 (signup → assessment → results → admin edit), you
must export both variables before running `npm run test:e2e`:

| Variable | Purpose |
| --- | --- |
| `E2E_ADMIN_USERNAME` | Username (or email) of an existing admin account. |
| `E2E_ADMIN_PASSWORD` | Password for that account. |

Use a dedicated, non-production admin for E2E. In CI, store the password as
a secret and pass both values through to the Playwright job.

Example:

```bash
E2E_ADMIN_USERNAME=qa-admin \
E2E_ADMIN_PASSWORD=*** \
npx playwright test
```

## What new code is expected to test

When you add or change code, please add tests in roughly this order of
priority. The aim is "small, durable safety net", not 100 % coverage.

1. **Scoring, ranking, or aggregation logic.** Anything that turns user
   responses into numbers belongs in `server/services/scoring.ts` (or a
   sibling module) and gets a unit test covering at least:
   - the happy path on every supported maturity scale,
   - the all-zero / all-max boundary,
   - the empty / missing-data path.
2. **Provider, integration, or adapter selection.** When you add an AI
   provider, a payment processor, an email backend, etc., extend the
   registry tests so selection, env-driven availability, and the fallback
   chain are all covered.
3. **New user-facing journeys.** When a feature introduces a brand-new
   end-to-end flow (e.g. a new assessment type, a new admin workflow), add
   one Playwright spec that walks the happy path. Keep it tolerant of seeded
   data — read the live API to discover IDs/slugs rather than hard-coding.
4. **Regressions.** When you fix a bug, add the smallest test that would
   have failed before your fix. Prefer a unit test if the bug was in pure
   logic; reach for Playwright only when the bug crossed the
   browser/server boundary.

Things deliberately **out of scope** for this foundation: visual regression,
load/perf testing, exhaustive endpoint coverage. Add them as separate tasks
when there is a clear need.

## Test IDs

The frontend is already annotated with `data-testid` attributes on every
interactive element and every meaningful display element (see the project's
`fullstack_js` guidelines). New tests should always prefer
`page.getByTestId(...)` over CSS or text selectors so refactors do not break
them.
