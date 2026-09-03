---
name: npm transitive overrides
description: How to validate and materialize security overrides for nested npm dependencies.
---

An npm override is not complete if the installed tree still marks the transitive package as invalid, even when a vulnerability scan no longer lists it.

**Why:** Updating an override and running an unrelated install can leave the old nested package physically installed while npm reports the newer override as the desired version.

**How to apply:** After dependency remediation, run `npm ls` for every affected package. If an overridden nested dependency is invalid, refresh or compatibly upgrade its direct parent, then require both a clean tree and a clean security scan.