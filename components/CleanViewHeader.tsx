import React, { useState, useRef, useEffect } from 'react';
import { Project, Page, DiagramOrientation, ComponentType, PalmRejectionMode } from '../types';
import { COMPONENT_CONFIG } from '../constants';
import { LegendIcon } from './LegendIcon';
import { useDeviceDetect } from '../utils/useDeviceDetect';

interface CleanViewHeaderProps {
  projects: Project[];
  activeProject: Project;
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  activePage: Page;
  activePageId: string;
  onSelectPage: (id: string) => void;
  isReadOnly: boolean;
  onExitCleanView?: () => void;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  searchMatchCount: number;
  activeFilters: Set<string>;
  onToggleFilter: (filterKey: string) => void;
  onClearFilters: () => void;
  availableLocations: {
    buildings: string[];
    floors: string[];
    offices: string[];
    places: string[];
  };
  orientation: DiagramOrientation;
  onCycleOrientation: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  isAnnotating: boolean;
  onToggleAnnotating: () => void;
  annotationColor: string;
  onAnnotationColorChange: (color: string) => void;
  onClearAnnotations: () => void;
  onSaveAnnotations?: () => void;
  onUndoAnnotation?: () => void;
  canUndoAnnotation?: boolean;
  annotationsCount?: number;
  palmRejectionMode?: PalmRejectionMode;
  onPalmRejectionModeChange?: (mode: PalmRejectionMode) => void;
  isStylusActive?: boolean;
  onOpenExport: () => void;
  onOpenTopology?: () => void;
  onOpenBuildingFloors?: () => void;
  onOpenShare?: () => void;
  onOpenSecurity?: () => void;
  onLogOut?: () => void;
  t: any;
  isRTL: boolean;
}

