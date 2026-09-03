import express from "express";
import session from "express-session";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildSessionSettings } from "../../server/auth";
import {
  buildContentSecurityPolicy,
  securityHeaders,
} from "../../server/security-headers";

describe("response security headers", () => {
  function buildApp() {
    const app = express();
    app.use(securityHeaders(true));
    app.get("/", (_req, res) => res.type("html").send("<!doctype html>"));
    app.get("/api/status", (_req, res) => res.json({ ok: true }));
    return app;
  }

  it.each(["/", "/api/status"])("protects representative response %s", async (path) => {
    const response = await request(buildApp()).get(path);

    expect(response.headers["content-security-policy"]).toBe(buildContentSecurityPolicy(true));
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("allows the app's browser integrations and media requirements", () => {
    const policy = buildContentSecurityPolicy(true);

    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("https://fonts.googleapis.com");
    expect(policy).toContain("https://fonts.gstatic.com");
    expect(policy).toContain("https://js-na2.hs-scripts.com");
    expect(policy).toContain("https://*.hubspot.com");
    expect(policy).toContain("https://*.hsadspixel.net");
    expect(policy).toContain("https://snap.licdn.com");
    expect(policy).toContain("https://connect.facebook.net");
    expect(policy).toContain("img-src 'self' data: blob: https:");
    expect(policy).toContain("media-src 'self' blob: https:");
    expect(policy).toContain("connect-src 'self' https: wss:");
    expect(policy).toContain("frame-src 'self' https:");
    const scriptDirective = policy.split("; ").find((directive) =>
      directive.startsWith("script-src "),
    );
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(scriptDirective).not.toContain("'unsafe-eval'");
  });
});

describe("production session cookie", () => {
  it("is HttpOnly, Secure, and SameSite=Lax behind the HTTPS proxy", async () => {
    const app = express();
    app.set("trust proxy", 1);
    app.use(session(buildSessionSettings(undefined, true)));
    app.get("/login-test", (req, res) => {
      req.session.userId = "test-user";
      res.sendStatus(204);
    });

    const response = await request(app)
      .get("/login-test")
      .set("X-Forwarded-Proto", "https");
    const cookie = response.headers["set-cookie"]?.[0];

    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax/i);
  });
});