import { beforeEach, describe, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({
  getUserBySsoProvider: vi.fn(), getUserByEmail: vi.fn(), getTenant: vi.fn(), updateUser: vi.fn(),
}));
vi.mock("../../storage", () => ({ storage: store }));
import { provisionUser } from "../sso-service";
import { canClaimPreprovisionedMicrosoftAccount } from "../preprovisioned-microsoft";

const user = { id: "pre-registered-user", tenantId: "tenant", email: "new@example.test",
  ssoProvider: "microsoft", ssoProviderId: null, emailVerified: false, name: null };
const identity = { id: "entra-object", email: "NEW@example.test", name: "New Learner", ssoTenantId: "org-id" };
beforeEach(() => {
  vi.clearAllMocks();
  store.getUserBySsoProvider.mockResolvedValue(undefined);
  store.getUserByEmail.mockResolvedValue(user);
  store.getTenant.mockResolvedValue({ id: "tenant", ssoTenantId: "org-id", allowUserSelfProvisioning: false });
  store.updateUser.mockImplementation(async (_id, patch) => ({ ...user, ...patch }));
});
describe("pre-registered Entra accounts", () => {
  it("links first sign-in to the same account even when automatic provisioning is disabled", async () => {
    const result = await provisionUser(identity);
    expect(result.user).toMatchObject({ id: user.id, tenantId: user.tenantId, ssoProviderId: identity.id, emailVerified: true });
    expect(result.isNewUser).toBe(false);
    expect(store.getUserByEmail).toHaveBeenCalledWith("new@example.test");
    expect(store.updateUser).toHaveBeenCalledWith(user.id, {
      ssoProvider: "microsoft", ssoProviderId: identity.id, emailVerified: true, name: identity.name,
    });
  });
  it("refuses to claim a pending account from a different Entra organization", async () => {
    const result = await provisionUser({ ...identity, ssoTenantId: "wrong-org" });
    expect(result.user).toBeNull();
    expect(store.updateUser).not.toHaveBeenCalled();
  });
  it("fails closed if the expected organization is missing", async () => {
    store.getTenant.mockResolvedValue({ id: "tenant", ssoTenantId: null });
    expect((await provisionUser(identity)).user).toBeNull();
    expect(store.updateUser).not.toHaveBeenCalled();
  });
  it("requires matching email, tenant membership, and both organization IDs", () => {
    expect(canClaimPreprovisionedMicrosoftAccount(user, "ORG-ID", identity)).toBe(true);
    expect(canClaimPreprovisionedMicrosoftAccount(user, "org-id", { ...identity, email: "other@example.test" })).toBe(false);
    expect(canClaimPreprovisionedMicrosoftAccount({ ...user, tenantId: null }, "org-id", identity)).toBe(false);
    expect(canClaimPreprovisionedMicrosoftAccount(user, "org-id", { ...identity, ssoTenantId: undefined })).toBe(false);
  });
});