import { useEffect } from "react";

const BASE = "Orion | Synozur";

export function usePageTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} | ${BASE}` : BASE;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
