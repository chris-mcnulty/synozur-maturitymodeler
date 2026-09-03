import type { RequestHandler } from "express";

const HUBSPOT_ORIGINS = [
  "https://js-na2.hs-scripts.com",
  "https://*.hubspot.com",
  "https://*.hubspotusercontent.com",
  "https://*.hsforms.com",
  "https://*.hsforms.net",
  "https://*.hs-scripts.com",
  "https://*.hs-analytics.net",
  "https://*.hsadspixel.net",
  "https://*.hs-banner.com",
  "https://*.hscollectedforms.net",
  "https://*.hsappstatic.net",
  "https://*.usemessages.com",
  "https://snap.licdn.com",
  "https://connect.facebook.net",
];

export function buildContentSecurityPolicy(isProduction = process.env.NODE_ENV === "production"): string {
  const scriptSources = [
    "'self'",
    ...(!isProduction ? ["'unsafe-inline'", "'unsafe-eval'"] : []),
    ...HUBSPOT_ORIGINS,
  ];

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self' https: wss:",
    "frame-src 'self' https:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https:",
    "frame-ancestors 'none'",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function securityHeaders(isProduction = process.env.NODE_ENV === "production"): RequestHandler {
  const contentSecurityPolicy = buildContentSecurityPolicy(isProduction);

  return (_req, res, next) => {
    res.setHeader("Content-Security-Policy", contentSecurityPolicy);
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  };
}