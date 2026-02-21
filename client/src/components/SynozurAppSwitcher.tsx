import { useState, useRef, useEffect } from "react";

const BRAND_PRIMARY = "#810FFB";
const BRAND_SECONDARY = "#E60CB3";

const SYNOZUR_APPS = [
  {
    id: "vega",
    name: "Vega",
    tagline: "Company Operating System",
    description: "AI-augmented strategy, goals, execution, governance, and insight in one place.",
    url: "https://vega.synozur.com",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <polygon points="12,2 15,9 22,9 16.5,14 18.5,21 12,17 5.5,21 7.5,14 2,9 9,9" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.15" />
      </svg>
    ),
  },
  {
    id: "constellation",
    name: "Constellation",
    tagline: "Delivery & Financial Management",
    description: "Time, cost, progress tracking with estimates, invoicing, and reporting.",
    url: "https://scdp.synozur.com",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <circle cx="12" cy="5" r="1.5" fill="currentColor" />
        <circle cx="6" cy="10" r="1.5" fill="currentColor" />
        <circle cx="18" cy="10" r="1.5" fill="currentColor" />
        <circle cx="8" cy="17" r="1.5" fill="currentColor" />
        <circle cx="16" cy="17" r="1.5" fill="currentColor" />
        <line x1="12" y1="5" x2="6" y2="10" stroke="currentColor" strokeWidth="1" opacity="0.5" />
        <line x1="12" y1="5" x2="18" y2="10" stroke="currentColor" strokeWidth="1" opacity="0.5" />
        <line x1="6" y1="10" x2="8" y2="17" stroke="currentColor" strokeWidth="1" opacity="0.5" />
        <line x1="18" y1="10" x2="16" y2="17" stroke="currentColor" strokeWidth="1" opacity="0.5" />
        <line x1="6" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth="1" opacity="0.3" />
        <line x1="8" y1="17" x2="16" y2="17" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      </svg>
    ),
  },
  {
    id: "nebula",
    name: "Nebula",
    tagline: "Innovation & Envisioning",
    description: "Co-design strategy, surface insights, and turn ideas into shared direction.",
    url: "https://nebula.synozur.com",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1" opacity="0.2" />
        <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1" opacity="0.4" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" fillOpacity="0.6" />
        <circle cx="9" cy="8" r="1" fill="currentColor" fillOpacity="0.3" />
        <circle cx="16" cy="10" r="0.8" fill="currentColor" fillOpacity="0.3" />
        <circle cx="14" cy="16" r="0.6" fill="currentColor" fillOpacity="0.3" />
      </svg>
    ),
  },
  {
    id: "orion",
    name: "Orion",
    tagline: "Transformation & Maturity",
    description: "AI-powered maturity assessments with actionable roadmaps for change.",
    url: "https://orion.synozur.com",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <circle cx="8" cy="6" r="1.5" fill="currentColor" fillOpacity="0.8" />
        <circle cx="11" cy="9" r="1.2" fill="currentColor" fillOpacity="0.8" />
        <circle cx="14" cy="12" r="1.8" fill="currentColor" />
        <circle cx="16" cy="16" r="1" fill="currentColor" fillOpacity="0.6" />
        <line x1="8" y1="6" x2="11" y2="9" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
        <line x1="11" y1="9" x2="14" y2="12" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
        <line x1="14" y1="12" x2="16" y2="16" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      </svg>
    ),
  },
  {
    id: "orbit",
    name: "Orbit",
    tagline: "Go-to-Market Intelligence",
    description: "Competitive and market insights for positioning, prioritization, and action.",
    url: "https://orbit.synozur.com",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1" />
        <ellipse cx="12" cy="12" rx="10" ry="4" stroke="currentColor" strokeWidth="1" opacity="0.5" transform="rotate(-30 12 12)" />
        <ellipse cx="12" cy="12" rx="10" ry="4" stroke="currentColor" strokeWidth="1" opacity="0.5" transform="rotate(30 12 12)" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
];

function getAppColor(index: number): string {
  return index % 2 === 0 ? BRAND_PRIMARY : BRAND_SECONDARY;
}

interface SynozurAppSwitcherProps {
  currentApp?: "vega" | "constellation" | "nebula" | "orion" | "orbit";
  forceDark?: boolean;
}

