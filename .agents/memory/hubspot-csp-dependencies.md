---
name: HubSpot CSP dependencies
description: Why Orion's CSP needs browser validation for scripts loaded dynamically by HubSpot.
---

HubSpot's bootstrap script dynamically loads other HubSpot services and the advertising pixels configured in the portal, including third-party analytics scripts.

**Why:** A static source-code search sees only the HubSpot loader. Tightening CSP around that single host silently disabled configured analytics scripts in browser validation.

**How to apply:** Whenever changing `script-src`, load the landing page in a real browser and inspect CSP violations after the HubSpot loader settles. Keep additions host-specific rather than allowing arbitrary HTTPS scripts.