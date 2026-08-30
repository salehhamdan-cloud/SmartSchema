import React, { useState, useMemo } from 'react';
import { Project, VersionSnapshot, ElectricalNode, ComponentType } from '../types';
import { COMPONENT_CONFIG } from '../constants';
import { LegendIcon } from './LegendIcon';

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  versionHistory: VersionSnapshot[];
  onRevertSnapshot: (snapshot: VersionSnapshot) => void;
  onCreateManualSnapshot: (customLabel?: string) => void;
  onDeleteSnapshot: (snapshotId: string) => void;
  onClearHistory: () => void;
  currentProject: Project;
  allProjects: Project[];
  t: any;
  isDark?: boolean;
  isRTL?: boolean;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  isOpen,
  onClose,
  versionHistory,
  onRevertSnapshot,
  onCreateManualSnapshot,
  onDeleteSnapshot,
  onClearHistory,
  currentProject,
  allProjects,
  t,
  isDark = true,
  isRTL = false
}) => {
  const [expandedSnapshotId, setExpandedSnapshotId] = useState<string | null>(null);
  const [customNote, setCustomNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [confirmRevertSnapshot, setConfirmRevertSnapshot] = useState<VersionSnapshot | null>(null);

  const vt = t.versionHistory || {
    title: "Version History",
    subtitle: "Review and revert to previous project snapshots (Last 10 saves preserved)",
    openButton: "Version History",
    currentBadge: "Current State",
    snapshotBadge: "Snapshot",
    totalSnapshots: "Snapshots Saved",
    maxLimit: "Max 10 saves stored locally",
    revertButton: "Revert to this Version",
    revertConfirmTitle: "Revert to Previous Snapshot?",
    revertConfirmMessage: "Are you sure you want to revert your project to the snapshot from {time}? Your current unsaved changes will be saved to Undo history before reverting.",
    createSnapshot: "Save Snapshot Now",
    snapshotLabelPlaceholder: "Custom note (e.g., Before rewiring Substation B)...",
    deleteSnapshot: "Delete Snapshot",
    deleteConfirm: "Are you sure you want to remove this snapshot from history?",
    clearHistory: "Clear All History",
    clearHistoryConfirm: "Are you sure you want to clear all version history snapshots? (Your current project data will not be affected)",
    exportSnapshot: "Export Snapshot (.json)",
    previewStructure: "Preview Structure",
    hidePreview: "Hide Preview",
    emptyHistory: "No saved versions yet. Snapshots will appear automatically whenever you make changes and save.",
    projectCount: "Projects",
    pageCount: "Pages",
    nodeCount: "Components",
    activeProject: "Active Project",
    saveTypeAuto: "Auto-Saved",
    saveTypeManual: "Manual Snapshot",
    saveTypeImport: "Imported"
  };

  const countNodes = (items: ElectricalNode[]): number => {
    let count = 0;
    const traverse = (node: ElectricalNode) => {
      count++;
      if (node.children) node.children.forEach(traverse);
    };
    items.forEach(traverse);
    return count;
  };

  const currentTotalNodes = useMemo(() => {
    let total = 0;
    allProjects.forEach(p => {
      p.pages.forEach(page => {
        total += countNodes(page.items);
      });
    });
    return total;
  }, [allProjects]);

  const handleExportSnapshot = (snapshot: VersionSnapshot, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(snapshot.projects, null, 2));
      const downloadAnchor = document.createElement('a');
      const filename = `smartschema_backup_${snapshot.activeProjectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${snapshot.formattedDate.replace(/[^a-z0-9]/gi, '_')}.json`;
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err: any) {
      alert("Error exporting snapshot: " + err.message);
    }
  };

  const handleSaveManual = () => {
    onCreateManualSnapshot(customNote.trim() || undefined);
    setCustomNote('');
    setShowNoteInput(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn overflow-y-auto">
      <div 
        className={`bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl max-w-3xl w-full flex flex-col max-h-[90vh] relative overflow-hidden transition-all text-white ${isRTL ? 'rtl' : 'ltr'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Decorative accent line */}
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-indigo-500 to-sky-400"></div>

        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white">
              <span className="material-icons-round text-2xl">history</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">{vt.title}</h2>
                <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
                  {versionHistory.length} / 10 {vt.totalSnapshots || "Saves"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{vt.subtitle}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title={t.inputPanel?.close || "Close"}
          >
            <span className="material-icons-round text-lg">close</span>
          </button>
        </div>

        {/* Actions Bar (Save Snapshot / Clear History) */}
        <div className="px-6 py-3 bg-slate-800/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
            {showNoteInput ? (
              <div className="flex items-center gap-1.5 flex-1 animate-fadeIn">
                <input
                  type="text"
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveManual();
                    if (e.key === 'Escape') setShowNoteInput(false);
                  }}
                  placeholder={vt.snapshotLabelPlaceholder}
                  autoFocus
                  className="flex-1 bg-slate-900 border border-indigo-500/50 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-500"
                />
                <button
                  onClick={handleSaveManual}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors flex items-center gap-1 shrink-0"
                >
                  <span className="material-icons-round text-sm">save</span>
                  <span>{t.save || "Save"}</span>
                </button>
                <button
                  onClick={() => setShowNoteInput(false)}
                  className="px-2 py-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors shrink-0"
                >
                  <span className="material-icons-round text-sm">close</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowNoteInput(true)}
                className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white rounded-lg font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-900/30 transition-all hover:scale-[1.01]"
              >
                <span className="material-icons-round text-sm">bookmark_add</span>
                <span>{vt.createSnapshot}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 text-slate-400 text-[11px]">
            <span className="hidden sm:inline text-slate-400">
              {vt.maxLimit}
            </span>
            {versionHistory.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm(vt.clearHistoryConfirm)) {
                    onClearHistory();
                  }
                }}
                className="text-rose-400 hover:text-rose-300 hover:underline flex items-center gap-1"
                title={vt.clearHistory}
              >
                <span className="material-icons-round text-xs">delete_sweep</span>
                <span>{vt.clearHistory}</span>
              </button>
            )}
          </div>
        </div>

        {/* Modal Body: Snapshots Timeline */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-3.5">
          {/* Current Working State Info Banner */}
          <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <div>
                <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <span>{vt.currentBadge}</span>
                  <span className="text-[10px] font-normal text-indigo-300 bg-indigo-500/20 px-1.5 py-0.5 rounded">
                    {currentProject?.name || "Untitled"}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {allProjects.length} {vt.projectCount} • {allProjects.reduce((a, b) => a + b.pages.length, 0)} {vt.pageCount} • {currentTotalNodes} {vt.nodeCount}
                </div>
              </div>
            </div>
            <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              Live
            </span>
          </div>

          {/* Empty State */}
          {versionHistory.length === 0 && (
            <div className="py-12 px-4 text-center flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500 mb-3 border border-slate-700">
                <span className="material-icons-round text-3xl text-slate-400">history_toggle_off</span>
              </div>
              <h3 className="text-sm font-semibold text-slate-300 mb-1">{vt.emptyHistory}</h3>
              <p className="text-xs text-slate-400 max-w-sm mb-4">
                Whenever you add components, modify ratings, or save your diagrams, SmartSchema automatically saves snapshots here so you can easily revert anytime.
              </p>
              <button
                onClick={() => onCreateManualSnapshot()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md"
              >
                <span className="material-icons-round text-sm">bookmark_add</span>
                <span>{vt.createSnapshot}</span>
              </button>
            </div>
          )}

          {/* Snapshots List */}
          {versionHistory.map((snap, index) => {
            const isExpanded = expandedSnapshotId === snap.id;
            const isLatest = index === 0;

            const totalNodesInSnap = snap.nodeCount ?? snap.projects.reduce((acc, p) => {
              return acc + p.pages.reduce((pAcc, pg) => pAcc + countNodes(pg.items), 0);
            }, 0);

            const totalPagesInSnap = snap.pageCount ?? snap.projects.reduce((acc, p) => acc + p.pages.length, 0);

            // Compute component types distribution in this snapshot
            const typeCounts: Record<string, number> = {};
            snap.projects.forEach(p => {
              p.pages.forEach(pg => {
                const scan = (n: ElectricalNode) => {
                  typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
                  n.children.forEach(scan);
                };
                pg.items.forEach(scan);
              });
            });

            return (
              <div 
                key={snap.id}
                className={`bg-slate-800/80 hover:bg-slate-800 border transition-all rounded-xl overflow-hidden ${
                  isLatest ? 'border-indigo-500/50 shadow-md shadow-indigo-950/30' : 'border-slate-700/80'
                }`}
              >
                {/* Snapshot Card Header */}
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      snap.source === 'manual' 
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                        : snap.source === 'import'
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                        : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                    }`}>
                      <span className="material-icons-round text-base">
                        {snap.source === 'manual' ? 'bookmark' : snap.source === 'import' ? 'file_download' : 'save'}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">
                          {snap.formattedTime}
                        </span>
                        <span className="text-xs text-slate-400">
                          ({snap.formattedDate})
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          snap.source === 'manual'
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            : snap.source === 'import'
                            ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                            : 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                        }`}>
                          {snap.source === 'manual' ? vt.saveTypeManual : snap.source === 'import' ? vt.saveTypeImport : vt.saveTypeAuto}
                        </span>
                        {isLatest && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                            #1 Latest Save
                          </span>
                        )}
                      </div>

                      {snap.label && (
                        <div className="text-xs text-amber-200 font-medium mt-1 flex items-center gap-1">
                          <span className="material-icons-round text-[13px] text-amber-400">label</span>
                          <span>{snap.label}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-1.5 flex-wrap">
                        <span className="text-slate-300 font-medium flex items-center gap-1">
                          <span className="material-icons-round text-[14px] text-slate-400">folder</span>
                          {snap.activeProjectName || "Project"}
                        </span>
                        <span>•</span>
                        <span>{snap.projectCount || snap.projects.length} {vt.projectCount}</span>
                        <span>•</span>
                        <span>{totalPagesInSnap} {vt.pageCount}</span>
                        <span>•</span>
                        <span className="text-sky-300 font-semibold">{totalNodesInSnap} {vt.nodeCount}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Column */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      onClick={() => setExpandedSnapshotId(isExpanded ? null : snap.id)}
                      className="px-2.5 py-1.5 bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                      title={isExpanded ? vt.hidePreview : vt.previewStructure}
                    >
                      <span className="material-icons-round text-sm">
                        {isExpanded ? 'expand_less' : 'visibility'}
                      </span>
                      <span className="hidden md:inline">{isExpanded ? vt.hidePreview : vt.previewStructure}</span>
                    </button>

                    <button
                      onClick={(e) => handleExportSnapshot(snap, e)}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                      title={vt.exportSnapshot}
                    >
                      <span className="material-icons-round text-base">download</span>
                    </button>

                    <button
                      onClick={() => {
                        if (window.confirm(vt.deleteConfirm)) {
                          onDeleteSnapshot(snap.id);
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-700 rounded-lg transition-colors"
                      title={vt.deleteSnapshot}
                    >
                      <span className="material-icons-round text-base">delete</span>
                    </button>

                    <button
                      onClick={() => setConfirmRevertSnapshot(snap)}
                      className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-md shadow-sky-900/30"
                    >
                      <span className="material-icons-round text-sm">restore</span>
                      <span>{vt.revertButton}</span>
                    </button>
                  </div>
                </div>

                {/* Expanded Preview Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 bg-slate-900/80 border-t border-slate-700/60 text-xs animate-fadeIn space-y-3">
                    <div className="pt-2">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <span className="material-icons-round text-xs text-sky-400">category</span>
                        {vt.componentsSummary || "Components Breakdown"}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(typeCounts).map(([type, count]) => {
                          const conf = COMPONENT_CONFIG[type as ComponentType] || { icon: 'help', color: '#94a3b8' };
                          return (
                            <div 
                              key={type}
                              className="px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg flex items-center gap-1.5 text-[11px]"
                            >
                              <LegendIcon icon={conf.icon} color={conf.color} size={12} />
                              <span className="text-slate-300">{t.componentTypes[type] || type}:</span>
                              <span className="font-bold text-white">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <span className="material-icons-round text-xs text-indigo-400">auto_stories</span>
                        {vt.projectCount} & {vt.pageCount}
                      </div>
                      <div className="space-y-1.5">
                        {snap.projects.map((proj) => (
                          <div key={proj.id} className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/50">
                            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                              <span className="material-icons-round text-xs text-indigo-400">folder</span>
                              {proj.name}
                            </div>
                            <div className="pl-4 mt-1 space-y-0.5">
                              {proj.pages.map((pg) => {
                                const nCnt = countNodes(pg.items);
                                return (
                                  <div key={pg.id} className="text-[11px] text-slate-400 flex items-center justify-between">
                                    <span>• {pg.name}</span>
                                    <span className="text-slate-500 font-mono text-[10px]">{nCnt} items</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="material-icons-round text-sm text-sky-400">info</span>
            <span>{vt.maxLimit}</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors"
          >
            {t.inputPanel?.close || "Close"}
          </button>
        </div>
      </div>

      {/* Confirmation Sub-Modal for Revert */}
      {confirmRevertSnapshot && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <div className="w-12 h-12 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-2xl">restore</span>
            </div>

            <h3 className="text-base font-bold text-white text-center mb-2">
              {vt.revertConfirmTitle}
            </h3>

            <p className="text-xs text-slate-300 text-center leading-relaxed mb-6">
              {vt.revertConfirmMessage.replace('{time}', `${confirmRevertSnapshot.formattedTime} (${confirmRevertSnapshot.formattedDate})`)}
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setConfirmRevertSnapshot(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors"
              >
                {t.inputPanel?.close || "Cancel"}
              </button>
              <button
                onClick={() => {
                  const snap = confirmRevertSnapshot;
                  setConfirmRevertSnapshot(null);
                  onRevertSnapshot(snap);
                  onClose();
                }}
                className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-colors shadow-lg shadow-sky-900/40 flex items-center justify-center gap-1.5"
              >
                <span className="material-icons-round text-sm">restore</span>
                <span>{vt.revertButton}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
