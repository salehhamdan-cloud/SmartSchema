import React, { useState, useMemo, useEffect } from 'react';
import QRCode from 'qrcode';
import { Project, ProjectShareConfig } from '../types';
import { generateShareUrl } from '../utils/shareUtils';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProject: Project;
  allProjects: Project[];
  onUpdateProject?: (updatedProject: Project) => void;
  t: any;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  activeProject,
  allProjects,
  onUpdateProject,
  t
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(activeProject?.id || '');
  const [shareScope, setShareScope] = useState<'current' | 'all'>('current');
  const [copiedView, setCopiedView] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    if (activeProject?.id && !selectedProjectId) {
      setSelectedProjectId(activeProject.id);
    }
  }, [activeProject?.id, selectedProjectId]);

  const selectedProject = useMemo(() => {
    return allProjects.find(p => p.id === selectedProjectId) || activeProject;
  }, [allProjects, selectedProjectId, activeProject]);

  const shareConfig: ProjectShareConfig = useMemo(() => {
    return selectedProject.shareConfig || {
      enabled: true,
      shareToken: selectedProject.id ? `st_${selectedProject.id.slice(0, 8)}` : 'st_default'
    };
  }, [selectedProject]);

  const isLinkEnabled = shareConfig.enabled !== false;

  const handleToggleLinkStatus = () => {
    if (!onUpdateProject) return;
    const newEnabled = !isLinkEnabled;
    const updated: Project = {
      ...selectedProject,
      shareConfig: {
        ...shareConfig,
        enabled: newEnabled,
        revokedAt: newEnabled ? undefined : new Date().toISOString()
      }
    };
    onUpdateProject(updated);
  };

  const handleRevokeAndRegenerate = () => {
    if (!onUpdateProject) return;
    if (window.confirm(t.share?.revokeConfirm || "Are you sure you want to revoke previous links? Any link you previously shared will immediately be invalidated.")) {
      const newToken = `st_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
      const updated: Project = {
        ...selectedProject,
        shareConfig: {
          ...shareConfig,
          enabled: true,
          shareToken: newToken,
          revokedAt: undefined
        }
      };
      onUpdateProject(updated);
    }
  };

  const handleExpirationChange = (duration: string) => {
    if (!onUpdateProject) return;
    let expiresAt: string | undefined = undefined;
    const now = Date.now();
    if (duration === '1h') expiresAt = new Date(now + 60 * 60 * 1000).toISOString();
    else if (duration === '24h') expiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    else if (duration === '7d') expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    else if (duration === '30d') expiresAt = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();

    const updated: Project = {
      ...selectedProject,
      shareConfig: {
        ...shareConfig,
        expiresAt
      }
    };
    onUpdateProject(updated);
  };

  const handlePasswordChange = (password: string) => {
    if (!onUpdateProject) return;
    const updated: Project = {
      ...selectedProject,
      shareConfig: {
        ...shareConfig,
        password: password.trim() ? password.trim() : undefined
      }
    };
    onUpdateProject(updated);
  };

  // Generate highly compressed Clean View-Only URL
  const { viewOnlyUrl, urlSizeKb } = useMemo(() => {
    try {
      const dataToExport = shareScope === 'current' ? selectedProject : allProjects;
      const { viewOnlyUrl, sizeKb } = generateShareUrl(dataToExport);

      return {
        viewOnlyUrl,
        urlSizeKb: sizeKb
      };
    } catch (e) {
      console.error("Failed to generate share URL", e);
      return { viewOnlyUrl: '', urlSizeKb: '0' };
    }
  }, [shareScope, selectedProject, allProjects]);

  // Generate QR Code data URL with optimized settings
  useEffect(() => {
    if (viewOnlyUrl) {
      setQrError(null);
      setQrDataUrl('');
      QRCode.toDataURL(viewOnlyUrl, {
        width: 280,
        margin: 2,
        errorCorrectionLevel: 'L',
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      })
      .then(url => {
        setQrDataUrl(url);
        setQrError(null);
      })
      .catch(err => {
        console.warn("QR code generation notice:", err);
        setQrError("Data payload exceeds QR limits. Please copy the clean share link directly.");
      });
    }
  }, [viewOnlyUrl]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedView(true);
      setTimeout(() => setCopiedView(false), 2500);
    });
  };

  const downloadQrCode = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `${selectedProject.name.toLowerCase().replace(/\s+/g, '-')}-qr.png`;
    link.click();
  };

  const currentDurationKey = () => {
    if (!shareConfig.expiresAt) return 'never';
    const diffHours = (new Date(shareConfig.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60);
    if (diffHours <= 1.5) return '1h';
    if (diffHours <= 25) return '24h';
    if (diffHours <= 170) return '7d';
    return '30d';
  };

  const getProjectNodeCount = (p: Project) => {
    let count = 0;
    const countNodes = (n: any) => {
      if (!n) return;
      count++;
      if (n.children && Array.isArray(n.children)) n.children.forEach(countNodes);
    };
    (p.pages || []).forEach(pg => (pg.items || []).forEach(countNodes));
    return count;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 text-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <span className="material-icons-round text-2xl">share</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {t.share?.title || "Share View-Only Link"}
              </h3>
              <p className="text-xs text-slate-400">
                {t.share?.subtitle || "Create clean, interactive view-only links without editing or cloning capabilities."}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <span className="material-icons-round">close</span>
          </button>
        </div>

        {/* Project Selector Section */}
        <div className="p-3 bg-slate-950/90 rounded-xl border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <span className="material-icons-round text-blue-400 text-sm">folder_open</span>
              <span>{t.share?.selectProjectToShare || "Select Project to Share"}</span>
            </label>
            <span className="text-[11px] text-slate-400">
              {allProjects.length} {allProjects.length === 1 ? 'project' : 'projects'} available
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1 sm:col-span-2">
              <select
                value={selectedProjectId}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value);
                  setShareScope('current');
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                {allProjects.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    {proj.name} ({proj.pages?.length || 1} {proj.pages?.length === 1 ? 'page' : 'pages'}, {getProjectNodeCount(proj)} nodes)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Scope Selector (Chosen Project vs Entire Workspace) */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShareScope('current')}
              className={`flex-1 py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold transition-all cursor-pointer ${
                shareScope === 'current'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-850 border border-slate-800'
              }`}
            >
              <span className="material-icons-round text-sm">folder</span>
              <span className="truncate">{selectedProject.name} only</span>
            </button>
            <button
              type="button"
              onClick={() => setShareScope('all')}
              className={`flex-1 py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold transition-all cursor-pointer ${
                shareScope === 'all'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-850 border border-slate-800'
              }`}
            >
              <span className="material-icons-round text-sm">inventory_2</span>
              <span>All Projects ({allProjects.length})</span>
            </button>
          </div>
        </div>

        {/* Link Status & Master Kill-Switch */}
        <div className={`p-3.5 rounded-xl border transition-all ${
          isLinkEnabled 
            ? 'bg-slate-800/70 border-emerald-500/40' 
            : 'bg-red-950/40 border-red-500/50'
        }`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isLinkEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
              }`}>
                <span className="material-icons-round text-lg">
                  {isLinkEnabled ? 'link' : 'link_off'}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">
                    {t.share?.linkStatus || "Link Access Status"}:
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    isLinkEnabled 
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-600/50' 
                      : 'bg-red-950 text-red-300 border border-red-600/50'
                  }`}>
                    {isLinkEnabled 
                      ? (t.share?.active || "Active & Accessible") 
                      : (t.share?.disabled || "Disabled / Revoked")}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isLinkEnabled 
                    ? "Link is currently active and can be opened by viewers in read-only mode."
                    : (t.share?.linkDisabledBanner || "Sharing is currently DISABLED. Viewers will see an Access Denied screen.")}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleLinkStatus}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shrink-0 cursor-pointer ${
                isLinkEnabled
                  ? 'bg-red-600/90 hover:bg-red-500 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              <span className="material-icons-round text-sm">
                {isLinkEnabled ? 'block' : 'check_circle'}
              </span>
              <span>
                {isLinkEnabled 
                  ? (t.share?.disableLink || "Disable Link") 
                  : (t.share?.enableLink || "Enable Link")}
              </span>
            </button>
          </div>
        </div>

        {/* Primary Clean View-Only URL Card */}
        <div className={`p-4 rounded-xl border shadow-inner space-y-3 transition-opacity ${
          isLinkEnabled 
            ? 'bg-slate-800/80 border-emerald-500/40' 
            : 'bg-slate-900/60 border-slate-800 opacity-60'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isLinkEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
              <span className="text-sm font-bold text-emerald-300">
                {t.share?.readOnlyLinkTitle || "Clean View-Only Link (Strictly Protected)"}
              </span>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-700/50 uppercase">
              {t.share?.recommended || "View-Only"} (~{urlSizeKb} KB)
            </span>
          </div>

          <p className="text-xs text-slate-300">
            {t.share?.readOnlyDesc || "Allows the recipient to view, zoom, pan, search, filter nodes, and export diagrams. Editing, cloning, and modifying project data are completely disabled."}
          </p>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={viewOnlyUrl}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 select-all focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={() => copyToClipboard(viewOnlyUrl)}
              className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shrink-0 ${
                copiedView
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
              }`}
            >
              <span className="material-icons-round text-sm">
                {copiedView ? 'check' : 'content_copy'}
              </span>
              <span>{copiedView ? (t.share?.copied || "Copied!") : (t.share?.copyLink || "Copy Link")}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowQrCode(!showQrCode)}
              className={`p-2 rounded-lg border transition-colors flex items-center gap-1 text-xs font-semibold ${
                showQrCode 
                  ? 'bg-blue-600 text-white border-blue-500 shadow-md' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
              }`}
              title={showQrCode ? (t.share?.hideQr || "Hide QR Code") : (t.share?.showQr || "Show Mobile QR")}
            >
              <span className="material-icons-round text-base">qr_code_2</span>
            </button>
            <a
              href={viewOnlyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white border border-slate-600 transition-colors"
              title={t.share?.testLink || "Test in new tab"}
            >
              <span className="material-icons-round text-base">open_in_new</span>
            </a>
          </div>

          {/* Mobile QR Code Card */}
          {showQrCode && (
            <div className="mt-3 p-4 bg-slate-950 rounded-xl border border-slate-700/80 flex flex-col sm:flex-row items-center gap-4 animate-fadeIn">
              {qrDataUrl ? (
                <div className="bg-white p-2.5 rounded-xl shadow-lg shrink-0">
                  <img
                    src={qrDataUrl}
                    alt="Project Share QR Code"
                    className="w-36 h-36 object-contain rounded"
                  />
                </div>
              ) : qrError ? (
                <div className="w-36 h-36 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center p-3 text-center text-xs text-amber-400">
                  {qrError}
                </div>
              ) : (
                <div className="w-36 h-36 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-xs text-slate-400 animate-pulse">
                  Generating QR...
                </div>
              )}

              <div className="flex-1 space-y-2 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-1.5 text-sm font-bold text-white">
                  <span className="material-icons-round text-blue-400 text-base">smartphone</span>
                  <span>{t.share?.qrCodeTitle || "Mobile QR Code"}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t.share?.qrCodeDesc || "Scan with any smartphone camera to open the read-only diagram directly on your phone or tablet."}
                </p>
                {qrDataUrl && (
                  <div className="pt-1 flex flex-wrap gap-2 justify-center sm:justify-start">
                    <button
                      type="button"
                      onClick={downloadQrCode}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <span className="material-icons-round text-sm">download</span>
                      <span>{t.share?.downloadQr || "Download QR Image"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(viewOnlyUrl)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900/80 border border-emerald-700/50 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <span className="material-icons-round text-sm">{copiedView ? 'check' : 'content_copy'}</span>
                      <span>{copiedView ? (t.share?.copied || "Copied!") : (t.share?.copyLink || "Copy Link")}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Revocation & Access Protection Options Toggle */}
        <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="material-icons-round text-blue-400 text-base">security</span>
              <span>Access Control & Revocation Options</span>
            </div>
            <span className="material-icons-round text-sm text-slate-400">
              {showAdvanced ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {showAdvanced && (
            <div className="p-4 border-t border-slate-800/80 space-y-4 text-xs">
              {/* Revoke Key */}
              <div className="flex items-center justify-between gap-3 bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                <div>
                  <div className="font-bold text-slate-200">
                    {t.share?.revokeAndRegenerate || "Revoke Previous Links (Regenerate Key)"}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Instantly invalidates all URLs previously shared for this project by generating a fresh security token.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRevokeAndRegenerate}
                  className="px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600 border border-amber-500/40 text-amber-300 hover:text-white font-bold transition-all shrink-0 flex items-center gap-1"
                >
                  <span className="material-icons-round text-sm">refresh</span>
                  <span>Revoke Key</span>
                </button>
              </div>

              {/* Expiration Settings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <span className="material-icons-round text-xs text-blue-400">timer</span>
                    {t.share?.setExpiration || "Link Expiration"}
                  </label>
                  <select
                    value={currentDurationKey()}
                    onChange={(e) => handleExpirationChange(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="never">{t.share?.expNever || "Never (Permanent)"}</option>
                    <option value="1h">{t.share?.exp1Hour || "1 Hour"}</option>
                    <option value="24h">{t.share?.exp24Hours || "24 Hours"}</option>
                    <option value="7d">{t.share?.exp7Days || "7 Days"}</option>
                    <option value="30d">{t.share?.exp30Days || "30 Days"}</option>
                  </select>
                </div>

                {/* Optional Passcode */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <span className="material-icons-round text-xs text-blue-400">pin</span>
                    {t.share?.setPassword || "Access Passcode / PIN (Optional)"}
                  </label>
                  <input
                    type="text"
                    placeholder={t.share?.passwordPlaceholder || "e.g. 4-digit PIN"}
                    value={shareConfig.password || ''}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Security & GitHub Pages Notice */}
        <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-800/40 text-xs text-blue-300 flex items-start gap-2.5">
          <span className="material-icons-round text-blue-400 text-base shrink-0 mt-0.5">verified_user</span>
          <div>
            <span className="font-bold">{t.share?.githubPagesNoteTitle || "Clean & Protected:"} </span>
            <span className="text-slate-300">
              {t.share?.githubPagesNoteDesc || "The recipient will have a clean, view-only experience with full interactive zooming and filtering without any cloning, copying, or editing tools."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
