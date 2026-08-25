---
name: Public assessment tenancy
description: Public anonymous assessments intentionally remain tenantless and are not to be filtered as missing tenant data.
---

Public assessments may legitimately have no user or tenant association because anonymous submission is an intentional product behavior.

**Why:** Public assessment results are expected to be available through the administrative workflow; tenant-null rows are not evidence of corrupted ownership.

**How to apply:** Do not backfill or filter anonymous public results by tenant merely to satisfy tenant-scoped views. Use the appropriate elevated administrative role when full administrative visibility is intended.