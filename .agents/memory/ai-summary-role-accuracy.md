---
name: AI summary role accuracy
description: Guardrails for personalizing summaries with broad titles and tenant-default industries
---

Treat a user's job title as the only verified role. A tenant's default industry describes the organization, not the user's department or specialization. Never combine them into a new title or infer responsibilities from a broad title.

**Why:** A broad title paired with a tenant-default industry led generated assessment summaries to assert specific roles the respondent never supplied. An "Other" dropdown that persisted the literal value also prevented collection of the actual title.

**How to apply:** When changing AI summary personalization, keep user-entered titles editable and distinguish title from sector in prompts. Summary output has an API response cache and a service cache; invalidate both together whenever prompt semantics change, or old incorrect text can outlive the fix.

Nested profile fields must participate in the service cache key. `JSON.stringify(object, Object.keys(object).sort())` is not a deep stable serializer: its replacer array filters keys at every depth, so a nested job title can disappear and a different person's summary can be reused.

**Why:** The report had no explicit regeneration path, and its maturity-summary service cache could return text generated for a different job title even when the API-level cache key differed.

**How to apply:** Use recursive canonicalization (or an equivalent deep stable serializer) for personalization keys. If cache semantics change, version the outer API and service keys together; a UI refetch alone does not bypass either persisted cache.