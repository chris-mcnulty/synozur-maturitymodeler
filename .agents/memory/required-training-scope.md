---
name: Required Training naming and tenant visibility
description: User-directed naming and visibility rules for annual required training
---

Use “Required Training” in the menu and user-facing UI, not “Mandatory Training.”

**Why:** The user explicitly corrected the product terminology.

Only show the menu item when the signed-in user's tenant has required training configured. Public visitors and tenants without required training must not see it. The user expects this to apply to few clients, likely only Synozur; do not hardcode Synozur as the eligibility rule.

**Why:** The user asked for tenant-specific visibility rather than exposing required training to all clients.

**How to apply:** Keep visibility tied to the authenticated tenant, including when the signed-in user is a global admin. Existing backend identifiers may retain their legacy names for compatibility.