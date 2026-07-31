"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { toggleTheme } from "@/lib/theme";
import { profile } from "@content/resume";
import { useRecruiterMode } from "./RecruiterMode";

type Item = { ic: string; label: string; hint: string; run: () => void };

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { toggle: toggleRecruiterMode } = useRecruiterMode();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-cmdk", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-cmdk", onOpen);
    };
  }, []);

  const go = (hash: string) => {
    setOpen(false);
    if (window.location.pathname !== "/") router.push(`/${hash}`);
    else window.location.hash = hash;
  };

  const items: Item[] = [
    { ic: "01", label: "Intro", hint: "section", run: () => go("#top") },
    { ic: "02", label: "Work / Experience", hint: "section", run: () => go("#work") },
    { ic: "03", label: "The Stack", hint: "section", run: () => go("#skills") },
    { ic: "04", label: "Personal details", hint: "section", run: () => go("#personal") },
    { ic: "05", label: "Ask my résumé (AI chat)", hint: "section", run: () => go("#ask") },
    { ic: "06", label: "Contact", hint: "section", run: () => go("#contact") },
    { ic: "✎", label: "Articles / Blog", hint: "page", run: () => { setOpen(false); router.push("/blog"); } },
    { ic: "@", label: `Email — ${profile.email}`, hint: "mailto", run: () => { window.location.href = `mailto:${profile.email}`; } },
    { ic: "☎", label: `Call — ${profile.phone}`, hint: "tel", run: () => { window.location.href = `tel:${profile.phone.replace(/\s/g, "")}`; } },
    { ic: "◉", label: "Toggle recruiter mode", hint: "view", run: () => { toggleRecruiterMode(); setOpen(false); } },
    { ic: "◑", label: "Toggle light / dark theme", hint: "theme", run: () => { toggleTheme(); setOpen(false); } },
  ];

  if (!open) return null;

  return (
    <div className="cmdkOverlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <Command className="cmdk" label="Command palette" loop>
        <Command.Input autoFocus placeholder="Type a command or search…" />
        <Command.List>
          <Command.Empty>No matching commands</Command.Empty>
          {items.map((it) => (
            <Command.Item key={it.label} value={`${it.label} ${it.hint}`} onSelect={it.run}>
              <span className="ic">{it.ic}</span>
              <span>{it.label}</span>
              <span className="hint">{it.hint}</span>
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
