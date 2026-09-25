---
name: Neon Drizzle array binding
description: A Drizzle raw-SQL array placeholder can fail when passed to Postgres ANY with the Neon serverless driver.
---

With this project's Drizzle/Neon connection, interpolating a JavaScript string array into raw SQL as `ANY(${array}::varchar[])` was bound as a single plain string and the query failed. Use Drizzle's `inArray` query builder or individually bound placeholders joined with `sql.join` for an `IN` expression.

**Why:** Type checks and tests that only cover an empty result path did not catch the error; a direct development-database query did.

**How to apply:** Whenever raw SQL filters by a dynamic list of IDs, check the actual parameter behavior with a small live development-database query before relying on the worker path.