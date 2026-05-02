# Orion automated tests

This directory holds the project's automated test foundation. It is
deliberately small — it covers the highest-risk business logic and one
end-to-end journey — and is meant to grow alongside new features.

## Layout

```
tests/
├── README.md            ← you are here
├── unit/                ← Vitest unit tests (node env, no DB, no network)
│   ├── scoring.test.ts  ← scoring engine: 100/500-point scales, edge cases
│   └── registry.test.ts ← AI provider registry: selection + fallback
└── e2e/                 ← Playwright smoke suite (requires running app)
    └── smoke.spec.ts    ← signup → assessment → results → admin edit
```

The pure scoring engine under test lives at
`server/services/scoring.ts` and is invoked from
`server/routes.ts` (`POST /api/assessments/:id/calculate`). The provider
registry under test lives at `server/services/ai-providers/registry.ts`.

## Running tests

> The project's `package.json` is treated as immutable in this environment, so
> the canonical commands invoke the bundled CLIs through `npx`. If you add an
> `npm test` script later, point it at `vitest run`.

### Unit tests (Vitest)

```bash
npx vitest run            # one-shot
npx vitest                # watch mode
npx vitest run scoring    # filter by file/name
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
npx playwright test

# Run against a different host (e.g. a deployed preview).
E2E_BASE_URL=https://staging.example.com E2E_NO_SERVER=1 npx playwright test

# Open the HTML report after a CI run.
npx playwright show-report
```

The smoke test signs up a fresh user with a unique username on each run, so it
is safe to re-run repeatedly against the same database.

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
npm run test:e2e
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
