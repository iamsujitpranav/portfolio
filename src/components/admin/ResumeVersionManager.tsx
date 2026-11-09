"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminAuthError,
  adminDownloadVersionResume,
  adminFetch,
  adminFetchDelete,
  adminFetchPost,
  adminFetchPut,
} from "@/lib/admin";
import type { ResumeData, ResumeVersionDetail, ResumeVersionSummary } from "@/lib/resumeTypes";
import ResumeEditor from "./ResumeEditor";
import ResumePreview from "./ResumePreview";
import { useAdminSession } from "./AdminGate";

type ViewMode = "split" | "editor" | "preview";

export default function ResumeVersionManager() {
  const { signOut } = useAdminSession();

  const [versions, setVersions] = useState<ResumeVersionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [currentVersion, setCurrentVersion] = useState<ResumeVersionDetail | null>(null);
  const [versionData, setVersionData] = useState<ResumeData | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<ViewMode>("split");

  // Determine dirty state
  const isDirty = useMemo(() => {
    if (!versionData || !savedSnapshot) return false;
    return JSON.stringify(versionData) !== savedSnapshot;
  }, [versionData, savedSnapshot]);

  // Compute live label for dropdown of current active version
  const currentLiveLabel = useMemo(() => {
    if (!currentVersion || !versionData) return "";
    const phone = versionData.profile?.phone?.trim() || "no_phone";
    const email = versionData.profile?.email?.trim() || "no_email";
    return `V${currentVersion.versionNumber}_#${phone}_${email}`;
  }, [currentVersion, versionData]);

  // Load versions list
  const loadVersions = useCallback(
    async (selectIdAfterLoad?: string) => {
      try {
        setError("");
        const list = await adminFetch<ResumeVersionSummary[]>("/api/admin/resume/versions");
        setVersions(list);

        const targetId = selectIdAfterLoad || selectedId || list[0]?.id;
        if (targetId) {
          setSelectedId(targetId);
        }
      } catch (err) {
        if (err instanceof AdminAuthError) {
          signOut();
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load resume versions");
      } finally {
        setLoading(false);
      }
    },
    [selectedId, signOut],
  );

  // Load specific version details
  const loadVersionDetail = useCallback(
    async (id: string) => {
      if (!id) return;
      try {
        setLoading(true);
        setError("");
        setSaveSuccess(false);
        const detail = await adminFetch<ResumeVersionDetail>(`/api/admin/resume/versions/${encodeURIComponent(id)}`);
        setCurrentVersion(detail);
        setVersionData(detail.data);
        setSavedSnapshot(JSON.stringify(detail.data));
      } catch (err) {
        if (err instanceof AdminAuthError) {
          signOut();
          return;
        }
        setError(err instanceof Error ? err.message : `Failed to load version ${id}`);
      } finally {
        setLoading(false);
      }
    },
    [signOut],
  );

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  useEffect(() => {
    if (selectedId) {
      loadVersionDetail(selectedId);
    }
  }, [selectedId, loadVersionDetail]);

  // Handle switching version
  const handleSelectVersion = (nextId: string) => {
    if (isDirty) {
      const confirmDiscard = window.confirm("You have unsaved changes. Switch version anyway?");
      if (!confirmDiscard) return;
    }
    setSelectedId(nextId);
  };

  // Create new version
  const handleCreateVersion = async () => {
    try {
      setLoading(true);
      setError("");
      const created = await adminFetchPost<ResumeVersionDetail>("/api/admin/resume/versions", {
        sourceId: selectedId || undefined,
      });
      await loadVersions(created.id);
    } catch (err) {
      if (err instanceof AdminAuthError) {
        signOut();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to create version");
      setLoading(false);
    }
  };

  // Delete version
  const handleDeleteVersion = async () => {
    if (versions.length <= 1) {
      alert("Cannot delete the only resume version.");
      return;
    }
    const confirmDelete = window.confirm(
      `Are you sure you want to delete ${currentLiveLabel || selectedId}? This cannot be undone.`,
    );
    if (!confirmDelete) return;

    try {
      setLoading(true);
      setError("");
      await adminFetchDelete(`/api/admin/resume/versions/${encodeURIComponent(selectedId)}`);
      const remaining = versions.filter((v) => v.id !== selectedId);
      const nextId = remaining[0]?.id;
      await loadVersions(nextId);
    } catch (err) {
      if (err instanceof AdminAuthError) {
        signOut();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to delete version");
      setLoading(false);
    }
  };

  // Save changes
  const handleSave = async () => {
    if (!selectedId || !versionData) return;
    try {
      setSaving(true);
      setError("");
      setSaveSuccess(false);

      const updated = await adminFetchPut<ResumeVersionDetail>(
        `/api/admin/resume/versions/${encodeURIComponent(selectedId)}`,
        versionData,
      );

      setCurrentVersion(updated);
      setVersionData(updated.data);
      setSavedSnapshot(JSON.stringify(updated.data));
      setSaveSuccess(true);

      // Refresh version list to update timestamp and label
      const list = await adminFetch<ResumeVersionSummary[]>("/api/admin/resume/versions");
      setVersions(list);

      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      if (err instanceof AdminAuthError) {
        signOut();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to save version");
    } finally {
      setSaving(false);
    }
  };

  // Download PDF
  const handleDownload = async () => {
    if (!selectedId || !currentVersion) return;
    if (isDirty) {
      const confirmSaveFirst = window.confirm(
        "You have unsaved changes. Save before downloading to include them in the PDF?",
      );
      if (confirmSaveFirst) {
        await handleSave();
      }
    }

    try {
      setDownloading(true);
      setError("");
      const safeLabel = (currentLiveLabel || currentVersion.label).replace(/[^a-zA-Z0-9_.-]/g, "_");
      await adminDownloadVersionResume(selectedId, `Sujit-Pranav-Reddy-Resume-${safeLabel}.pdf`);
    } catch (err) {
      if (err instanceof AdminAuthError) {
        signOut();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to download resume PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="admWrap resManagerWrap">
      {/* Top action toolbar */}
      <div className="resToolbar">
        <div className="resToolbarLeft">
          <label className="resVersionSelectLabel">
            <span>Version:</span>
            <select
              value={selectedId}
              onChange={(e) => handleSelectVersion(e.target.value)}
              className="resVersionSelect"
              disabled={loading || saving}
            >
              {versions.map((v) => {
                const label = v.id === selectedId && currentLiveLabel ? currentLiveLabel : v.label;
                return (
                  <option key={v.id} value={v.id}>
                    {label}
                  </option>
                );
              })}
            </select>
          </label>

          <button
            type="button"
            onClick={handleCreateVersion}
            className="admSmallBtn"
            disabled={loading || saving}
            title="Create a new version cloned from current"
          >
            + New Version
          </button>

          {versions.length > 1 && (
            <button
              type="button"
              onClick={handleDeleteVersion}
              className="admSmallBtn danger"
              disabled={loading || saving}
              title="Delete current version"
            >
              Delete
            </button>
          )}
        </div>

        <div className="resToolbarCenter">
          <div className="resViewModes" role="group" aria-label="View mode">
            <button
              type="button"
              className={viewMode === "split" ? "active" : ""}
              onClick={() => setViewMode("split")}
            >
              Split View
            </button>
            <button
              type="button"
              className={viewMode === "editor" ? "active" : ""}
              onClick={() => setViewMode("editor")}
            >
              Editor Only
            </button>
            <button
              type="button"
              className={viewMode === "preview" ? "active" : ""}
              onClick={() => setViewMode("preview")}
            >
              Live Preview
            </button>
          </div>
        </div>

        <div className="resToolbarRight">
          {isDirty && <span className="resDirtyBadge">● Unsaved Changes</span>}
          {saveSuccess && <span className="resSuccessBadge">✓ Saved!</span>}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="admPrimary"
          >
            {saving ? "Saving…" : "Save Version"}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading || loading}
            className="admDownloadBtn"
          >
            {downloading ? "Building PDF…" : "Download Résumé (PDF)"}
          </button>
        </div>
      </div>

      {error && <div className="admErrorBanner">{error}</div>}

      {/* Main Workspace */}
      {loading && !versionData ? (
        <div className="resLoading">Loading resume version…</div>
      ) : versionData ? (
        <div className={`resWorkspace view-${viewMode}`}>
          {viewMode !== "preview" && (
            <div className="resWorkspaceCol editorCol">
              <ResumeEditor data={versionData} onChange={setVersionData} />
            </div>
          )}

          {viewMode !== "editor" && (
            <div className="resWorkspaceCol previewCol">
              <div className="resPreviewContainer">
                <div className="resPreviewTopBar">
                  <span>ATS-Friendly Recruiter Format (A4)</span>
                  <span className="resSyncIndicator">⚡ Real-time synced</span>
                </div>
                <ResumePreview data={versionData} />
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
