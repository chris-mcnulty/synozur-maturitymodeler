export interface BrandingPreview {
  primaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
}

const STORAGE_KEY = "tenant-branding-preview";
const EVENT_NAME = "tenant-branding-preview-change";

let snapshot: BrandingPreview | null = null;
let initialized = false;
const listeners = new Set<() => void>();

function readFromStorage(): BrandingPreview | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BrandingPreview;
  } catch {
    return null;
  }
}

function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  snapshot = readFromStorage();
  // Cross-tab sync: storage event from other tabs/windows.
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    snapshot = readFromStorage();
    listeners.forEach((l) => l());
  });
  // Same-tab updates from setBrandingPreview/clearBrandingPreview.
  window.addEventListener(EVENT_NAME, () => {
    listeners.forEach((l) => l());
  });
}

function commit(value: BrandingPreview | null) {
  ensureInit();
  snapshot = value;
  if (typeof window !== "undefined") {
    try {
      if (value === null) {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } else {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      }
    } catch {
      // ignore storage failures
    }
    window.dispatchEvent(new Event(EVENT_NAME));
  }
}

export function getBrandingPreview(): BrandingPreview | null {
  ensureInit();
  return snapshot;
}

export function setBrandingPreview(value: BrandingPreview) {
  commit(value);
}

export function clearBrandingPreview() {
  commit(null);
}

export function subscribeBrandingPreview(listener: () => void): () => void {
  ensureInit();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
