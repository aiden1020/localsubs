"use client";

import { useEffect, useState, type ReactNode } from "react";

// The sticky header goes dark while it sits over a dark section (the hero
// and the translation-quality section) and uses the paper style elsewhere.
export function SiteHeader({ children }: { children: ReactNode }) {
  const [onDark, setOnDark] = useState(true);

  useEffect(() => {
    const sections = [...document.querySelectorAll("[data-nav-dark]")];
    if (sections.length === 0) return;
    const under = new Set<Element>();
    // Watch a strip just under the header; the very top edge is covered by
    // the header itself.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) under.add(entry.target);
          else under.delete(entry.target);
        }
        setOnDark(under.size > 0);
      },
      { rootMargin: `-76px 0px -${Math.max(0, window.innerHeight - 90)}px 0px` },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return <header className={`navBar${onDark ? " navOnTheater" : ""}`}>{children}</header>;
}
