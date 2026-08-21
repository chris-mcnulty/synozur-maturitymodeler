const UUID_SEGMENT = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const SESSION_PREVIEW_SUFFIX = `slides/preview/${UUID_SEGMENT}/${UUID_SEGMENT}\\.png`;
const MANAGED_SESSION_PREVIEW_RE = new RegExp(`^/objects/${SESSION_PREVIEW_SUFFIX}$`, "i");
const SESSION_PREVIEW_REFERENCE_RE = new RegExp(`(?:^|/)${SESSION_PREVIEW_SUFFIX}(?:$|[?#])`, "i");

/**
 * New review assets are session-namespaced. Historical flat preview paths are
 * committed course media and intentionally do not match this predicate.
 */
export function isPptxReviewPreviewPath(path: string): boolean {
  return MANAGED_SESSION_PREVIEW_RE.test(path);
}

/** Also recognizes a storage URL before it has been normalized to /objects/. */
export function isPptxReviewPreviewReference(value: string): boolean {
  return SESSION_PREVIEW_REFERENCE_RE.test(value);
}