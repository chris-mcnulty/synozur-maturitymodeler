---
name: AI summary role accuracy
description: Guardrails for personalizing summaries with broad titles and tenant-default industries
---

Treat a user's job title as the only verified role. A tenant's default industry describes the organization, not the user's department or specialization. Never combine them into a new title or infer responsibilities from a broad title.

**Why:** A broad title paired with a tenant-default industry led generated assessment summaries to assert specific roles the respondent never supplied. An "Other" dropdown that persisted the literal value also prevented collection of the actual title.

**How to apply:** When changing AI summary personalization, keep user-entered titles editable and distinguish title from sector in prompts. Summary output has an API response cache and a service cache; invalidate both together whenever prompt semantics change, or old incorrect text can outlive the fix.