"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toggleTheme } from "@/lib/theme";
import { useTheme } from "@/lib/useTheme";
import Soundtrack from "./Soundtrack";

const SECTIONS = [
  { id: "top", label: "01 · intro" },
  { id: "work", label: "02 · work" },
  { id: "skills", label: "03 · stack" },
  { id: "personal", label: "04 · details" },
  { id: "ask", label: "05 · ask" },
  { id: "contact", label: "06 · contact" },
];

export default function StatusBar() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [active, setActive] = useState("top");
  const theme = useTheme();

  useEffect(() => {
    if (!isHome) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [isHome]);

  return (
    <div className="statusbar">
      <div className="wrap row">
        <a href={isHome ? "#top" : "/"} className="brand" data-cursor>
          <span className="livedot" /> SUJIT_PRANAV_REDDY
        </a>
        <nav className="navsections">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={isHome ? `#${s.id}` : `/#${s.id}`}
              className={isHome && active === s.id ? "on" : undefined}
              data-cursor
            >
              {s.label}
            </a>
          ))}
          <Link href="/blog" className="bloglink" data-cursor>
            ✎ blog
          </Link>
        </nav>
        <button
          className="iconbtn"
          onClick={() => toggleTheme()}
          aria-label="Toggle light / dark theme"
          data-cursor
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
        <button
          className="kbtn"
          onClick={() => window.dispatchEvent(new CustomEvent("open-cmdk"))}
          aria-label="Open command palette"
          data-cursor
        >
          <kbd>⌘</kbd>
          <kbd>K</kbd> <span className="kbtxt">menu</span>
        </button>
        {/* Same soundtrack the journey plays — one shared <audio> (lib/sound-
            track), so skipping out of the 3D world doesn't cut the music. It
            lives in the bar rather than floating over the page, which also
            carries it to /blog. No hiding rule is needed while the journey is
            up: .jrnRoot is fixed at z-index 900 and covers this bar, and the
            overlay renders its own copy in its top row. */}
        <Soundtrack className="navMusic" />
      </div>
    </div>
  );
}
