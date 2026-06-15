---
name: getAllModels column projection
description: Why new models columns can silently disappear from the /api/models list response
---

The `/api/models` list endpoint is served by `getAllModels` in `server/storage.ts`,
which does NOT use a Drizzle `select()` over the table. It hand-writes a raw SQL
`db.execute(sql\`SELECT ... FROM models m LEFT JOIN questions q ...\`)` with an
explicit column list, an explicit `GROUP BY`, and a manual `result.rows.map(...)`
that renames snake_case → camelCase.

**Rule:** When you add a new column to the `models` table that must appear in the
list feed, you have to touch this method in THREE places:
1. the `SELECT` list,
2. the `GROUP BY` list,
3. the row-mapping object.

**Why:** The single-model GET (`getModel`) uses Drizzle and returns every column,
so a new field works there automatically. The list endpoint does not — it only
returns the columns it explicitly projects. A field present on the type and in the
DB will be `undefined` in `/api/models` results until added here, which breaks any
client that filters the list by that field (e.g. filtering models by
`assessmentMode`).