export function SynozurAppSwitcher({ currentApp = "orion", forceDark = false }: SynozurAppSwitcherProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const closeMenu = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        closeMenu();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu();
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const d = forceDark ? "fd" : "";

  const triggerClasses = forceDark
    ? `text-gray-400 hover:bg-white/10 hover:text-white ${open ? "bg-white/10 text-white" : ""}`
    : `text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white ${open ? "bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white" : ""}`;

  const panelClasses = forceDark
    ? "bg-gray-950 border-white/10"
    : "bg-white border-gray-200 dark:bg-gray-950 dark:border-white/10";

  const suiteLabelClasses = forceDark
    ? "text-gray-500"
    : "text-gray-400 dark:text-gray-500";

  const appNameClasses = forceDark
    ? "text-white"
    : "text-gray-900 dark:text-white";

  const badgeClasses = forceDark
    ? "bg-white/10 text-gray-400"
    : "bg-gray-200 text-gray-500 dark:bg-white/10 dark:text-gray-400";

  const descClasses = forceDark
    ? "text-gray-500"
    : "text-gray-400 dark:text-gray-500";

  const currentRowClasses = forceDark
    ? "bg-white/[0.08] ring-1 ring-white/10"
    : "bg-gray-100 ring-1 ring-gray-200 dark:bg-white/[0.08] dark:ring-white/10";

  const hoverRowClasses = forceDark
    ? "hover:bg-white/[0.06]"
    : "hover:bg-gray-50 dark:hover:bg-white/[0.06]";

  const chevronClasses = forceDark
    ? "text-gray-600 group-hover:text-gray-400"
    : "text-gray-300 group-hover:text-gray-500 dark:text-gray-600 dark:group-hover:text-gray-400";

  const footerBorderClasses = forceDark
    ? "border-white/5"
    : "border-gray-100 dark:border-white/5";

  const footerLinkClasses = forceDark
    ? "text-gray-500 hover:text-gray-300"
    : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300";

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={open ? "synozur-app-menu" : undefined}
        className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${triggerClasses}`}
        title="Synozur Apps"
        aria-label="Synozur Apps"
        data-testid="button-synozur-app-switcher"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
          <rect x="1" y="1" width="4" height="4" rx="0.8" />
          <rect x="6" y="1" width="4" height="4" rx="0.8" />
          <rect x="11" y="1" width="4" height="4" rx="0.8" />
          <rect x="1" y="6" width="4" height="4" rx="0.8" />
          <rect x="6" y="6" width="4" height="4" rx="0.8" />
          <rect x="11" y="6" width="4" height="4" rx="0.8" />
          <rect x="1" y="11" width="4" height="4" rx="0.8" />
          <rect x="6" y="11" width="4" height="4" rx="0.8" />
          <rect x="11" y="11" width="4" height="4" rx="0.8" />
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          id="synozur-app-menu"
          role="menu"
          aria-label="Synozur Suite Applications"
          className={`absolute top-full left-0 mt-2 w-[360px] rounded-xl shadow-2xl border z-[100] overflow-hidden ${panelClasses}`}
          style={{ animation: "fadeIn 0.15s ease-out" }}
        >
          <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>

          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold tracking-[0.2em] uppercase ${suiteLabelClasses}`}>Synozur Suite</span>
            </div>
          </div>

          <div className="px-2 pb-3 space-y-0.5">
            {SYNOZUR_APPS.map((app, index) => {
              const isCurrent = app.id === currentApp;
              const brandColor = getAppColor(index);
              return (
                <a
                  key={app.id}
                  href={isCurrent ? undefined : app.url}
                  target={isCurrent ? undefined : "_blank"}
                  rel={isCurrent ? undefined : "noopener noreferrer"}
                  role="menuitem"
                  onClick={isCurrent ? (e) => { e.preventDefault(); closeMenu(); } : undefined}
                  className={`flex items-start gap-3 px-3 py-2.5 rounded-lg transition-all group cursor-pointer ${
                    isCurrent ? currentRowClasses : hoverRowClasses
                  }`}
                  data-testid={`link-app-${app.id}`}
                >
                  <div
                    className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center mt-0.5"
                    style={{
                      backgroundColor: `${brandColor}15`,
                      color: brandColor,
                    }}
                  >
                    {app.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${appNameClasses}`}>{app.name}</span>
                      {isCurrent && (
                        <span className={`text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-full ${badgeClasses}`}>
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium mt-0.5" style={{ color: brandColor }}>
                      {app.tagline}
                    </p>
                    <p className={`text-[11px] leading-snug mt-0.5 ${descClasses}`}>
                      {app.description}
                    </p>
                  </div>
                  {!isCurrent && (
                    <svg viewBox="0 0 16 16" fill="none" className={`w-3.5 h-3.5 transition-colors mt-1.5 flex-shrink-0 ${chevronClasses}`}>
                      <path d="M5 3L10 8L5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  )}
                </a>
              );
            })}
          </div>

          <div className={`border-t px-4 py-2.5 ${footerBorderClasses}`}>
            <a
              href="https://www.synozur.com/applications"
              target="_blank"
              rel="noopener noreferrer"
              className={`text-[11px] transition-colors ${footerLinkClasses}`}
              data-testid="link-synozur-learn-more"
            >
              Learn more at synozur.com
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
