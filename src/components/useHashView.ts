"use client";

import { useEffect, useRef, useState } from "react";

/** Hash that opens the "How it's calculated" view. Anchors inside that view must also start with "#how". */
export const HOW_HASH = "#how-it-works";

/**
 * Chooses between the planner and the "How it's calculated" view from the URL hash.
 *
 * The formulas view is a full-page view in the same document rather than a separate Next.js route: route
 * changes in a static export download a data file, which the site's Content-Security-Policy (connect-src
 * 'none') blocks, so the browser would fall back to a full reload and lose the numbers held in memory.
 * Hash changes need no network and keep browser Back/Forward working. The hash never contains user data.
 */
export function useHashView(): { view: "planner" | "how"; hash: string } {
  const [hash, setHash] = useState("");
  const plannerScroll = useRef(0);
  const view: "planner" | "how" = hash.startsWith("#how") ? "how" : "planner";

  useEffect(() => {
    let current = window.location.hash;
    setHash(current);
    const onChange = () => {
      const next = window.location.hash;
      if (!current.startsWith("#how") && next.startsWith("#how")) plannerScroll.current = window.scrollY;
      current = next;
      setHash(next);
    };
    window.addEventListener("hashchange", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
    };
  }, []);

  // After the view changes, go to the requested section (or the top of the formulas view), or back to where
  // the user was on the planner.
  useEffect(() => {
    if (view === "how") {
      const target = (hash.length > 1 && document.getElementById(hash.slice(1))) || document.getElementById(HOW_HASH.slice(1));
      target?.scrollIntoView();
      document.title = "How It's Calculated · Tax Conversion Planner";
    } else {
      window.scrollTo(0, plannerScroll.current);
      document.title = "Tax Conversion Planner";
    }
  }, [view, hash]);

  return { view, hash };
}
