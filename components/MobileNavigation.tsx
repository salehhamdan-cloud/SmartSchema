import React, { useState, useRef } from 'react';
import { ElectricalNode, ComponentType, DiagramOrientation, Project, Page, Language, Theme } from '../types';
import { COMPONENT_CONFIG } from '../constants';
import { LegendIcon } from './LegendIcon';
import { FolderSyncSettings } from '../utils/folderStorageService';

interface MobileNavigationProps {
  projects: Project[];
  activeProject: Project;
  activeProjectId: string;
  activePage: Page;
  activePageId: string;
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  searchMatchCount: number;
  recentSearches: string[];
  onSelectRecentSearch: (query: string) => void;
  onRemoveRecentSearch: (query: string, e: React.MouseEvent) => void;
  onClearAllRecentSearches: () => void;
  matchingNodesList: ElectricalNode[];
  onSelectNode: (node: ElectricalNode) => void;
  onAddIndependentNode: (type: ComponentType) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAnalyze: () => void;
  isPropertiesSheetOpen: boolean;
  onTogglePropertiesSheet: () => void;
  selectedNode: ElectricalNode | null;
  onOpenBuildingFloors: () => void;
  onEnterCleanView: () => void;
  isConnectMode: boolean;
  onToggleConnectMode: () => void;
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
  onAutoArrange: () => void;
  isLayoutLocked: boolean;
  onToggleLayoutLocked: () => void;
  onOpenShare: () => void;
  onOpenFolderSync: () => void;
  folderSettings: FolderSyncSettings;
  directoryHandle: any;
  onOpenExport: () => void;
  onOpenVersionHistory: () => void;
  versionHistoryCount: number;
  onOpenTopology: () => void;
  isPrintMode: boolean;
  onTogglePrintMode: () => void;
  onEditPrintSettings: () => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  theme: Theme;
  onToggleTheme: () => void;
  onOpenSecurity: () => void;
  onOpenAbout: () => void;
  onLogOut: () => void;
  isReadOnly: boolean;
  isRTL: boolean;
  t: any;
  isTablet: boolean;
  isMobile: boolean;
}

