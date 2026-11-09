"use client";

import Link from "next/link";
import { useAdminSession } from "./AdminGate";

export default function AdminNav({ active }: { active: "resume" | "analytics" | "resume-activity" }) {
  const { signOut } = useAdminSession();

  return (
    <nav className="admNav">
      <div className="admNavTabs">
        <Link
          href="/admin/resume-activity"
          className={`admNavTab ${active === "resume-activity" ? "active" : ""}`}
        >
          <span>Résumé Activity</span>
        </Link>
        <Link
          href="/admin/resume"
          className={`admNavTab ${active === "resume" ? "active" : ""}`}
        >
          <span>Résumé Versions</span>
        </Link>
        <Link
          href="/admin/analytics"
          className={`admNavTab ${active === "analytics" ? "active" : ""}`}
        >
          <span>Journey Analytics</span>
        </Link>
      </div>
      <div className="admNavActions">
        <Link href="/" className="admNavPublicLink" target="_blank" rel="noopener noreferrer">
          View Live Site ↗
        </Link>
        <button type="button" onClick={signOut} className="admNavSignOut">
          Sign out
        </button>
      </div>
    </nav>
  );
}
