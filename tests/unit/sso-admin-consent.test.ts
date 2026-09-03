import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BASIC_SSO_SCOPES,
  generateAdminConsentUrl,
  verifyAdminConsentRequestState,
  verifyAdminConsentState,
} from "../../server/services/sso-service";

describe("Microsoft admin consent URLs", () => {
  beforeEach(() => {
    vi.stubEnv("AZURE_CLIENT_ID", "test-client-id");
    vi.stubEnv("SESSION_SECRET", "test-session-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("binds a consent callback to the originating Orion tenant", () => {
    const result = generateAdminConsentUrl(
      "azure-tenant-id",
      "https://models.example.com",
      "orion-tenant-id",
    );
    const url = new URL(result.consentUrl);

    expect(url.pathname).toBe("/azure-tenant-id/oauth2/v2.0/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://models.example.com/auth/sso/callback",
    );
    expect(verifyAdminConsentState(url.searchParams.get("state") ?? undefined))
      .toBe("orion-tenant-id");
    expect(url.searchParams.get("scope")).toBe(BASIC_SSO_SCOPES.join(" "));
    expect(url.searchParams.get("prompt")).toBe("admin_consent");
    expect(result.requiredPermissions.join(" ")).not.toContain("Planner");
    expect(result.requiredPermissions.join(" ")).not.toContain("Group.Read.All");
  });

  it("rejects a tampered tenant-binding state", () => {
    const result = generateAdminConsentUrl(
      undefined,
      "https://models.example.com",
      "orion-tenant-id",
    );
    const url = new URL(result.consentUrl);
    const state = url.searchParams.get("state");

    expect(url.pathname).toBe("/common/oauth2/v2.0/authorize");
    expect(state).toBeTruthy();
    expect(verifyAdminConsentState(`${state}tampered`)).toBeNull();
  });

  it("can target a verified Entra domain before the tenant ID is known", () => {
    const result = generateAdminConsentUrl(
      "example.org",
      "https://models.example.com",
      "orion-tenant-id",
    );
    const url = new URL(result.consentUrl);

    expect(url.pathname).toBe("/example.org/oauth2/v2.0/authorize");
    expect(verifyAdminConsentState(url.searchParams.get("state") ?? undefined))
      .toBe("orion-tenant-id");
  });

  it("uses a separate admin flow for Planner application permissions", () => {
    const result = generateAdminConsentUrl(
      "azure-tenant-id",
      "https://models.example.com",
      "orion-tenant-id",
      "planner",
    );
    const url = new URL(result.consentUrl);

    expect(url.pathname).toBe("/azure-tenant-id/adminconsent");
    expect(url.searchParams.has("scope")).toBe(false);
    expect(result.requiredPermissions).toEqual([
      "Read and write Planner tasks (Tasks.ReadWrite.All)",
      "Read groups (Group.Read.All)",
    ]);
    expect(verifyAdminConsentRequestState(url.searchParams.get("state") ?? undefined))
      .toMatchObject({
        orionTenantId: "orion-tenant-id",
        consentType: "planner",
      });
  });
});