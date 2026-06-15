---
name: Landing prominent-assessment selection
description: How the landing page decides which assessment is the "main/prominent" one, and the gotcha that there are two separate mechanisms.
---

The landing page (`client/src/pages/Landing.tsx`) surfaces a "main" assessment through TWO independent paths. Changing only one leaves the other still pointing at the old model.

1. **Featured Assessment section** (the big hero card with name/description/image/CTA) uses `featuredModels[0]` = the first model with the `featured` boolean = true (DB `models.featured`). Order follows the `/api/models` response order.
2. **Start-assessment CTA / `getHeroModel()`** uses, in priority order: the `heroModel` system setting (value = model id, JSON-encoded string in `settings.value`), then a slug fallback (`digital-transformation` or any slug containing `ai`), then `models[0]`.

**Why:** A request to "make model X the main/prominent assessment" is only fully satisfied by handling both. We once set only `heroModel` and the prominent Featured Assessment card still showed the old model because it keyed off `featured`, not the setting.

**How to apply:** To make model X the prominent assessment: (a) set the `heroModel` setting to X's id, AND (b) ensure X is the first `featured=true` model — usually by featuring X and unfeaturing the previous main model. Verify both the Featured card and the CTA.
