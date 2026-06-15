---
name: Admin model update uses an explicit allow-list payload
description: Why a new models column can silently fail to persist from the admin ModelBuilder (UI reverts), and where to add it.
---

The admin Model update flow does NOT send a partial patch. In `client/src/pages/Admin.tsx`, `handleUpdateModel` (and `handleUpdateTenantAssignments`) build a **full, explicit allow-list object** for `updateModel.mutate(...)`, listing each model field one-by-one. Only fields in that list reach `PUT /api/models/:id`.

**Why:** `ModelBuilder` calls `onUpdateModel({ someField })`, which merges into local `editingModel` state, but the mutation payload is reconstructed from the allow-list — so any model column missing from that list is dropped before the PUT. The server keeps the old value and the next refetch overwrites local state, making the control "instantly revert" (this is exactly what happened to `assessmentMode` for type/propensity models).

**How to apply:** When you add a new column to the `models` table that should be editable in ModelBuilder, you MUST add it to BOTH allow-list payloads in `Admin.tsx` (handleUpdateModel and handleUpdateTenantAssignments), AND confirm the models list/get API returns it (it feeds `editingModel`, and a missing key would re-default on the next edit). The server route (`PUT /api/models/:id`) and `storage.updateModel` already pass the whole body through, so no backend change is needed.
