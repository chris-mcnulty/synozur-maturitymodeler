import { describe, expect, it } from "vitest";
import { insertTenantSchema } from "../../shared/schema";

describe("insertTenantSchema", () => {
  it("allows tenant creation without optional branding fields", () => {
    const result = insertTenantSchema.safeParse({ name: "Contoso" });

    expect(result.success).toBe(true);
  });

  it("normalizes explicitly empty branding fields to null", () => {
    const result = insertTenantSchema.parse({
      name: "Contoso",
      logoUrl: "",
      faviconUrl: "",
      primaryColor: "",
      secondaryColor: "",
      accentColor: "",
      emailFromName: "",
    });

    expect(result).toMatchObject({
      logoUrl: null,
      faviconUrl: null,
      primaryColor: null,
      secondaryColor: null,
      accentColor: null,
      emailFromName: null,
    });
  });
});