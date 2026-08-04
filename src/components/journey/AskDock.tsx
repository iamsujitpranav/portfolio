"use client";

import { useEffect, useRef } from "react";
import AskPanel from "./AskPanel";
import type { AskDest } from "@/lib/journey/ask";

// THE ASSISTANT, SUMMONED.
//
// The résumé terminal is a real object at a real place, and that's the point of
// it — but it also meant the single most useful thing on the site was something
// you had to find. This is the same assistant, brought to wherever the visitor
// is standing: press `/`, ask, and if the answer points at a landmark the walk
// there is one more click.
//
// The terminal is unchanged and still the richer staging (full screen, matrix
// type, the console itself). This is the shortcut, not a replacement.

export default function AskDock({
  open,
  onClose,
  onWalkTo,
  nearby,
}: {
  open: boolean;
  onClose: () => void;
  onWalkTo: (dest: AskDest) => void;
  nearby: { id: string; title: string } | null;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Esc closes it here rather than in the overlay's global handler, so it takes
  // priority over "stop walking" only while the dock is actually up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside className="jrnAskDock" ref={ref} aria-label="Résumé assistant" data-lenis-prevent>
      <header className="jrnAskDockBar">
        <span>
          RÉSUMÉ ASSISTANT
          {nearby ? <em> · standing at {nearby.title}</em> : null}
        </span>
        <button onClick={onClose} aria-label="Close assistant">
          Close <kbd>Esc</kbd>
        </button>
      </header>
      <div className="jrnAskDockBody">
        <AskPanel variant="dock" onWalkTo={onWalkTo} nearby={nearby} />
      </div>
    </aside>
  );
}