export const MobileNavigation: React.FC<MobileNavigationProps> = ({
  projects,
  activeProject,
  activeProjectId,
  activePage,
  activePageId,
  onToggleSidebar,
  isSidebarOpen,
  searchTerm,
  onSearchChange,
  searchMatchCount,
  recentSearches,
  onSelectRecentSearch,
  onRemoveRecentSearch,
  onClearAllRecentSearches,
  matchingNodesList,
  onSelectNode,
  onAddIndependentNode,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAnalyze,
  isPropertiesSheetOpen,
  onTogglePropertiesSheet,
  selectedNode,
  onOpenBuildingFloors,
  onEnterCleanView,
  isConnectMode,
  onToggleConnectMode,
  activeFilters,
  onToggleFilter,
  onClearFilters,
  availableLocations,
  orientation,
  onCycleOrientation,
  onAutoArrange,
  isLayoutLocked,
  onToggleLayoutLocked,
  onOpenShare,
  onOpenFolderSync,
  folderSettings,
  directoryHandle,
  onOpenExport,
  onOpenVersionHistory,
  versionHistoryCount,
  onOpenTopology,
  isPrintMode,
  onTogglePrintMode,
  onEditPrintSettings,
  language,
  onLanguageChange,
  theme,
  onToggleTheme,
  onOpenSecurity,
  onOpenAbout,
  onLogOut,
  isReadOnly,
  isRTL,
  t,
  isTablet,
  isMobile
}) => {
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showToolsDrawer, setShowToolsDrawer] = useState(false);
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);

  const isDark = theme === 'dark';

  return (
    <>
      {/* Top Mobile/Tablet Bar */}
      <header
        className={`px-3 py-2 sm:px-4 sm:py-2.5 border-b sticky top-0 z-40 flex items-center justify-between gap-2 shadow-md backdrop-blur-md select-none ${
          isDark ? 'bg-slate-900/95 border-slate-800 text-white' : 'bg-white/95 border-slate-200 text-slate-800'
        }`}
      >
        {/* Left: Sidebar Hamburger + Compact Brand */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onToggleSidebar}
            className={`p-2 rounded-xl transition-colors shrink-0 ${
              isSidebarOpen
                ? 'bg-blue-600 text-white shadow-sm'
                : isDark
                ? 'bg-slate-800 text-slate-300 hover:text-white'
                : 'bg-slate-100 text-slate-700 hover:text-slate-900'
            }`}
            title={t.projects || 'Projects'}
            aria-label="Toggle Projects Drawer"
          >
            <span className="material-icons-round text-xl">menu</span>
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
              <span className="material-icons-round text-base">electrical_services</span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-bold text-xs sm:text-sm tracking-tight truncate leading-none">
                  {activeProject.name}
                </span>
                {isReadOnly && (
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1 py-0.2 rounded font-bold uppercase shrink-0">
                    {t.readOnly?.badge || 'View'}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-400 truncate leading-none mt-1">
                {activePage.name}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Quick Action Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Search Trigger Button */}
          <button
            onClick={() => setShowSearchModal(true)}
            className={`p-2 rounded-xl transition-colors relative ${
              searchTerm
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                : isDark
                ? 'bg-slate-800 text-slate-300 hover:text-white'
                : 'bg-slate-100 text-slate-700 hover:text-slate-900'
            }`}
            title={t.searchPlaceholder || 'Search'}
            aria-label="Search"
          >
            <span className="material-icons-round text-lg">search</span>
            {searchTerm && searchMatchCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center">
                {searchMatchCount}
              </span>
            )}
          </button>

          {/* Add Power Source (Edit mode) */}
          {!isReadOnly && (
            <button
              onClick={() => setShowAddSourceModal(true)}
              className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold transition-all shadow-sm flex items-center gap-1"
              title={t.addIndependent || 'Add Source'}
              aria-label="Add Power Source"
            >
              <span className="material-icons-round text-lg">add_circle</span>
              <span className="text-xs font-bold hidden sm:inline">{t.addIndependent || 'Source'}</span>
            </button>
          )}

          {/* Undo / Redo (Edit mode) */}
          {!isReadOnly && (
            <div
              className={`flex items-center rounded-xl p-0.5 border ${
                isDark ? 'bg-slate-800/80 border-slate-700/80' : 'bg-slate-100 border-slate-200'
              }`}
            >
              <button
                onClick={onUndo}
                disabled={!canUndo}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white disabled:opacity-25 transition-colors"
                title={t.undo}
              >
                <span className="material-icons-round text-base">undo</span>
              </button>
              <div className="w-px h-3.5 bg-slate-700/60"></div>
              <button
                onClick={onRedo}
                disabled={!canRedo}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white disabled:opacity-25 transition-colors"
                title={t.redo}
              >
                <span className="material-icons-round text-base">redo</span>
              </button>
            </div>
          )}

          {/* Filter Quick Button (shows active count) */}
          <button
            onClick={() => setShowFilterModal(true)}
            className={`p-2 rounded-xl transition-colors relative ${
              activeFilters.size > 0
                ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50'
                : isDark
                ? 'bg-slate-800 text-slate-300 hover:text-white'
                : 'bg-slate-100 text-slate-700 hover:text-slate-900'
            }`}
            title={t.filters?.title || 'Filters'}
          >
            <span className="material-icons-round text-lg">filter_alt</span>
            {activeFilters.size > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold px-1 flex items-center justify-center">
                {activeFilters.size}
              </span>
            )}
          </button>

          {/* More Tools Menu Drawer Trigger */}
          <button
            onClick={() => setShowToolsDrawer(true)}
            className={`p-2 rounded-xl transition-colors ${
              isDark
                ? 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                : 'bg-slate-100 text-slate-700 hover:text-slate-900 hover:bg-slate-200'
            }`}
            title={t.tools || 'Tools & Settings'}
            aria-label="Open Tools and Settings Menu"
          >
            <span className="material-icons-round text-lg">tune</span>
          </button>
        </div>
      </header>

      {/* Mobile / Tablet Bottom Navigation Bar (Thumb ergonomic CAD navigation) */}
      <nav
        className={`fixed bottom-0 inset-x-0 z-40 border-t flex items-center justify-around px-2 py-1.5 shadow-2xl backdrop-blur-md select-none transition-transform ${
          isDark ? 'bg-slate-950/95 border-slate-800 text-slate-300' : 'bg-white/95 border-slate-200 text-slate-700'
        }`}
        style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom, 0px))' }}
      >
        {/* 1. Canvas / Diagram View */}
        <button
          onClick={() => {
            if (isPropertiesSheetOpen) onTogglePropertiesSheet();
          }}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
            !isPropertiesSheetOpen
              ? 'text-blue-500 font-bold bg-blue-500/10'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="material-icons-round text-xl">schema</span>
          <span className="text-[10px] tracking-tight mt-0.5">
            {t.schema || (language === 'he' ? 'שרטוט' : language === 'ar' ? 'المخطط' : 'Schema')}
          </span>
        </button>

        {/* 2. Building / Properties Panel (InputPanel) */}
        {!isReadOnly && (
          <button
            onClick={onTogglePropertiesSheet}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all relative ${
              isPropertiesSheetOpen
                ? 'text-amber-400 font-bold bg-amber-500/15 ring-1 ring-amber-500/40 shadow-sm'
                : selectedNode
                ? 'text-amber-400 font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <span className="material-icons-round text-xl">edit_note</span>
              {selectedNode && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse ring-2 ring-slate-900"></span>
              )}
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 truncate max-w-[65px]">
              {selectedNode ? selectedNode.name : (language === 'he' ? 'בנייה/עריכה' : language === 'ar' ? 'بناء وتعديل' : 'Build / Edit')}
            </span>
          </button>
        )}

        {/* 3. Building & Floor Distribution View */}
        <button
          onClick={onOpenBuildingFloors}
          className="flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all text-slate-400 hover:text-amber-400 active:scale-95"
          title={t.buildingFloors?.openTooltip || 'Building & Floor Distribution'}
        >
          <span className="material-icons-round text-xl text-amber-500">apartment</span>
          <span className="text-[10px] tracking-tight mt-0.5">
            {t.buildingFloors?.shortTitle || (language === 'he' ? 'קומות ומבנה' : language === 'ar' ? 'المباني والأدوار' : 'Floors')}
          </span>
        </button>

        {/* 4. Clean View (Fullscreen) */}
        <button
          onClick={onEnterCleanView}
          className="flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all text-slate-400 hover:text-sky-400 active:scale-95"
          title={t.cleanView || 'Clean View'}
        >
          <span className="material-icons-round text-xl text-sky-400">fullscreen</span>
          <span className="text-[10px] tracking-tight mt-0.5">
            {language === 'he' ? 'תצוגה נקייה' : language === 'ar' ? 'عرض نظيف' : 'Clean View'}
          </span>
        </button>

        {/* 5. AI Analyze Action */}
        <button
          onClick={onAnalyze}
          className="flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all bg-gradient-to-tr from-purple-600/30 to-blue-600/30 border border-purple-500/40 text-purple-300 hover:text-white shadow-sm active:scale-95"
          title={t.analyze || 'AI Safety Analysis'}
        >
          <span className="material-icons-round text-xl text-purple-400">auto_awesome</span>
          <span className="text-[10px] font-bold tracking-tight mt-0.5 text-purple-300">
            {t.analyze || 'Analyze'}
          </span>
        </button>
      </nav>

      {/* SEARCH MODAL OVERLAY (Smooth touch-optimized search) */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col p-3 sm:p-4 animate-fadeIn">
          <div
            className={`w-full max-w-lg mx-auto rounded-2xl border shadow-2xl flex flex-col overflow-hidden max-h-[90vh] ${
              isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
            }`}
          >
            {/* Search Input Bar */}
            <div className="p-3 border-b border-slate-800 flex items-center gap-2">
              <span className="material-icons-round text-slate-400 text-lg">search</span>
              <input
                type="text"
                autoFocus
                placeholder={t.searchPlaceholder || 'Search circuits, tags, rooms, models...'}
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className={`flex-1 bg-transparent text-sm focus:outline-none ${
                  isDark ? 'text-white placeholder-slate-500' : 'text-slate-900 placeholder-slate-400'
                }`}
              />
              {searchTerm && (
                <button
                  onClick={() => onSearchChange('')}
                  className="p-1 rounded-full text-slate-400 hover:text-white"
                >
                  <span className="material-icons-round text-sm">close</span>
                </button>
              )}
              <button
                onClick={() => setShowSearchModal(false)}
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                {t.done || 'Done'}
              </button>
            </div>

            {/* Results / Matching Components */}
            <div className="p-3 overflow-y-auto space-y-3 flex-1 custom-scrollbar">
              {searchTerm.trim().length > 0 ? (
                <div>
                  <div className="text-[11px] font-bold text-sky-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <span className="material-icons-round text-sm">manage_search</span>
                    <span>{t.searchSuggestions || 'Matching Components'} ({matchingNodesList.length})</span>
                  </div>

                  {matchingNodesList.length === 0 ? (
                    <div className="text-xs text-slate-500 py-3 text-center italic">
                      {t.connectionTopology?.noMatchingNodes || 'No matching components found'}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {matchingNodesList.slice(0, 15).map(node => {
                        const config = COMPONENT_CONFIG[node.type] || { icon: 'help', color: '#94a3b8' };
                        const loc = [node.building, node.floor, node.office, node.place].filter(Boolean).join(' / ');

                        return (
                          <button
                            key={node.id}
                            onClick={() => {
                              onSelectNode(node);
                              onSelectRecentSearch(node.name);
                              setShowSearchModal(false);
                            }}
                            className={`w-full text-left p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
                              isDark
                                ? 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700'
                                : 'bg-slate-50 hover:bg-blue-50 border-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div
                                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                                style={{ backgroundColor: `${node.customColor || config.color}20`, color: node.customColor || config.color }}
                              >
                                <LegendIcon icon={config.icon} color={node.customColor || config.color} size={15} />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold text-slate-100 truncate">{node.name}</span>
                                <span className="text-[10px] text-slate-400 truncate">
                                  {t.componentTypes[node.type] || node.type} {loc ? `• ${loc}` : ''}
                                </span>
                              </div>
                            </div>
                            <span className="material-icons-round text-sm text-sky-400 shrink-0">my_location</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                /* Recent Searches */
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <span className="material-icons-round text-sm text-indigo-400">history</span>
                      <span>{t.recentSearches || 'Recent Searches'}</span>
                    </span>
                    {recentSearches.length > 0 && (
                      <button
                        onClick={onClearAllRecentSearches}
                        className="text-[11px] text-red-400 hover:underline flex items-center gap-0.5"
                      >
                        <span className="material-icons-round text-xs">delete_sweep</span>
                        <span>{t.clearRecentSearches || 'Clear'}</span>
                      </button>
                    )}
                  </div>

                  {recentSearches.length === 0 ? (
                    <div className="text-xs text-slate-500 py-3 text-center italic">
                      {t.noRecentSearches || 'No recent searches'}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {recentSearches.map((query, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            onSearchChange(query);
                            onSelectRecentSearch(query);
                          }}
                          className={`p-2 rounded-xl flex items-center justify-between cursor-pointer ${
                            isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="material-icons-round text-sm text-slate-400">search</span>
                            <span className="text-xs text-slate-200 truncate">{query}</span>
                          </div>
                          <button
                            onClick={(e) => onRemoveRecentSearch(query, e)}
                            className="p-1 text-slate-500 hover:text-red-400"
                          >
                            <span className="material-icons-round text-xs">close</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ADD INDEPENDENT SOURCE BOTTOM SHEET */}
      {showAddSourceModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn"
          onClick={() => setShowAddSourceModal(false)}
        >
          <div
            className={`w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border p-4 shadow-2xl space-y-3 animate-slideUp ${
              isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2.5 border-slate-800">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-emerald-400 text-lg">add_circle</span>
                <span className="font-bold text-sm uppercase tracking-wider">{t.addIndependent || 'Add Power Source'}</span>
              </div>
              <button
                onClick={() => setShowAddSourceModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <span className="material-icons-round text-lg">close</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              {/* Utility Grid */}
              <button
                onClick={() => {
                  onAddIndependentNode(ComponentType.SYSTEM_ROOT);
                  setShowAddSourceModal(false);
                }}
                className="p-3 rounded-xl border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 flex flex-col items-center gap-1.5 transition-all text-center"
              >
                <span className="material-icons-round text-2xl text-blue-400">domain</span>
                <span className="font-bold text-xs">{t.addGrid || 'Grid Main Feed'}</span>
              </button>

              {/* Generator */}
              <button
                onClick={() => {
                  onAddIndependentNode(ComponentType.GENERATOR);
                  setShowAddSourceModal(false);
                }}
                className="p-3 rounded-xl border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-300 flex flex-col items-center gap-1.5 transition-all text-center"
              >
                <span className="material-icons-round text-2xl text-red-400">settings_power</span>
                <span className="font-bold text-xs">{t.addGen || 'Diesel Generator'}</span>
              </button>

              {/* Transformer */}
              <button
                onClick={() => {
                  onAddIndependentNode(ComponentType.TRANSFORMER);
                  setShowAddSourceModal(false);
                }}
                className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 flex flex-col items-center gap-1.5 transition-all text-center"
              >
                <span className="material-icons-round text-2xl text-amber-400">electric_bolt</span>
                <span className="font-bold text-xs">{t.addTrans || 'MV Transformer'}</span>
              </button>

              {/* UPS */}
              <button
                onClick={() => {
                  onAddIndependentNode(ComponentType.UPS);
                  setShowAddSourceModal(false);
                }}
                className="p-3 rounded-xl border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 flex flex-col items-center gap-1.5 transition-all text-center"
              >
                <span className="material-icons-round text-2xl text-cyan-400">battery_charging_full</span>
                <span className="font-bold text-xs">UPS System</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FILTER BOTTOM SHEET */}
      {showFilterModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn"
          onClick={() => setShowFilterModal(false)}
        >
          <div
            className={`w-full sm:max-w-md max-h-[85vh] rounded-t-2xl sm:rounded-2xl border flex flex-col overflow-hidden shadow-2xl animate-slideUp ${
              isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-blue-400 text-lg">filter_alt</span>
                <span className="font-bold text-sm uppercase tracking-wider">{t.filters?.title || 'Filters'}</span>
                {activeFilters.size > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 bg-blue-600 text-white rounded-full">
                    {activeFilters.size}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeFilters.size > 0 && (
                  <button
                    onClick={onClearFilters}
                    className="text-xs text-red-400 hover:text-red-300 font-semibold"
                  >
                    {t.filters?.clear || 'Clear All'}
                  </button>
                )}
                <button
                  onClick={() => setShowFilterModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <span className="material-icons-round text-lg">close</span>
                </button>
              </div>
            </div>

            {/* Filter Content */}
            <div className="p-3.5 overflow-y-auto space-y-3 flex-1 custom-scrollbar">
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
                  <label key={key} className="flex items-center gap-2.5 px-2.5 py-2 hover:bg-slate-800 rounded-xl cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={activeFilters.has(key)}
                      onChange={() => onToggleFilter(key)}
                      className="w-4 h-4 rounded bg-slate-900 border-slate-600 text-blue-600 cursor-pointer"
                    />
                    <LegendIcon icon={icon} color={color} size={16} />
                    <span className="text-xs text-slate-200">
                      {key === 'no-meter' ? t.filters?.noMeter : key === 'non-essential' ? t.filters?.nonEssential : t.filters?.[key] || key}
                    </span>
                  </label>
                ))}
              </div>

              {/* By Location */}
              {(availableLocations.buildings.length > 0 || availableLocations.floors.length > 0) && (
                <div className="border-t border-slate-800 pt-2 space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    {t.filters?.byLocation || 'By Location'}
                  </div>
                  {availableLocations.buildings.map(bld => (
                    <label key={`bld:${bld}`} className="flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-slate-800 rounded-xl cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeFilters.has(`bld:${bld}`)}
                        onChange={() => onToggleFilter(`bld:${bld}`)}
                        className="w-4 h-4 rounded bg-slate-900 border-slate-600 text-blue-600 cursor-pointer"
                      />
                      <span className="text-xs text-slate-300 truncate">🏢 {bld}</span>
                    </label>
                  ))}
                  {availableLocations.floors.map(flr => (
                    <label key={`flr:${flr}`} className="flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-slate-800 rounded-xl cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeFilters.has(`flr:${flr}`)}
                        onChange={() => onToggleFilter(`flr:${flr}`)}
                        className="w-4 h-4 rounded bg-slate-900 border-slate-600 text-blue-600 cursor-pointer"
                      />
                      <span className="text-xs text-slate-300 truncate">📍 {flr}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 border-t border-slate-800 shrink-0">
              <button
                onClick={() => setShowFilterModal(false)}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-colors"
              >
                {t.done || 'Apply Filters'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE / TABLET ALL-IN-ONE TOOLS & SETTINGS DRAWER */}
      {showToolsDrawer && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn"
          onClick={() => setShowToolsDrawer(false)}
        >
          <div
            className={`w-full sm:max-w-lg max-h-[88vh] rounded-t-2xl sm:rounded-2xl border flex flex-col overflow-hidden shadow-2xl animate-slideUp ${
              isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-indigo-400 text-lg">tune</span>
                <span className="font-bold text-sm uppercase tracking-wider">{t.toolsMenu || 'Project Tools & Settings'}</span>
              </div>
              <button
                onClick={() => setShowToolsDrawer(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <span className="material-icons-round text-lg">close</span>
              </button>
            </div>

            {/* Drawer Sections */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
              {/* Group A: Schema Drawing & View Controls */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  {language === 'he' ? 'בקרות שרטוט ותצוגה' : language === 'ar' ? 'خيارات الرسم والعرض' : 'Drawing & View Controls'}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {/* Connect / Link Mode */}
                  {!isReadOnly && (
                    <button
                      onClick={() => {
                        onToggleConnectMode();
                        setShowToolsDrawer(false);
                      }}
                      className={`p-2.5 rounded-xl border flex items-center gap-2 transition-all ${
                        isConnectMode
                          ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                          : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-200'
                      }`}
                    >
                      <span className="material-icons-round text-base text-amber-400">link</span>
                      <span className="text-xs font-semibold">{isConnectMode ? t.linking : t.linkComponents}</span>
                    </button>
                  )}

                  {/* Orientation Toggle */}
                  <button
                    onClick={onCycleOrientation}
                    className="p-2.5 rounded-xl border bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-200 flex items-center gap-2 transition-all"
                  >
                    <span className="material-icons-round text-base text-sky-400">schema</span>
                    <span className="text-xs font-semibold">{t.toggleOrientation || 'Orientation'}</span>
                  </button>

                  {/* Auto Arrange Layout */}
                  <button
                    onClick={() => {
                      onAutoArrange();
                      setShowToolsDrawer(false);
                    }}
                    className="p-2.5 rounded-xl border bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-200 flex items-center gap-2 transition-all"
                  >
                    <span className="material-icons-round text-base text-purple-400">auto_fix_high</span>
                    <span className="text-xs font-semibold">{t.autoArrange || 'Auto Arrange'}</span>
                  </button>

                  {/* Lock / Unlock Layout */}
                  <button
                    onClick={onToggleLayoutLocked}
                    className={`p-2.5 rounded-xl border flex items-center gap-2 transition-all ${
                      isLayoutLocked
                        ? 'bg-red-950/40 border-red-800 text-red-300'
                        : 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                    }`}
                  >
                    <span className="material-icons-round text-base">{isLayoutLocked ? 'lock' : 'lock_open'}</span>
                    <span className="text-xs font-semibold">{isLayoutLocked ? t.unlockLayout : t.lockLayout}</span>
                  </button>
                </div>
              </div>

              {/* Group B: Project Features & Modals */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  {language === 'he' ? 'כלים וייצוא' : language === 'ar' ? 'الأدوات والمشاركة' : 'Tools & Export'}
                </div>
                <div className="space-y-1.5">
                  {/* Share Project */}
                  <button
                    onClick={() => {
                      onOpenShare();
                      setShowToolsDrawer(false);
                    }}
                    className="w-full text-left p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="material-icons-round text-base text-blue-400">share</span>
                      <span className="text-xs font-semibold text-slate-200">{t.share?.title || 'Share Project Link'}</span>
                    </div>
                    <span className="material-icons-round text-xs text-slate-500">chevron_right</span>
                  </button>

                  {/* Export Diagram */}
                  <button
                    onClick={() => {
                      onOpenExport();
                      setShowToolsDrawer(false);
                    }}
                    className="w-full text-left p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="material-icons-round text-base text-emerald-400">save_alt</span>
                      <span className="text-xs font-semibold text-slate-200">{t.export?.title || 'Export (PDF, SVG, DXF, PNG)'}</span>
                    </div>
                    <span className="material-icons-round text-xs text-slate-500">chevron_right</span>
                  </button>

                  {/* Building & Floor Distribution */}
                  <button
                    onClick={() => {
                      onOpenBuildingFloors();
                      setShowToolsDrawer(false);
                    }}
                    className="w-full text-left p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="material-icons-round text-base text-amber-400">apartment</span>
                      <span className="text-xs font-semibold text-slate-200">{t.buildingFloors?.title || 'Building & Floor Distribution'}</span>
                    </div>
                    <span className="material-icons-round text-xs text-slate-500">chevron_right</span>
                  </button>

                  {/* Version History */}
                  <button
                    onClick={() => {
                      onOpenVersionHistory();
                      setShowToolsDrawer(false);
                    }}
                    className="w-full text-left p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="material-icons-round text-base text-indigo-400">history</span>
                      <span className="text-xs font-semibold text-slate-200">{t.versionHistory?.openButton || 'Version History'}</span>
                    </div>
                    {versionHistoryCount > 0 && (
                      <span className="text-[10px] font-bold bg-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded-full">
                        {versionHistoryCount}
                      </span>
                    )}
                  </button>

                  {/* Connection Topology */}
                  <button
                    onClick={() => {
                      onOpenTopology();
                      setShowToolsDrawer(false);
                    }}
                    className="w-full text-left p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="material-icons-round text-base text-sky-400">account_tree</span>
                      <span className="text-xs font-semibold text-slate-200">{t.connectionTopology?.openButton || 'Topology & Electrical Auditor'}</span>
                    </div>
                    <span className="material-icons-round text-xs text-slate-500">chevron_right</span>
                  </button>

                  {/* Local Folder Auto-Save */}
                  <button
                    onClick={() => {
                      onOpenFolderSync();
                      setShowToolsDrawer(false);
                    }}
                    className="w-full text-left p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="material-icons-round text-base text-emerald-400">folder_shared</span>
                      <span className="text-xs font-semibold text-slate-200">{t.folderSync?.title || 'Folder Auto-Save & Sync'}</span>
                    </div>
                    {folderSettings.enabled && directoryHandle ? (
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    ) : (
                      <span className="material-icons-round text-xs text-slate-500">chevron_right</span>
                    )}
                  </button>

                  {/* Print / Sheet Setup */}
                  <button
                    onClick={() => {
                      onTogglePrintMode();
                      setShowToolsDrawer(false);
                    }}
                    className="w-full text-left p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="material-icons-round text-base text-rose-400">picture_as_pdf</span>
                      <span className="text-xs font-semibold text-slate-200">{t.togglePrintMode || 'Sheet Setup & Print Mode'}</span>
                    </div>
                    {isPrintMode && <span className="w-2 h-2 rounded-full bg-rose-400"></span>}
                  </button>
                </div>
              </div>

              {/* Group C: App Settings (Language, Theme, Security, About) */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  {t.settings || 'Settings'}
                </div>
                
                {/* Language Switcher */}
                <div className="mb-2.5">
                  <div className="text-[11px] text-slate-400 mb-1 flex items-center gap-1">
                    <span className="material-icons-round text-xs text-blue-400">translate</span>
                    <span>{t.languageLabel || 'Language'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                    {[
                      { code: 'en', label: 'English' },
                      { code: 'he', label: 'עברית' },
                      { code: 'ar', label: 'العربية' }
                    ].map(({ code, label }) => (
                      <button
                        key={code}
                        onClick={() => onLanguageChange(code as Language)}
                        className={`py-1.5 rounded-lg text-xs font-medium text-center transition-all ${
                          language === code
                            ? 'bg-blue-600 text-white font-bold shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Theme Switcher */}
                <div className="mb-2.5">
                  <div className="text-[11px] text-slate-400 mb-1 flex items-center gap-1">
                    <span className="material-icons-round text-xs text-amber-400">palette</span>
                    <span>{t.themeLabel || 'Theme'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button
                      onClick={() => onToggleTheme()}
                      className={`py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        theme === 'light'
                          ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="material-icons-round text-sm">light_mode</span>
                      <span>Light</span>
                    </button>
                    <button
                      onClick={() => onToggleTheme()}
                      className={`py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        theme === 'dark'
                          ? 'bg-blue-600/30 text-blue-300 font-bold border border-blue-500/40'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="material-icons-round text-sm">dark_mode</span>
                      <span>Dark</span>
                    </button>
                  </div>
                </div>

                {/* Security, About, Logout */}
                <div className="space-y-1 pt-1 border-t border-slate-800">
                  <button
                    onClick={() => {
                      onOpenSecurity();
                      setShowToolsDrawer(false);
                    }}
                    className="w-full text-left p-2 rounded-xl hover:bg-slate-800 text-slate-200 flex items-center gap-2 text-xs transition-colors"
                  >
                    <span className="material-icons-round text-sm text-blue-400">shield</span>
                    <span>{t.auth?.securitySettings || 'Security & Password Settings'}</span>
                  </button>

                  <button
                    onClick={() => {
                      onOpenAbout();
                      setShowToolsDrawer(false);
                    }}
                    className="w-full text-left p-2 rounded-xl hover:bg-slate-800 text-slate-200 flex items-center gap-2 text-xs transition-colors"
                  >
                    <span className="material-icons-round text-sm text-slate-400">info</span>
                    <span>{t.aboutApp || 'About SmartSchema'}</span>
                  </button>

                  {!isReadOnly && (
                    <button
                      onClick={() => {
                        setShowToolsDrawer(false);
                        onLogOut();
                      }}
                      className="w-full text-left p-2 rounded-xl hover:bg-red-950/50 text-red-400 flex items-center gap-2 text-xs transition-colors"
                    >
                      <span className="material-icons-round text-sm">logout</span>
                      <span>{t.auth?.logout || 'Log Out & Lock'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
