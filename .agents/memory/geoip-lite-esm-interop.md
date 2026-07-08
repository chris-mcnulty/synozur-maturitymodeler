---
name: geoip-lite dynamic import breaks across major versions
description: geoip-lite 2.x changed its CJS export shape so `await import('geoip-lite')` no longer exposes `.lookup` directly under Node ESM.
---

When `geoip-lite` is upgraded across a major version (e.g. 1.x -> 2.x) to fix a
transitive `ip-address` CVE, any code doing `const geoip = await
import('geoip-lite'); geoip.lookup(ip)` silently breaks: the named export is
gone and only `geoip.default.lookup` works under Node's CJS/ESM interop.

**Why:** verified directly by testing `await import('geoip-lite')` in a real
ESM (`"type": "module"`) context — `geoip.lookup` was `undefined`, only
`geoip.default.lookup` was a function. Code wrapped this call in a try/catch
with a fallback, so the break was silent (no crash, just wrong/missing
country data) until explicitly tested against the DB.

**How to apply:** when dynamically importing a CJS package, normalize with
`const mod = await import(pkg); const api = mod.default ?? mod;` instead of
assuming named exports exist. After any geoip-lite (or similar CJS lib)
version bump, verify by hitting the actual route and checking the DB/response
— don't trust "no errors thrown" when the call is inside a try/catch fallback.
Also note geoip-lite >=2.0.0 declares `engines.node >= 24`; it still runs fine
under Node 20 in practice, but treat that as unverified upstream support.
