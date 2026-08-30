import React, { useState, useEffect, useRef } from 'react';
import { Project } from '../types';
import {
  FolderSyncSettings,
  DiscoveredProjectFile,
  isFileSystemAccessSupported,
  isInsideIframe,
  verifyFolderPermission,
  scanProjectsInDirectory,
  writeProjectsToFolder,
  parseProjectsFromFileList,
  downloadWorkspaceBundleFile,
  downloadProjectFile
} from '../utils/folderStorageService';

interface FolderSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderSettings: FolderSyncSettings;
  directoryHandle: FileSystemDirectoryHandle | null;
  onSelectDirectory: () => Promise<void>;
  onDisconnectFolder: () => void;
  onUpdateSettings: (newSettings: Partial<FolderSyncSettings>) => void;
  currentProjects: Project[];
  onLoadProjectsFromFolder: (projectsToLoad: Project[], mode: 'merge' | 'replace') => void;
  onSaveNowToFolder: () => Promise<boolean>;
  t: any;
  isRTL: boolean;
}

export const FolderSyncModal: React.FC<FolderSyncModalProps> = ({
  isOpen,
  onClose,
  folderSettings,
  directoryHandle,
  onSelectDirectory,
  onDisconnectFolder,
  onUpdateSettings,
  currentProjects,
  onLoadProjectsFromFolder,
  onSaveNowToFolder,
  t,
  isRTL
}) => {
  const [activeTab, setActiveTab] = useState<'sync' | 'projects'>('sync');
  const [discoveredProjects, setDiscoveredProjects] = useState<DiscoveredProjectFile[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info'; action?: { label: string; onClick: () => void } } | null>(null);
  const [loadMode, setLoadMode] = useState<'merge' | 'replace'>('merge');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const fallbackFolderInputRef = useRef<HTMLInputElement>(null);
  const inIframe = isInsideIframe();
  const fsSupported = isFileSystemAccessSupported() && !inIframe;
  const ft = t.folderSync || {};

  const checkPermissionAndScan = async () => {
    if (!directoryHandle) return;
    setIsScanning(true);
    try {
      const permitted = await verifyFolderPermission(directoryHandle, false);
      setHasPermission(permitted);
      if (permitted) {
        const scanRes = await scanProjectsInDirectory(directoryHandle);
        if (scanRes.success) {
          setDiscoveredProjects(scanRes.projectsFound);
        }
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setStatusMessage(null);
      if (directoryHandle) {
        checkPermissionAndScan();
      } else {
        setDiscoveredProjects([]);
      }
    }
  }, [isOpen, directoryHandle]);

  const handleOpenInNewTab = () => {
    try {
      window.open(window.location.href, '_blank');
    } catch (e) {
      console.error("Could not open in new tab", e);
    }
  };

  const handleGrantPermission = async () => {
    if (!directoryHandle) return;
    setIsScanning(true);
    try {
      const granted = await verifyFolderPermission(directoryHandle, true);
      setHasPermission(granted);
      if (granted) {
        setStatusMessage({ text: ft.permissionGranted || 'Folder access granted!', type: 'success' });
        const scanRes = await scanProjectsInDirectory(directoryHandle);
        if (scanRes.success) {
          setDiscoveredProjects(scanRes.projectsFound);
        }
      } else {
        setStatusMessage({ text: ft.statusPermission || 'Permission required to access folder', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err?.message || 'Permission request failed', type: 'error' });
    } finally {
      setIsScanning(false);
    }
  };

  const handleChooseFolder = async () => {
    setStatusMessage(null);
    if (inIframe) {
      // In preview iframe, prompt fallback folder picker or open in new tab
      if (fallbackFolderInputRef.current) {
        fallbackFolderInputRef.current.click();
      }
      return;
    }
    try {
      await onSelectDirectory();
      setStatusMessage({ text: ft.folderConnected || 'Folder connected successfully!', type: 'success' });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setStatusMessage({ 
          text: err?.message || 'Failed to select folder', 
          type: 'error',
          action: inIframe ? { label: ft.openInNewTab || 'Open in Dedicated Tab', onClick: handleOpenInNewTab } : undefined
        });
      }
    }
  };

  const handleManualSave = async () => {
    if (inIframe && !directoryHandle) {
      // Download workspace file directly
      downloadWorkspaceBundleFile(currentProjects);
      setStatusMessage({ text: ft.saveSuccess || 'Workspace backup downloaded!', type: 'success' });
      return;
    }
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const success = await onSaveNowToFolder();
      if (success) {
        setStatusMessage({ text: ft.saveSuccess || 'Successfully saved all projects to folder!', type: 'success' });
        if (directoryHandle) {
          const scanRes = await scanProjectsInDirectory(directoryHandle);
          if (scanRes.success) setDiscoveredProjects(scanRes.projectsFound);
        }
      } else {
        setStatusMessage({ text: ft.statusError || 'Failed to save to folder', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err?.message || 'Error during save', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFallbackFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsScanning(true);
    try {
      const parsed = await parseProjectsFromFileList(files);
      setDiscoveredProjects(parsed);
      setActiveTab('projects');
      if (parsed.length > 0) {
        setStatusMessage({
          text: `Found ${parsed.length} project file(s) in selected folder. Click below to load them into your workspace.`,
          type: 'success'
        });
      } else {
        setStatusMessage({
          text: ft.noProjectsFound || 'No SmartSchema JSON files found in this folder.',
          type: 'info'
        });
      }
    } catch (err: any) {
      setStatusMessage({ text: err?.message || 'Failed to process folder files', type: 'error' });
    } finally {
      setIsScanning(false);
      if (fallbackFolderInputRef.current) fallbackFolderInputRef.current.value = '';
    }
  };

  const handleLoadAllDiscovered = () => {
    const allProjects: Project[] = [];
    discoveredProjects.forEach(dp => {
      dp.projects.forEach(p => {
        if (!allProjects.some(existing => existing.id === p.id)) {
          allProjects.push(p);
        }
      });
    });

    if (allProjects.length === 0) return;
    onLoadProjectsFromFolder(allProjects, loadMode);
    setStatusMessage({ text: ft.loadSuccess || 'Projects loaded successfully!', type: 'success' });
    setTimeout(() => {
      onClose();
    }, 900);
  };

  const handleLoadSingleDiscovered = (dp: DiscoveredProjectFile) => {
    if (dp.projects.length === 0) return;
    onLoadProjectsFromFolder(dp.projects, loadMode);
    setStatusMessage({ text: ft.loadSuccess || 'Project loaded successfully!', type: 'success' });
    setTimeout(() => {
      onClose();
    }, 900);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      {/* Hidden Folder/File Input for iframe & fallback compatibility */}
      <input
        type="file"
        // @ts-ignore
        webkitdirectory=""
        directory=""
        multiple
        ref={fallbackFolderInputRef}
        onChange={handleFallbackFolderUpload}
        className="hidden"
      />

      <div 
        className={`bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden text-slate-100 ${
          isRTL ? 'rtl text-right' : 'ltr text-left'
        }`}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/30">
              <span className="material-icons-round text-2xl">folder_shared</span>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>{ft.title || 'Folder Auto-Save & Sync'}</span>
                {folderSettings.enabled && directoryHandle && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    {ft.statusSynced || 'Active Sync'}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 line-clamp-1">
                {ft.subtitle || 'Auto-save your diagrams and load projects directly to/from your computer folder'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <span className="material-icons-round text-xl">close</span>
          </button>
        </div>

        {/* Status Toast Message */}
        {statusMessage && (
          <div className={`px-6 py-2.5 text-xs flex items-center justify-between gap-2 border-b ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60' 
              : statusMessage.type === 'error'
              ? 'bg-red-950/60 text-red-300 border-red-800/60'
              : 'bg-blue-950/60 text-blue-300 border-blue-800/60'
          }`}>
            <div className="flex items-center gap-2">
              <span className="material-icons-round text-base shrink-0">
                {statusMessage.type === 'success' ? 'check_circle' : statusMessage.type === 'error' ? 'error_outline' : 'info'}
              </span>
              <span className="font-medium">{statusMessage.text}</span>
            </div>
            {statusMessage.action && (
              <button
                onClick={statusMessage.action.onClick}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-semibold shrink-0 cursor-pointer shadow"
              >
                {statusMessage.action.label}
              </button>
            )}
          </div>
        )}

        {/* Iframe Preview Security Notification */}
        {inIframe && (
          <div className="mx-6 mt-4 p-3.5 bg-gradient-to-r from-blue-950/70 to-indigo-950/70 border border-blue-700/50 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-300 flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-icons-round text-base">open_in_new</span>
              </div>
              <div>
                <div className="font-bold text-blue-200">{ft.iframeWarningTitle || 'Preview Frame Mode'}</div>
                <div className="text-[11px] text-blue-300/80 leading-relaxed mt-0.5">
                  {ft.iframeWarningDesc || 'Browser security prevents background disk writing inside embedded frames. Open in a standalone tab for continuous auto-save, or load folder diagrams below.'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleOpenInNewTab}
                className="py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-icons-round text-sm">launch</span>
                <span>{ft.openInNewTab || 'Open in Dedicated Tab'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="px-6 pt-3 flex border-b border-slate-800 gap-2 bg-slate-900/50">
          <button
            onClick={() => setActiveTab('sync')}
            className={`pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'sync'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="material-icons-round text-base">sync</span>
            <span>{ft.title || 'Auto-Save Settings'}</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('projects');
              if (directoryHandle) checkPermissionAndScan();
            }}
            className={`pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'projects'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="material-icons-round text-base">folder_open</span>
            <span>{ft.projectsInFolder || 'Projects in Folder'}</span>
            {discoveredProjects.length > 0 && (
              <span className="text-[10px] bg-blue-500/30 text-blue-300 px-1.5 py-0.2 rounded-full font-mono font-bold">
                {discoveredProjects.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {activeTab === 'sync' ? (
            <>
              {/* Folder Connection Banner */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                      directoryHandle 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}>
                      <span className="material-icons-round text-2xl">
                        {directoryHandle ? 'folder' : 'folder_off'}
                      </span>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 font-medium">
                        {directoryHandle ? (ft.folderConnected || 'Connected Local Folder') : (ft.noFolderSelected || 'No folder connected')}
                      </div>
                      <div className="text-sm sm:text-base font-bold text-white break-all">
                        {directoryHandle ? (folderSettings.folderName || directoryHandle.name) : (ft.noFolderSelected || 'Select a folder to auto-save')}
                      </div>
                      {folderSettings.lastSavedTime && (
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <span className="material-icons-round text-xs text-slate-500">schedule</span>
                          <span>{ft.lastSavedAt || 'Last saved'}: {folderSettings.lastSavedTime}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {fsSupported ? (
                      <button
                        onClick={handleChooseFolder}
                        className="py-2 px-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <span className="material-icons-round text-sm">create_new_folder</span>
                        <span>{directoryHandle ? (ft.changeFolder || 'Change Folder') : (ft.chooseFolder || 'Select Folder')}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => fallbackFolderInputRef.current?.click()}
                        className="py-2 px-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <span className="material-icons-round text-sm">folder_open</span>
                        <span>{ft.browseFolderFallback || 'Select / Load Folder'}</span>
                      </button>
                    )}

                    {directoryHandle && (
                      <button
                        onClick={onDisconnectFolder}
                        className="p-2 text-slate-400 hover:text-red-400 bg-slate-800 hover:bg-slate-800/80 border border-slate-700 rounded-xl text-xs transition-colors cursor-pointer"
                        title={ft.disconnectFolder || 'Disconnect Folder'}
                      >
                        <span className="material-icons-round text-sm">link_off</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Permission Warning if needed */}
                {directoryHandle && hasPermission === false && (
                  <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 flex items-center justify-between gap-3 text-amber-200 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-amber-400">warning</span>
                      <span>{ft.statusPermission || 'Browser permission needed to read and write to this folder.'}</span>
                    </div>
                    <button
                      onClick={handleGrantPermission}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg shrink-0 transition-colors cursor-pointer"
                    >
                      {ft.grantPermission || 'Grant Permission'}
                    </button>
                  </div>
                )}
              </div>

              {/* Toggles & Options */}
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 space-y-4">
                {/* Auto-Save Toggle */}
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800/60">
                  <div>
                    <div className="text-xs sm:text-sm font-semibold text-white">
                      {ft.autoSaveToggle || 'Auto-Save to Local Folder'}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {ft.autoSaveDesc || 'Automatically writes workspace and individual project JSON files whenever changes occur.'}
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={folderSettings.enabled}
                      onChange={(e) => onUpdateSettings({ enabled: e.target.checked })}
                      disabled={!directoryHandle && !inIframe}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-40"></div>
                  </label>
                </div>

                {/* Auto-Load Toggle */}
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800/60">
                  <div>
                    <div className="text-xs sm:text-sm font-semibold text-white">
                      {ft.autoLoadToggle || 'Auto-Load Projects on Launch'}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {ft.autoLoadDesc || 'Checks and loads your saved diagrams automatically whenever you launch SmartSchema.'}
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={folderSettings.autoLoadOnStart}
                      onChange={(e) => onUpdateSettings({ autoLoadOnStart: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Format Info & Instant Backup Buttons */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                      <span className="material-icons-round text-xs text-blue-400">snippet_folder</span>
                      <span>{ft.saveFormats || 'File Formats Saved'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        downloadWorkspaceBundleFile(currentProjects);
                        setStatusMessage({ text: ft.saveSuccess || 'Workspace backup downloaded!', type: 'success' });
                      }}
                      className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium hover:underline cursor-pointer"
                    >
                      <span className="material-icons-round text-xs">file_download</span>
                      <span>{ft.downloadWorkspaceBtn || 'Download JSON Backup'}</span>
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-400 leading-relaxed bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                    <p className="font-mono text-slate-300">📁 smartschema_workspace.json</p>
                    <p className="font-mono text-slate-300 mt-0.5">📁 [Project_Name].smartschema.json</p>
                    <p className="mt-1 text-slate-400">{ft.saveFormatsDesc || 'All files are clean, standard JSON and can be imported, backed up, or shared directly.'}</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleManualSave}
                    disabled={isSaving}
                    className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <span className="material-icons-round text-base">
                      {isSaving ? 'sync' : 'save'}
                    </span>
                    <span>{isSaving ? (ft.statusSaving || 'Saving...') : (directoryHandle ? (ft.saveNow || 'Save Now to Folder') : (ft.downloadWorkspaceBtn || 'Download Backup (JSON)'))}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fallbackFolderInputRef.current?.click()}
                    className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
                    title={ft.browseFolderFallback || 'Select Folder'}
                  >
                    <span className="material-icons-round text-base text-blue-400">folder_open</span>
                    <span>{ft.browseFolderFallback || 'Browse Folder'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('projects');
                    if (directoryHandle) checkPermissionAndScan();
                  }}
                  disabled={!directoryHandle && discoveredProjects.length === 0}
                  className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span className="material-icons-round text-base">manage_search</span>
                  <span>{ft.scanFolder || 'Browse Folder Projects'}</span>
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Projects in folder tab */}
              <div className="space-y-4">
                {/* Top controls: Scan button & Mode selector */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-300">{ft.projectsInFolder || 'Folder Contents'}</span>
                    <button
                      onClick={checkPermissionAndScan}
                      disabled={isScanning || !directoryHandle}
                      className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                      title={ft.scanFolder || 'Scan'}
                    >
                      <span className={`material-icons-round text-sm ${isScanning ? 'animate-spin' : ''}`}>
                        refresh
                      </span>
                    </button>
                  </div>

                  {/* Load mode choice */}
                  <div className="flex items-center gap-2 text-xs">
                    <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                      <input
                        type="radio"
                        name="loadMode"
                        value="merge"
                        checked={loadMode === 'merge'}
                        onChange={() => setLoadMode('merge')}
                        className="text-blue-600 focus:ring-0"
                      />
                      <span>{ft.mergeMode || 'Merge with Workspace'}</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                      <input
                        type="radio"
                        name="loadMode"
                        value="replace"
                        checked={loadMode === 'replace'}
                        onChange={() => setLoadMode('replace')}
                        className="text-blue-600 focus:ring-0"
                      />
                      <span>{ft.replaceMode || 'Replace Workspace'}</span>
                    </label>
                  </div>
                </div>

                {/* List of projects */}
                {isScanning ? (
                  <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <span className="material-icons-round text-3xl animate-spin text-blue-400">autorenew</span>
                    <span className="text-xs font-medium">{ft.refreshing || 'Scanning folder for diagrams...'}</span>
                  </div>
                ) : discoveredProjects.length === 0 ? (
                  <div className="py-12 px-4 border border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-500 mb-3">
                      <span className="material-icons-round text-2xl">folder_off</span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-300 mb-1">
                      {ft.noProjectsFound || 'No SmartSchema project files found in this folder.'}
                    </h3>
                    <p className="text-xs text-slate-400 max-w-sm mb-4">
                      {ft.saveFirstNotice || "Select a folder or click 'Save Now to Folder' on the settings tab to create your first saved project file."}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => fallbackFolderInputRef.current?.click()}
                        className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <span className="material-icons-round text-sm text-blue-400">folder_open</span>
                        <span>{ft.browseFolderFallback || 'Select Folder on Disk'}</span>
                      </button>
                      {directoryHandle && (
                        <button
                          onClick={handleManualSave}
                          className="py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <span className="material-icons-round text-sm">save</span>
                          <span>{ft.saveNow || 'Save Current Work'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                    {discoveredProjects.map((dp, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-950/80 hover:bg-slate-950 border border-slate-800/80 hover:border-slate-700 rounded-xl p-3.5 transition-all flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 overflow-hidden flex-1">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${
                            dp.isWorkspaceBundle 
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          }`}>
                            <span className="material-icons-round text-lg">
                              {dp.isWorkspaceBundle ? 'collections_bookmark' : 'electric_bolt'}
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs sm:text-sm font-bold text-white truncate">
                                {dp.projectName}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase bg-slate-800 text-slate-400">
                                {dp.isWorkspaceBundle ? (ft.workspaceBundle || 'Bundle') : (ft.singleProject || 'Project')}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5 truncate">
                              <span className="font-mono text-slate-500 text-[10px] truncate">{dp.fileName}</span>
                              <span>•</span>
                              <span>{dp.pagesCount} {ft.pagesLabel || 'pages'}</span>
                              <span>•</span>
                              <span>{dp.componentsCount} {ft.componentsLabel || 'components'}</span>
                              <span>•</span>
                              <span>{new Date(dp.lastModified).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleLoadSingleDiscovered(dp)}
                          className="py-1.5 px-3 bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white rounded-lg text-xs font-semibold border border-blue-500/40 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <span className="material-icons-round text-sm">download</span>
                          <span>{ft.loadSingle || 'Load'}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Batch Load All Button */}
                {discoveredProjects.length > 0 && (
                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={handleLoadAllDiscovered}
                      className="w-full sm:w-auto py-2.5 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span className="material-icons-round text-base">cloud_download</span>
                      <span>{ft.loadAll || 'Load All Projects from Folder'}</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="material-icons-round text-sm text-blue-400">verified</span>
            <span>SmartSchema Direct Folder Auto-Save Engine</span>
          </div>
          <button
            onClick={onClose}
            className="py-1.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition-colors cursor-pointer"
          >
            {t.inputPanel?.close || 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

