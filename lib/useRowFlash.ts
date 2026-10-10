"use client";

import { useEffect } from "react";

/**
 * When the URL has a #hash that matches a row id (e.g. #inv-<uuid>), scroll that row into view
 * and flash it, so links from other pages land exactly on the row.
 */
export function useRowFlash(deps: unknown[] = []) {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.classList.add("row-flash");
    const t = window.setTimeout(() => el.classList.remove("row-flash"), 4000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
