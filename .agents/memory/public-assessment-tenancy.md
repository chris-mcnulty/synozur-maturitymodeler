---
name: Public assessment tenancy
description: Public anonymous assessments intentionally remain tenantless and are not to be filtered as missing tenant data.
---

Public assessments may legitimately have no user or tenant association because anonymous submission is an intentional product behavior.

**Why:** Public assessment results are expected to be available through the administrative workflow; tenant-null rows are not evidence of corrupted ownership.

**How to apply:** Do not backfill or filter anonymous public results by tenant merely to satisfy tenant-scoped views. Use the appropriate elevated administrative role when full administrative visibility is intended.

Anonymous ownership regression checks must start with a fresh browser with no cookies, use real session middleware, and repeat under forwarded HTTPS.

**Why:** Signed-in or pre-initialized-session tests can pass while first-time public visitors fail immediately after launch; production's secure cookie behavior is not exercised by a mocked session ID.

**How to apply:** Cover creation followed by a separate read using the issued cookie, and confirm that a second browser still cannot access the assessment. Do not relax ownership checks to compensate for missing cookies.