export const CleanViewHeader: React.FC<CleanViewHeaderProps> = ({
  projects,
  activeProject,
  activeProjectId,
  onSelectProject,
  activePage,
  activePageId,
  onSelectPage,
  isReadOnly,
  onExitCleanView,
  searchTerm,
  onSearchChange,
  searchMatchCount,
  activeFilters,
  onToggleFilter,
  onClearFilters,
  availableLocations,
  orientation,
  onCycleOrientation,
  theme,
  onToggleTheme,
  isAnnotating,
  onToggleAnnotating,
  annotationColor,
  onAnnotationColorChange,
  onClearAnnotations,
  onSaveAnnotations,
  onUndoAnnotation,
  canUndoAnnotation,
  annotationsCount = 0,
  palmRejectionMode = 'smart-palm',
  onPalmRejectionModeChange,
  isStylusActive = false,
  onOpenExport,
  onOpenTopology,
  onOpenBuildingFloors,
  onOpenShare,
  onOpenSecurity,
  onLogOut,
  t,
  isRTL
}) => {
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showPageDropdown, setShowPageDropdown] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const { isMobileOrTablet } = useDeviceDetect();

  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const pageDropdownRef = useRef<HTMLDivElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setShowProjectDropdown(false);
      }
      if (pageDropdownRef.current && !pageDropdownRef.current.contains(e.target as Node)) {
        setShowPageDropdown(false);
      }
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalComponentsCount = (p?: Project): number => {
    if (!p || !p.pages || !Array.isArray(p.pages)) return 0;
    let count = 0;
    const countNodes = (node: any) => {
      if (!node) return;
      count++;
      if (node.children && Array.isArray(node.children)) node.children.forEach(countNodes);
    };
    p.pages.forEach(pg => {
      if (pg && pg.items && Array.isArray(pg.items)) {
        pg.items.forEach(countNodes);
      }
    });
    return count;
  };

  const getOrientationLabel = (o: DiagramOrientation) => {
    if (o === 'horizontal') return t.orientations?.horizontal || 'Horizontal';
    if (o === 'vertical') return t.orientations?.vertical || 'Vertical';
    return t.orientations?.orthogonal_vertical || '90° Cascade';
  };

  const projectName = activeProject?.name || "Untitled Project";
  const pageName = activePage?.name || "Page 1";
  const projectPages = activeProject?.pages || [];
  const projectList = projects || [];
  const bldList = availableLocations?.buildings || [];
  const flrList = availableLocations?.floors || [];
  const offList = availableLocations?.offices || [];
  const plcList = availableLocations?.places || [];

  if (isMobileOrTablet) {
    return (
      <>
        <header className="h-14 bg-slate-900/95 border-b border-slate-800/90 px-2.5 sm:px-4 flex items-center justify-between gap-1.5 z-40 backdrop-blur-md shadow-lg shrink-0 select-none">
          {/* Left: Brand + Project dropdown */}
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-sm shrink-0">
              <span className="material-icons-round text-base">bolt</span>
            </div>

            {/* Project Selector */}
            <div className="relative" ref={projectDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setShowProjectDropdown(!showProjectDropdown);
                  setShowPageDropdown(false);
                  setShowFilterDropdown(false);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 text-xs font-semibold text-slate-200 max-w-[120px] sm:max-w-[180px] truncate shadow-sm cursor-pointer"
              >
                <span className="truncate">{projectName}</span>
                {projectList.length > 1 && (
                  <span className="material-icons-round text-xs text-slate-400 shrink-0">
                    {showProjectDropdown ? 'expand_less' : 'expand_more'}
                  </span>
                )}
              </button>

              {showProjectDropdown && projectList.length > 1 && (
                <div className={`absolute top-full mt-2 ${isRTL ? 'right-0' : 'left-0'} w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-1.5 space-y-1 animate-fadeIn`}>
                  <div className="px-2.5 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 flex items-center justify-between">
                    <span>{t.projects || "Projects"} ({projectList.length})</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-0.5 custom-scrollbar">
                    {projectList.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          onSelectProject(p.id);
                          setShowProjectDropdown(false);
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                          p.id === activeProjectId
                            ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 font-bold'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="material-icons-round text-sm text-blue-400 shrink-0">folder</span>
                          <span className="truncate">{p.name}</span>
                        </div>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 shrink-0 ml-2">
                          {totalComponentsCount(p)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Page Selector (if multiple) */}
            {projectPages.length > 1 && (
              <div className="relative" ref={pageDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowPageDropdown(!showPageDropdown);
                    setShowProjectDropdown(false);
                    setShowFilterDropdown(false);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/90 border border-slate-700 text-xs font-semibold text-slate-200 max-w-[90px] sm:max-w-[130px] truncate"
                >
                  <span className="truncate">{pageName}</span>
                  <span className="material-icons-round text-xs text-slate-400 shrink-0">expand_more</span>
                </button>

                {showPageDropdown && (
                  <div className={`absolute top-full mt-2 ${isRTL ? 'right-0' : 'left-0'} w-52 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-1.5 space-y-1 animate-fadeIn`}>
                    <div className="px-2.5 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      {t.pages || "Pages"} ({projectPages.length})
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-0.5 custom-scrollbar">
                      {projectPages.map(pg => (
                        <button
                          key={pg.id}
                          type="button"
                          onClick={() => {
                            onSelectPage(pg.id);
                            setShowPageDropdown(false);
                          }}
                          className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center gap-2 transition-colors ${
                            pg.id === activePageId
                              ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 font-bold'
                              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          <span className="material-icons-round text-sm text-amber-400 shrink-0">description</span>
                          <span className="truncate">{pg.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Quick Touch Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Search Trigger */}
            <button
              type="button"
              onClick={() => setShowMobileSearch(true)}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors relative ${
                searchTerm ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40' : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
              title="Search"
            >
              <span className="material-icons-round text-base">search</span>
              {searchTerm && searchMatchCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-600 text-white rounded-full text-[8px] font-bold flex items-center justify-center">
                  {searchMatchCount}
                </span>
              )}
            </button>

            {/* Filter Toggle */}
            <div className="relative" ref={filterDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setShowFilterDropdown(!showFilterDropdown);
                  setShowProjectDropdown(false);
                  setShowPageDropdown(false);
                }}
                className={`p-1.5 sm:p-2 rounded-lg transition-colors relative ${
                  (activeFilters?.size || 0) > 0 ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50' : 'bg-slate-800 text-slate-300'
                }`}
                title={t.filters?.title || "Filters"}
              >
                <span className="material-icons-round text-base text-blue-400">filter_alt</span>
                {(activeFilters?.size || 0) > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-600 text-white rounded-full text-[8px] font-bold flex items-center justify-center">
                    {activeFilters.size}
                  </span>
                )}
              </button>

              {showFilterDropdown && (
                <div className={`absolute top-full mt-2 ${isRTL ? 'left-0' : 'right-0'} w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-3 max-h-80 overflow-y-auto custom-scrollbar animate-fadeIn`}>
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.filters?.title || "Sort & Filter"}</span>
                    {(activeFilters?.size || 0) > 0 && (
                      <button onClick={onClearFilters} className="text-xs text-red-400 hover:underline">
                        {t.filters?.clear || "Clear All"}
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {[
                      { key: 'meter', icon: 'speed', color: '#3b82f6' },
                      { key: 'no-meter', icon: 'power_off', color: '#64748b' },
                      { key: 'generator', icon: 'letter_g', color: '#ef4444' },
                      { key: 'ac', icon: 'ac_unit', color: '#06b6d4' },
                      { key: 'airBreaker', icon: 'air_breaker', color: '#0284c7' },
                      { key: 'reserved', icon: 'lock', color: '#eab308' },
                      { key: 'essential', icon: 'star', color: '#ef4444' },
                      { key: 'non-essential', icon: 'star', color: '#64748b' },
                      { key: 'multimeter', icon: 'multimeter', color: '#10b981' },
                      { key: 'publicBoard', icon: 'public_board', color: '#14b8a6' },
                      { key: 'transferSwitch', icon: 'transfer_switch', color: '#c084fc' }
                    ].map(({ key, icon, color }) => (
                      <label key={key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-800 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeFilters?.has(key) || false}
                          onChange={() => onToggleFilter(key)}
                          className="w-3.5 h-3.5 rounded bg-slate-950 border-slate-600 text-blue-600 cursor-pointer"
                        />
                        <LegendIcon icon={icon} color={color} size={15} />
                        <span className="text-xs text-slate-200">
                          {key === 'no-meter' ? t.filters?.noMeter : key === 'non-essential' ? t.filters?.nonEssential : t.filters?.[key] || key}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Orientation */}
            <button
              type="button"
              onClick={onCycleOrientation}
              className="p-1.5 sm:p-2 bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-700"
              title={getOrientationLabel(orientation)}
            >
              <span className="material-icons-round text-base">schema</span>
            </button>

            {/* Annotations */}
            <button
              type="button"
              onClick={onToggleAnnotating}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors relative ${
                isAnnotating ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
              title="Annotations"
            >
              <span className="material-icons-round text-base">edit</span>
              {isAnnotating && annotationsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-purple-900 text-white rounded-full text-[8px] font-bold flex items-center justify-center">
                  {annotationsCount}
                </span>
              )}
            </button>

            {/* Building Floors */}
            {onOpenBuildingFloors && (
              <button
                type="button"
                onClick={onOpenBuildingFloors}
                className="p-1.5 sm:p-2 bg-slate-800 text-amber-400 hover:text-white rounded-lg border border-slate-700"
                title={t.buildingFloors?.openTooltip || "Building & Floors"}
              >
                <span className="material-icons-round text-base">apartment</span>
              </button>
            )}

            {/* Export */}
            <button
              type="button"
              onClick={onOpenExport}
              className="p-1.5 sm:p-2 bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-700"
              title={t.exportLabel || "Export"}
            >
              <span className="material-icons-round text-base">save_alt</span>
            </button>

            {/* More Clean View Options Menu */}
            <button
              type="button"
              onClick={() => setShowMobileMenu(true)}
              className="p-1.5 sm:p-2 bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-700"
              title="More"
            >
              <span className="material-icons-round text-base">more_vert</span>
            </button>

            {/* Exit Clean View */}
            {!isReadOnly && onExitCleanView && (
              <button
                type="button"
                onClick={onExitCleanView}
                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-md ml-1"
                title={t.exitCleanView || "Exit Clean View"}
              >
                <span className="material-icons-round text-sm">fullscreen_exit</span>
                <span className="hidden sm:inline">{t.exitCleanView || "Exit"}</span>
              </button>
            )}
          </div>
        </header>

        {/* Mobile Search Modal in Clean View */}
        {showMobileSearch && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col p-3 animate-fadeIn">
            <div className="w-full max-w-lg mx-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              <div className="p-3 border-b border-slate-800 flex items-center gap-2">
                <span className="material-icons-round text-slate-400 text-lg">search</span>
                <input
                  type="text"
                  autoFocus
                  placeholder={t.searchPlaceholder || "Search circuits, tags, models..."}
                  value={searchTerm}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
                />
                {searchTerm && (
                  <button onClick={() => onSearchChange('')} className="p-1 text-slate-400 hover:text-white">
                    <span className="material-icons-round text-sm">close</span>
                  </button>
                )}
                <button
                  onClick={() => setShowMobileSearch(false)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg"
                >
                  {t.done || "Done"}
                </button>
              </div>
              {searchMatchCount > 0 && (
                <div className="p-3 text-xs text-sky-400 bg-slate-950/60 font-semibold flex items-center gap-1.5">
                  <span className="material-icons-round text-sm">filter_list</span>
                  <span>{searchMatchCount} matching components highlighted in diagram</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mobile More Options Sheet in Clean View */}
        {showMobileMenu && (
          <div
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn"
            onClick={() => setShowMobileMenu(false)}
          >
            <div
              className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-slate-700 bg-slate-900 text-white p-4 shadow-2xl space-y-3 animate-slideUp"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-xs uppercase tracking-wider text-slate-400">Clean View Options</span>
                <button onClick={() => setShowMobileMenu(false)} className="p-1 text-slate-400 hover:text-white">
                  <span className="material-icons-round text-base">close</span>
                </button>
              </div>

              <div className="space-y-1.5">
                {/* Theme Toggle */}
                <button
                  onClick={() => { onToggleTheme(); setShowMobileMenu(false); }}
                  className="w-full text-left p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 flex items-center justify-between text-xs text-slate-200"
                >
                  <div className="flex items-center gap-2">
                    <span className="material-icons-round text-base text-amber-400">palette</span>
                    <span>{theme === 'light' ? 'Dark Theme' : 'Light Theme'}</span>
                  </div>
                  <span className="material-icons-round text-sm">{theme === 'light' ? 'dark_mode' : 'light_mode'}</span>
                </button>

                {/* Topology */}
                {onOpenTopology && (
                  <button
                    onClick={() => { onOpenTopology(); setShowMobileMenu(false); }}
                    className="w-full text-left p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 flex items-center gap-2 text-xs text-slate-200"
                  >
                    <span className="material-icons-round text-base text-sky-400">account_tree</span>
                    <span>{t.connectionTopology?.openTooltip || "Connection Topology Auditor"}</span>
                  </button>
                )}

                {/* Security */}
                {!isReadOnly && onOpenSecurity && (
                  <button
                    onClick={() => { onOpenSecurity(); setShowMobileMenu(false); }}
                    className="w-full text-left p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 flex items-center gap-2 text-xs text-slate-200"
                  >
                    <span className="material-icons-round text-base text-blue-400">shield</span>
                    <span>{t.auth?.securityTooltip || "Security & Password Settings"}</span>
                  </button>
                )}

                {/* Log Out */}
                {!isReadOnly && onLogOut && (
                  <button
                    onClick={() => { setShowMobileMenu(false); onLogOut(); }}
                    className="w-full text-left p-2.5 rounded-xl hover:bg-red-950/50 text-red-400 flex items-center gap-2 text-xs"
                  >
                    <span className="material-icons-round text-base">logout</span>
                    <span>{t.auth?.logoutTooltip || "Log Out"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <header className="h-14 bg-slate-900/95 border-b border-slate-800/90 px-3 sm:px-4 flex items-center justify-between gap-2 z-40 backdrop-blur-md shadow-lg shrink-0">
      {/* Left: Brand + Project & Page Selectors */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Brand & Badge */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
            <span className="material-icons-round text-lg">bolt</span>
          </div>
          <div className="hidden lg:flex flex-col">
            <span className="font-extrabold text-sm text-white tracking-tight leading-none">SmartSchema</span>
            <span className="text-[10px] text-blue-400 font-semibold leading-none mt-0.5">
              {isReadOnly ? (t.readOnly?.badge || "Clean View") : "Clean View"}
            </span>
          </div>
        </div>

        <div className="h-5 w-px bg-slate-800 hidden sm:block"></div>

        {/* Project Selector */}
        <div className="relative" ref={projectDropdownRef}>
          {projectList.length > 1 ? (
            <div>
              <button
                type="button"
                onClick={() => {
                  setShowProjectDropdown(!showProjectDropdown);
                  setShowPageDropdown(false);
                  setShowFilterDropdown(false);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-all max-w-[180px] sm:max-w-[240px] truncate shadow-sm cursor-pointer"
                title="Select Project"
              >
                <span className="material-icons-round text-blue-400 text-sm shrink-0">folder</span>
                <span className="truncate">{projectName}</span>
                <span className="material-icons-round text-xs text-slate-400 shrink-0">
                  {showProjectDropdown ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {showProjectDropdown && (
                <div className={`absolute top-full mt-2 ${isRTL ? 'right-0' : 'left-0'} w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-1.5 space-y-1 animate-fadeIn`}>
                  <div className="px-2.5 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 flex items-center justify-between">
                    <span>{t.projects || "Projects"} ({projectList.length})</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-0.5 custom-scrollbar">
                    {projectList.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          onSelectProject(p.id);
                          setShowProjectDropdown(false);
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                          p.id === activeProjectId
                            ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 font-bold'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="material-icons-round text-sm text-blue-400 shrink-0">folder</span>
                          <span className="truncate">{p.name}</span>
                        </div>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 shrink-0 ml-2">
                          {totalComponentsCount(p)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs font-semibold text-slate-200 max-w-[180px] sm:max-w-[240px] truncate">
              <span className="material-icons-round text-blue-400 text-sm shrink-0">folder</span>
              <span className="truncate">{projectName}</span>
            </div>
          )}
        </div>

        {/* Page Selector (if active project has multiple pages) */}
        {projectPages.length > 1 && (
          <div className="relative" ref={pageDropdownRef}>
            <button
              type="button"
              onClick={() => {
                setShowPageDropdown(!showPageDropdown);
                setShowProjectDropdown(false);
                setShowFilterDropdown(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-all max-w-[140px] sm:max-w-[180px] truncate shadow-sm cursor-pointer"
              title="Select Page"
            >
              <span className="material-icons-round text-amber-400 text-sm shrink-0">description</span>
              <span className="truncate">{pageName}</span>
              <span className="material-icons-round text-xs text-slate-400 shrink-0">
                {showPageDropdown ? 'expand_less' : 'expand_more'}
              </span>
            </button>

            {showPageDropdown && (
              <div className={`absolute top-full mt-2 ${isRTL ? 'right-0' : 'left-0'} w-52 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-1.5 space-y-1 animate-fadeIn`}>
                <div className="px-2.5 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  {t.pages || "Pages"} ({projectPages.length})
                </div>
                <div className="max-h-60 overflow-y-auto space-y-0.5 custom-scrollbar">
                  {projectPages.map(pg => (
                    <button
                      key={pg.id}
                      type="button"
                      onClick={() => {
                        onSelectPage(pg.id);
                        setShowPageDropdown(false);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center gap-2 transition-colors cursor-pointer ${
                        pg.id === activePageId
                          ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 font-bold'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <span className="material-icons-round text-sm text-amber-400 shrink-0">description</span>
                      <span className="truncate">{pg.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Center: Search Bar */}
      <div className="flex-1 max-w-md mx-2 hidden md:block">
        <div className="relative">
          <span className="material-icons-round absolute left-3 top-2.5 text-slate-400 text-sm">search</span>
          <input
            type="text"
            placeholder={t.searchPlaceholder || "Search circuits, tags, models..."}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl pl-9 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          {searchTerm && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
              title="Clear search"
            >
              <span className="material-icons-round text-sm">clear</span>
            </button>
          )}
          {searchTerm && searchMatchCount > 0 && (
            <span className="absolute right-7 top-1.5 text-[10px] font-bold px-1.5 py-0.5 bg-blue-600/80 text-blue-100 rounded-full">
              {searchMatchCount}
            </span>
          )}
        </div>
      </div>

      {/* Right: Sort/Filter, Orientation, Theme, Annotations, Export */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Sort & Filter Dropdown */}
        <div className="relative" ref={filterDropdownRef}>
          <button
            type="button"
            onClick={() => {
              setShowFilterDropdown(!showFilterDropdown);
              setShowProjectDropdown(false);
              setShowPageDropdown(false);
            }}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              (activeFilters?.size || 0) > 0
                ? 'bg-blue-600/30 text-blue-300 border-blue-500/50 shadow-md'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title={t.filters?.title || "Sort & Filter"}
          >
            <span className="material-icons-round text-sm text-blue-400">filter_alt</span>
            <span className="hidden sm:inline">{t.filters?.title || "Filter"}</span>
            {(activeFilters?.size || 0) > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.2 bg-blue-600 text-white rounded-full">
                {activeFilters.size}
              </span>
            )}
            <span className="material-icons-round text-xs text-slate-400">
              {showFilterDropdown ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {showFilterDropdown && (
            <div className={`absolute top-full mt-2 ${isRTL ? 'left-0' : 'right-0'} w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-3 max-h-80 overflow-y-auto custom-scrollbar animate-fadeIn`}>
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {t.filters?.title || "Sort & Filter"}
                </span>
                {(activeFilters?.size || 0) > 0 && (
                  <button
                    onClick={onClearFilters}
                    className="text-xs text-red-400 hover:text-red-300 hover:underline flex items-center gap-1"
                  >
                    <span className="material-icons-round text-xs">clear</span>
                    {t.filters?.clear || "Clear All"}
                  </button>
                )}
              </div>

              <div className="space-y-1">
                {[
                  { key: 'meter', icon: 'speed', color: '#3b82f6' },
                  { key: 'no-meter', icon: 'power_off', color: '#64748b' },
                  { key: 'generator', icon: 'letter_g', color: '#ef4444' },
                  { key: 'ac', icon: 'ac_unit', color: '#06b6d4' },
                  { key: 'airBreaker', icon: 'air_breaker', color: '#0284c7' },
                  { key: 'reserved', icon: 'lock', color: '#eab308' },
                  { key: 'essential', icon: 'star', color: '#ef4444' },
                  { key: 'non-essential', icon: 'star', color: '#64748b' },
                  { key: 'multimeter', icon: 'multimeter', color: '#10b981' },
                  { key: 'publicBoard', icon: 'public_board', color: '#14b8a6' },
                  { key: 'transferSwitch', icon: 'transfer_switch', color: '#c084fc' }
                ].map(({ key, icon, color }) => (
                  <label key={key} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={activeFilters?.has(key) || false}
                      onChange={() => onToggleFilter(key)}
                      className="w-3.5 h-3.5 rounded bg-slate-950 border-slate-600 text-blue-600 focus:ring-offset-slate-900 cursor-pointer"
                    />
                    <LegendIcon icon={icon} color={color} size={15} />
                    <span className="text-xs text-slate-200">
                      {key === 'no-meter' ? t.filters?.noMeter : key === 'non-essential' ? t.filters?.nonEssential : t.filters?.[key] || key}
                    </span>
                  </label>
                ))}

                {/* Location Filters */}
                {(bldList.length > 0 || flrList.length > 0 || offList.length > 0 || plcList.length > 0) && (
                  <div className="border-t border-slate-800 my-2 pt-1">
                    <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      {t.filters?.byLocation || "By Location"}
                    </div>
                  </div>
                )}

                {bldList.map(bld => (
                  <label key={`bld:${bld}`} className="flex items-center gap-2.5 px-2 py-1 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={activeFilters?.has(`bld:${bld}`) || false}
                      onChange={() => onToggleFilter(`bld:${bld}`)}
                      className="w-3.5 h-3.5 rounded bg-slate-950 border-slate-600 text-blue-600 cursor-pointer"
                    />
                    <span className="text-xs text-slate-200 truncate">{bld}</span>
                  </label>
                ))}

                {flrList.map(flr => (
                  <label key={`flr:${flr}`} className="flex items-center gap-2.5 px-2 py-1 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={activeFilters?.has(`flr:${flr}`) || false}
                      onChange={() => onToggleFilter(`flr:${flr}`)}
                      className="w-3.5 h-3.5 rounded bg-slate-950 border-slate-600 text-blue-600 cursor-pointer"
                    />
                    <span className="text-xs text-slate-200 truncate">{flr}</span>
                  </label>
                ))}

                {offList.map(off => (
                  <label key={`off:${off}`} className="flex items-center gap-2.5 px-2 py-1 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={activeFilters?.has(`off:${off}`) || false}
                      onChange={() => onToggleFilter(`off:${off}`)}
                      className="w-3.5 h-3.5 rounded bg-slate-950 border-slate-600 text-blue-600 cursor-pointer"
                    />
                    <span className="text-xs text-slate-200 truncate">{off}</span>
                  </label>
                ))}

                {plcList.map(plc => (
                  <label key={`plc:${plc}`} className="flex items-center gap-2.5 px-2 py-1 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={activeFilters?.has(`plc:${plc}`) || false}
                      onChange={() => onToggleFilter(`plc:${plc}`)}
                      className="w-3.5 h-3.5 rounded bg-slate-950 border-slate-600 text-blue-600 cursor-pointer"
                    />
                    <span className="text-xs text-slate-200 truncate">{plc}</span>
                  </label>
                ))}

                {/* Component Type Filters */}
                <div className="border-t border-slate-800 my-2 pt-1">
                  <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    {t.filters?.byType || "By Component Type"}
                  </div>
                </div>

                {Object.values(ComponentType).map(type => (
                  <label key={type} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={activeFilters?.has(type) || false}
                      onChange={() => onToggleFilter(type)}
                      className="w-3.5 h-3.5 rounded bg-slate-950 border-slate-600 text-blue-600 cursor-pointer"
                    />
                    <LegendIcon
                      icon={COMPONENT_CONFIG[type]?.icon || 'help'}
                      color={COMPONENT_CONFIG[type]?.color || '#94a3b8'}
                      size={15}
                    />
                    <span className="text-xs text-slate-200">{t.componentTypes?.[type] || type}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Orientation / View Type Button */}
        <button
          type="button"
          onClick={onCycleOrientation}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition-colors flex items-center gap-1"
          title={`${t.toggleOrientation || "Orientation"}: ${getOrientationLabel(orientation)}`}
        >
          <span
            className="material-icons-round text-base transition-transform duration-300"
            style={{
              rotate: orientation === 'vertical' ? '90deg' : '0deg',
              color: orientation === 'orthogonal_vertical' ? '#38bdf8' : undefined
            }}
          >
            {orientation === 'orthogonal_vertical' ? 'account_tree' : 'schema'}
          </span>
          <span className="text-xs font-semibold hidden md:inline">
            {getOrientationLabel(orientation)}
          </span>
        </button>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition-colors"
          title={t.toggleTheme || "Toggle Theme"}
        >
          <span className="material-icons-round text-base">
            {theme === 'light' ? 'dark_mode' : 'light_mode'}
          </span>
        </button>

        {/* Annotations / Pen Tool */}
        <button
          type="button"
          onClick={onToggleAnnotating}
          className={`p-2 rounded-lg border transition-colors flex items-center gap-1.5 ${
            isAnnotating
              ? 'bg-purple-600 text-white border-purple-500 shadow-md ring-2 ring-purple-400/40'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
          }`}
          title={isAnnotating ? (t.annotations?.disable || "Disable Drawing") : (t.annotations?.enable || "Drawing Tool")}
        >
          <span className="material-icons-round text-base">edit</span>
          {isAnnotating && annotationsCount > 0 && (
            <span className="text-[10px] bg-purple-900/80 text-purple-200 px-1.5 py-0.2 rounded-full font-bold">
              {annotationsCount}
            </span>
          )}
        </button>

        {/* Connection Topology Viewer (Read-only visual path explorer) */}
        {onOpenTopology && (
          <button
            type="button"
            onClick={onOpenTopology}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-white rounded-lg border border-slate-700 transition-colors"
            title={t.connectionTopology?.openTooltip || "Connection Topology"}
          >
            <span className="material-icons-round text-base">account_tree</span>
          </button>
        )}

        {/* Building & Floor Distribution */}
        {onOpenBuildingFloors && (
          <button
            type="button"
            onClick={onOpenBuildingFloors}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-white rounded-lg border border-slate-700 transition-colors"
            title={t.buildingFloors?.openTooltip || "Building & Floor Distribution"}
          >
            <span className="material-icons-round text-base">apartment</span>
          </button>
        )}

        {/* Export Button */}
        <button
          type="button"
          onClick={onOpenExport}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition-colors flex items-center gap-1"
          title={t.exportLabel || "Export Diagram"}
        >
          <span className="material-icons-round text-base">save_alt</span>
          <span className="text-xs font-semibold hidden md:inline">{t.exportLabel || "Export"}</span>
        </button>

        {/* Security & Password Settings */}
        {!isReadOnly && onOpenSecurity && (
          <button
            type="button"
            onClick={onOpenSecurity}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition-colors"
            title={t.auth?.securityTooltip || "Security & Password Settings"}
          >
            <span className="material-icons-round text-base text-blue-400">shield</span>
          </button>
        )}

        {/* Log Out */}
        {!isReadOnly && onLogOut && (
          <button
            type="button"
            onClick={onLogOut}
            className="p-2 bg-slate-800 hover:bg-red-900/60 text-slate-300 hover:text-red-300 rounded-lg border border-slate-700 hover:border-red-700/60 transition-colors"
            title={t.auth?.logoutTooltip || "Log out and lock workspace"}
          >
            <span className="material-icons-round text-base text-red-400">logout</span>
          </button>
        )}

        {/* Exit Clean View (ONLY available for author when not in read-only shared link) */}
        {!isReadOnly && onExitCleanView && (
          <button
            type="button"
            onClick={onExitCleanView}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-md ml-1"
            title={t.exitCleanView || "Exit Clean View"}
          >
            <span className="material-icons-round text-sm">fullscreen_exit</span>
            <span>{t.exitCleanView || "Exit"}</span>
          </button>
        )}
      </div>
    </header>
  );
};
