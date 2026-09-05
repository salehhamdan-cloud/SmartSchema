import React, { useState, useMemo } from 'react';
import { ElectricalNode, ComponentType, Page, Project } from '../types';
import { COMPONENT_CONFIG } from '../constants';
import { LegendIcon } from './LegendIcon';
import * as XLSX from 'xlsx';

export interface FlatTopologyRow {
  node: ElectricalNode;
  parent: ElectricalNode | null;
  branchIndex: number;
  depth: number;
  path: string[];
  pathNodes: ElectricalNode[];
  extraParents: ElectricalNode[];
  childrenCount: number;
  childrenNames: string[];
  isRoot: boolean;
  hasExtraConnections: boolean;
  hasMissingCable: boolean;
}

interface TopologyModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProject: Project;
  activePage: Page;
  onSelectNode: (node: ElectricalNode) => void;
  t: any;
  isDark?: boolean;
  isRTL?: boolean;
}

export const TopologyModal: React.FC<TopologyModalProps> = ({
  isOpen,
  onClose,
  activeProject,
  activePage,
  onSelectNode,
  t,
  isDark = true,
  isRTL = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [selectedTierFilter, setSelectedTierFilter] = useState<string>('ALL');
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<'depth' | 'name' | 'type' | 'parent' | 'amps' | 'kva' | 'children'>('depth');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [inspectedRow, setInspectedRow] = useState<FlatTopologyRow | null>(null);
  const [copiedPathIndex, setCopiedPathIndex] = useState<number | null>(null);

  // Helper to find any node in the page items
  const allNodesMap = useMemo(() => {
    const map = new Map<string, ElectricalNode>();
    const traverse = (node: ElectricalNode) => {
      map.set(node.id, node);
      node.children.forEach(traverse);
    };
    activePage.items.forEach(traverse);
    return map;
  }, [activePage.items]);

  // Build the flat topology dataset
  const topologyData = useMemo<FlatTopologyRow[]>(() => {
    const rows: FlatTopologyRow[] = [];

    const traverse = (
      node: ElectricalNode,
      parent: ElectricalNode | null,
      branchIndex: number,
      depth: number,
      path: string[],
      pathNodes: ElectricalNode[]
    ) => {
      const currentPath = [...path, node.name];
      const currentPathNodes = [...pathNodes, node];

      const extraParents: ElectricalNode[] = [];
      if (node.extraConnections && node.extraConnections.length > 0) {
        node.extraConnections.forEach(parentId => {
          const p = allNodesMap.get(parentId);
          if (p) extraParents.push(p);
        });
      }

      const isRoot = !parent;
      const isCableMissing = !isRoot && (!node.connectionStyle?.cableSize || node.connectionStyle.cableSize.trim() === '' || node.connectionStyle.cableSize === '-');

      rows.push({
        node,
        parent,
        branchIndex,
        depth,
        path: currentPath,
        pathNodes: currentPathNodes,
        extraParents,
        childrenCount: node.children ? node.children.length : 0,
        childrenNames: (node.children || []).map(c => c.name),
        isRoot,
        hasExtraConnections: extraParents.length > 0,
        hasMissingCable: isCableMissing
      });

      if (node.children && node.children.length > 0) {
        node.children.forEach((child, idx) => {
          traverse(child, node, idx + 1, depth + 1, currentPath, currentPathNodes);
        });
      }
    };

    activePage.items.forEach((root, idx) => {
      traverse(root, null, idx + 1, 0, [], []);
    });

    return rows;
  }, [activePage.items, allNodesMap]);

  // Extract unique locations for filtering
  const availableLocations = useMemo(() => {
    const locs = new Set<string>();
    topologyData.forEach(({ node }) => {
      const fullLoc = [node.building, node.floor, node.office, node.place].filter(Boolean).join(' / ');
      if (fullLoc) locs.add(fullLoc);
    });
    return Array.from(locs).sort();
  }, [topologyData]);

  // Topology Summary Statistics
  const stats = useMemo(() => {
    let totalNodes = topologyData.length;
    let totalLinks = 0;
    let sourcesCount = 0;
    let distBoardsCount = 0;
    let terminalLoadsCount = 0;
    let dualFeedCount = 0;
    let maxDepth = 0;
    let missingCablesCount = 0;

    topologyData.forEach(row => {
      if (row.parent) totalLinks++;
      totalLinks += row.extraParents.length;

      if (row.isRoot || row.node.type === ComponentType.SYSTEM_ROOT || row.node.type === ComponentType.GENERATOR || row.node.type === ComponentType.UPS) {
        sourcesCount++;
      }
      if (row.node.type === ComponentType.DISTRIBUTION_BOARD || row.node.type === ComponentType.BUSBAR) {
        distBoardsCount++;
      }
      if (row.childrenCount === 0 && !row.isRoot) {
        terminalLoadsCount++;
      }
      if (row.hasExtraConnections) {
        dualFeedCount++;
      }
      if (row.depth > maxDepth) {
        maxDepth = row.depth;
      }
      if (row.hasMissingCable) {
        missingCablesCount++;
      }
    });

    return {
      totalNodes,
      totalLinks,
      sourcesCount,
      distBoardsCount,
      terminalLoadsCount,
      dualFeedCount,
      maxDepth,
      missingCablesCount
    };
  }, [topologyData]);

  // Filter and sort the rows
  const filteredAndSortedRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return topologyData.filter(row => {
      // 1. Search Query
      if (q) {
        const nodeMatch = 
          row.node.name.toLowerCase().includes(q) ||
          (row.node.componentNumber && row.node.componentNumber.toLowerCase().includes(q)) ||
          (row.node.model && row.node.model.toLowerCase().includes(q)) ||
          (row.node.description && row.node.description.toLowerCase().includes(q)) ||
          (row.node.connectionStyle?.cableSize && row.node.connectionStyle.cableSize.toLowerCase().includes(q)) ||
          row.node.type.toLowerCase().includes(q);

        const parentMatch = row.parent && (
          row.parent.name.toLowerCase().includes(q) ||
          (row.parent.componentNumber && row.parent.componentNumber.toLowerCase().includes(q))
        );

        const extraParentMatch = row.extraParents.some(ep => ep.name.toLowerCase().includes(q));

        const locationMatch = [row.node.building, row.node.floor, row.node.office, row.node.place]
          .filter(Boolean)
          .some(loc => loc?.toLowerCase().includes(q));

        const pathMatch = row.path.some(p => p.toLowerCase().includes(q));

        if (!nodeMatch && !parentMatch && !extraParentMatch && !locationMatch && !pathMatch) {
          return false;
        }
      }

      // 2. Type Filter
      if (selectedTypeFilter !== 'ALL') {
        if (row.node.type !== selectedTypeFilter) return false;
      }

      // 3. Tier Filter
      if (selectedTierFilter === 'SOURCES') {
        if (!row.isRoot && row.node.type !== ComponentType.SYSTEM_ROOT && row.node.type !== ComponentType.GENERATOR && row.node.type !== ComponentType.UPS) return false;
      } else if (selectedTierFilter === 'DISTRIBUTION') {
        if (row.node.type !== ComponentType.DISTRIBUTION_BOARD && row.node.type !== ComponentType.BUSBAR) return false;
      } else if (selectedTierFilter === 'TERMINAL') {
        if (row.childrenCount > 0 || row.isRoot) return false;
      } else if (selectedTierFilter === 'DUAL_FEED') {
        if (!row.hasExtraConnections) return false;
      } else if (selectedTierFilter === 'MISSING_CABLES') {
        if (!row.hasMissingCable) return false;
      }

      // 4. Location Filter
      if (selectedLocationFilter !== 'ALL') {
        const fullLoc = [row.node.building, row.node.floor, row.node.office, row.node.place].filter(Boolean).join(' / ');
        if (fullLoc !== selectedLocationFilter) return false;
      }

      return true;
    }).sort((a, b) => {
      let comp = 0;
      if (sortField === 'depth') {
        comp = a.depth - b.depth;
      } else if (sortField === 'name') {
        comp = a.node.name.localeCompare(b.node.name);
      } else if (sortField === 'type') {
        comp = a.node.type.localeCompare(b.node.type);
      } else if (sortField === 'parent') {
        const pA = a.parent?.name || '';
        const pB = b.parent?.name || '';
        comp = pA.localeCompare(pB);
      } else if (sortField === 'amps') {
        comp = (a.node.amps || 0) - (b.node.amps || 0);
      } else if (sortField === 'kva') {
        comp = (a.node.kva || 0) - (b.node.kva || 0);
      } else if (sortField === 'children') {
        comp = a.childrenCount - b.childrenCount;
      }
      return sortOrder === 'asc' ? comp : -comp;
    });
  }, [topologyData, searchQuery, selectedTypeFilter, selectedTierFilter, selectedLocationFilter, sortField, sortOrder]);

  const handleSort = (field: 'depth' | 'name' | 'type' | 'parent' | 'amps' | 'kva' | 'children') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Export to XLSX
  const handleExportExcel = () => {
    try {
      const topT = t.connectionTopology?.table || {};
      const exportRows = filteredAndSortedRows.map((row, idx) => {
        const locationStr = [row.node.building, row.node.floor, row.node.office, row.node.place].filter(Boolean).join(' / ');
        const extraParentsStr = row.extraParents.map(p => p.name).join(', ');

        return {
          [topT.index || '#']: idx + 1,
          [topT.component || 'Component Name']: row.node.name,
          [topT.type || 'Type']: t.componentTypes[row.node.type] || row.node.type,
          'Component #': row.node.componentNumber || '',
          [topT.parent || 'Parent (Father)']: row.parent ? row.parent.name : (topT.sourceRoot || 'Source Root'),
          'Parent Type': row.parent ? (t.componentTypes[row.parent.type] || row.parent.type) : '',
          'Branch #': row.parent ? `#${row.branchIndex}` : '-',
          'Extra Feeds (Dual/ATS)': extraParentsStr || '-',
          [topT.cable || 'Feeder Cable']: row.node.connectionStyle?.cableSize || '-',
          'Cable Style': row.node.connectionStyle?.lineStyle || 'solid',
          [topT.level || 'Hierarchy Depth']: row.depth,
          [topT.path || 'Full Circuit Path']: row.path.join(' ➔ '),
          'Voltage (V)': row.node.voltage ?? '',
          'Current (Amps)': row.node.amps ?? '',
          'Power (kVA)': row.node.kva ?? '',
          [topT.childrenCount || 'Sub-Branches']: row.childrenCount,
          'Sub-Branches List': row.childrenNames.join(', ') || '-',
          'Essential Power': row.node.isEssential ? 'Yes' : 'No',
          'Generator Backup': row.node.hasGeneratorConnection ? (row.node.generatorName || 'Yes') : 'No',
          'Attached Meter': row.node.hasMeter ? (row.node.meterNumber || 'Yes') : 'No',
          'Switching Controller (ATS)': row.node.hasTransferSwitch 
            ? ([row.node.secondBreakerName, row.node.secondBreakerNumber ? `#${row.node.secondBreakerNumber}` : '', row.node.secondBreakerAmps !== undefined ? `${row.node.secondBreakerAmps}A` : ''].filter(Boolean).join(' • ') || 'Yes')
            : 'No',
          [topT.location || 'Physical Location']: locationStr || '',
          'Description': row.node.description || ''
        };
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportRows);
      ws['!views'] = [{ rightToLeft: isRTL }];
      ws['!cols'] = [
        { wch: 6 },
        { wch: 28 },
        { wch: 20 },
        { wch: 14 },
        { wch: 26 },
        { wch: 18 },
        { wch: 10 },
        { wch: 24 },
        { wch: 18 },
        { wch: 14 },
        { wch: 10 },
        { wch: 45 },
        { wch: 12 },
        { wch: 14 },
        { wch: 12 },
        { wch: 14 },
        { wch: 30 },
        { wch: 14 },
        { wch: 16 },
        { wch: 14 },
        { wch: 24 },
        { wch: 30 }
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Connection Topology');
      const filename = `${activeProject.name || 'Project'}_${activePage.name || 'Page'}_Topology.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error('Topology export error:', err);
      alert('Error generating Excel file');
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    try {
      const topT = t.connectionTopology?.table || {};
      const exportRows = filteredAndSortedRows.map((row, idx) => {
        const locationStr = [row.node.building, row.node.floor, row.node.office, row.node.place].filter(Boolean).join(' / ');
        const extraParentsStr = row.extraParents.map(p => p.name).join(', ');

        return {
          [topT.index || '#']: idx + 1,
          [topT.component || 'Component Name']: row.node.name,
          [topT.type || 'Type']: t.componentTypes[row.node.type] || row.node.type,
          [topT.parent || 'Parent']: row.parent ? row.parent.name : (topT.sourceRoot || 'Source Root'),
          'Branch': row.parent ? `#${row.branchIndex}` : '-',
          'Extra Feeds': extraParentsStr || '-',
          [topT.cable || 'Cable']: row.node.connectionStyle?.cableSize || '-',
          [topT.level || 'Depth']: row.depth,
          [topT.path || 'Circuit Path']: row.path.join(' ➔ '),
          'Voltage': row.node.voltage ?? '',
          'Amps': row.node.amps ?? '',
          'kVA': row.node.kva ?? '',
          'Children': row.childrenCount,
          [topT.location || 'Location']: locationStr || '',
          'Description': row.node.description || ''
        };
      });

      if (exportRows.length === 0) return;
      const headers = Object.keys(exportRows[0]);
      const csvContent = [
        headers.join(','),
        ...exportRows.map(row => headers.map(header => {
          const val = (row as any)[header];
          const valStr = val !== undefined && val !== null ? String(val) : '';
          return `"${valStr.replace(/"/g, '""')}"`;
        }).join(','))
      ].join('\n');

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeProject.name || 'Project'}_${activePage.name || 'Page'}_Topology.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      console.error('Topology CSV export error:', err);
    }
  };

  const handleCopyPath = (pathString: string, index: number) => {
    navigator.clipboard.writeText(pathString).then(() => {
      setCopiedPathIndex(index);
      setTimeout(() => setCopiedPathIndex(null), 2000);
    });
  };

  if (!isOpen) return null;

  const topTranslations = t.connectionTopology || {};
  const tableTrans = topTranslations.table || {};
  const summaryTrans = topTranslations.summary || {};
  const auditTrans = topTranslations.auditModal || {};

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 animate-fadeIn ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className={`w-full max-w-7xl max-h-[94vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-all ${isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'}`}>
        
        {/* Header Bar */}
        <div className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
              <span className="material-icons-round text-2xl">account_tree</span>
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                  {topTranslations.title || "Connection Topology"}
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30">
                  {activeProject.name} • {activePage.name}
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {topTranslations.subtitle || "Complete flat hierarchy audit of parent-child circuits and feeder lines"}
              </p>
            </div>
          </div>

          {/* Action Buttons in Header */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title={topTranslations.exportExcel || "Export Topology (.xlsx)"}
            >
              <span className="material-icons-round text-sm">table_view</span>
              <span className="hidden sm:inline">{topTranslations.exportExcel || "Excel (.xlsx)"}</span>
            </button>
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title={topTranslations.exportCsv || "Export CSV"}
            >
              <span className="material-icons-round text-sm">file_download</span>
              <span className="hidden sm:inline">{topTranslations.exportCsv || "CSV"}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Close"
            >
              <span className="material-icons-round text-xl">close</span>
            </button>
          </div>
        </div>

        {/* Audit Metrics Cards Strip */}
        <div className={`px-6 py-3 border-b grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 shrink-0 ${isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-100/70 border-slate-200'}`}>
          <div className={`px-3 py-2 rounded-xl border flex flex-col ${isDark ? 'bg-slate-800/60 border-slate-700/60' : 'bg-white border-slate-200'}`}>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <span className="material-icons-round text-xs text-blue-400">widgets</span>
              {summaryTrans.totalNodes || "Total Nodes"}
            </span>
            <span className="text-base font-bold mt-0.5 text-blue-400">{stats.totalNodes}</span>
          </div>

          <div className={`px-3 py-2 rounded-xl border flex flex-col ${isDark ? 'bg-slate-800/60 border-slate-700/60' : 'bg-white border-slate-200'}`}>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <span className="material-icons-round text-xs text-indigo-400">alt_route</span>
              {summaryTrans.totalLinks || "Total Links"}
            </span>
            <span className="text-base font-bold mt-0.5 text-indigo-400">{stats.totalLinks}</span>
          </div>

          <div className={`px-3 py-2 rounded-xl border flex flex-col ${isDark ? 'bg-slate-800/60 border-slate-700/60' : 'bg-white border-slate-200'}`}>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <span className="material-icons-round text-xs text-amber-400">offline_bolt</span>
              {summaryTrans.sources || "Sources"}
            </span>
            <span className="text-base font-bold mt-0.5 text-amber-400">{stats.sourcesCount}</span>
          </div>

          <div className={`px-3 py-2 rounded-xl border flex flex-col ${isDark ? 'bg-slate-800/60 border-slate-700/60' : 'bg-white border-slate-200'}`}>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <span className="material-icons-round text-xs text-emerald-400">dashboard</span>
              {summaryTrans.distributionBoards || "Dist. Boards"}
            </span>
            <span className="text-base font-bold mt-0.5 text-emerald-400">{stats.distBoardsCount}</span>
          </div>

          <div className={`px-3 py-2 rounded-xl border flex flex-col ${isDark ? 'bg-slate-800/60 border-slate-700/60' : 'bg-white border-slate-200'}`}>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <span className="material-icons-round text-xs text-purple-400">power</span>
              {summaryTrans.terminalLoads || "End Loads"}
            </span>
            <span className="text-base font-bold mt-0.5 text-purple-400">{stats.terminalLoadsCount}</span>
          </div>

          <div className={`px-3 py-2 rounded-xl border flex flex-col ${isDark ? 'bg-slate-800/60 border-slate-700/60' : 'bg-white border-slate-200'}`}>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <span className="material-icons-round text-xs text-cyan-400">cable</span>
              {summaryTrans.dualFeed || "Dual Feed"}
            </span>
            <span className="text-base font-bold mt-0.5 text-cyan-400">{stats.dualFeedCount}</span>
          </div>

          <div className={`px-3 py-2 rounded-xl border flex flex-col ${isDark ? 'bg-slate-800/60 border-slate-700/60' : 'bg-white border-slate-200'}`}>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <span className="material-icons-round text-xs text-rose-400">layers</span>
              {summaryTrans.maxDepth || "Max Depth"}
            </span>
            <span className="text-base font-bold mt-0.5 text-rose-400">Lvl {stats.maxDepth}</span>
          </div>
        </div>

        {/* Filter and Search Controls Bar */}
        <div className={`p-4 border-b flex flex-wrap items-center gap-3 shrink-0 ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
          
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px]">
            <span className="absolute top-1/2 -translate-y-1/2 left-3 material-icons-round text-slate-400 text-sm">search</span>
            <input
              type="text"
              placeholder={topTranslations.searchPlaceholder || "Search node, parent, cable, location..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full text-xs rounded-xl pl-9 pr-8 py-2 border transition-all focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                isDark 
                  ? 'bg-slate-800/90 border-slate-700 text-white placeholder-slate-500' 
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
              }`}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute top-1/2 -translate-y-1/2 right-2.5 text-slate-400 hover:text-white"
              >
                <span className="material-icons-round text-xs">close</span>
              </button>
            )}
          </div>

          {/* Tier Filter */}
          <div className="flex items-center gap-1.5">
            <select
              value={selectedTierFilter}
              onChange={(e) => setSelectedTierFilter(e.target.value)}
              className={`text-xs rounded-xl px-3 py-2 border font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer ${
                isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
              }`}
            >
              <option value="ALL">{topTranslations.allTiers || "All Tiers / Feeds"}</option>
              <option value="SOURCES">{topTranslations.sourcesOnly || "Power Sources Only"}</option>
              <option value="DISTRIBUTION">{topTranslations.distributionOnly || "Distribution Boards"}</option>
              <option value="TERMINAL">{topTranslations.terminalLoads || "Terminal Loads"}</option>
              <option value="DUAL_FEED">{topTranslations.multiParentOnly || "Dual-Feed / Multi-Parent"}</option>
              <option value="MISSING_CABLES">{topTranslations.missingCables || "Missing Cable Specs"}</option>
            </select>
          </div>

          {/* Component Type Filter */}
          <div className="flex items-center gap-1.5">
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className={`text-xs rounded-xl px-3 py-2 border font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer ${
                isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
              }`}
            >
              <option value="ALL">{topTranslations.allTypes || "All Component Types"}</option>
              {Object.values(ComponentType).map(type => (
                <option key={type} value={type}>
                  {t.componentTypes[type] || type}
                </option>
              ))}
            </select>
          </div>

          {/* Location Filter */}
          {availableLocations.length > 0 && (
            <div className="flex items-center gap-1.5">
              <select
                value={selectedLocationFilter}
                onChange={(e) => setSelectedLocationFilter(e.target.value)}
                className={`text-xs rounded-xl px-3 py-2 border font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer max-w-[200px] truncate ${
                  isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                }`}
              >
                <option value="ALL">{topTranslations.allLocations || "All Locations"}</option>
                {availableLocations.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
          )}

          {/* Filter Reset */}
          {(searchQuery || selectedTypeFilter !== 'ALL' || selectedTierFilter !== 'ALL' || selectedLocationFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedTypeFilter('ALL');
                setSelectedTierFilter('ALL');
                setSelectedLocationFilter('ALL');
              }}
              className="text-xs text-rose-400 hover:text-rose-300 hover:underline flex items-center gap-1 px-2 py-1"
            >
              <span className="material-icons-round text-xs">filter_list_off</span>
              <span>{t.filters?.clear || "Reset Filters"}</span>
            </button>
          )}

          <div className="ml-auto text-xs text-slate-400 font-medium">
            <span>{filteredAndSortedRows.length} / {topologyData.length} {t.topologyNodes || "nodes"}</span>
          </div>
        </div>

        {/* Main Table Area */}
        <div className="flex-1 overflow-auto custom-scrollbar relative">
          <table className="w-full text-left text-xs border-collapse">
            <thead className={`sticky top-0 z-20 font-semibold uppercase tracking-wider text-[11px] shadow-sm ${
              isDark ? 'bg-slate-950 text-slate-400 border-b border-slate-800' : 'bg-slate-200 text-slate-700 border-b border-slate-300'
            }`}>
              <tr>
                <th className="py-3 px-3 w-12 text-center">{tableTrans.index || "#"}</th>
                
                <th 
                  onClick={() => handleSort('name')}
                  className="py-3 px-4 cursor-pointer hover:text-sky-400 transition-colors select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>{tableTrans.component || "Component (Child Node)"}</span>
                    {sortField === 'name' && (
                      <span className="material-icons-round text-xs text-sky-400">
                        {sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                      </span>
                    )}
                  </div>
                </th>

                <th 
                  onClick={() => handleSort('type')}
                  className="py-3 px-3 cursor-pointer hover:text-sky-400 transition-colors select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>{tableTrans.type || "Type"}</span>
                    {sortField === 'type' && (
                      <span className="material-icons-round text-xs text-sky-400">
                        {sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                      </span>
                    )}
                  </div>
                </th>

                <th 
                  onClick={() => handleSort('parent')}
                  className="py-3 px-4 cursor-pointer hover:text-sky-400 transition-colors select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>{tableTrans.parent || "Direct Parent (Father)"}</span>
                    {sortField === 'parent' && (
                      <span className="material-icons-round text-xs text-sky-400">
                        {sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                      </span>
                    )}
                  </div>
                </th>

                <th className="py-3 px-3">{tableTrans.cable || "Feeder Cable"}</th>

                <th className="py-3 px-4">{tableTrans.path || "Circuit Lineage Path"}</th>

                <th 
                  onClick={() => handleSort('depth')}
                  className="py-3 px-3 text-center cursor-pointer hover:text-sky-400 transition-colors select-none w-16"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>{tableTrans.level || "Depth"}</span>
                    {sortField === 'depth' && (
                      <span className="material-icons-round text-xs text-sky-400">
                        {sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                      </span>
                    )}
                  </div>
                </th>

                <th 
                  onClick={() => handleSort('amps')}
                  className="py-3 px-3 cursor-pointer hover:text-sky-400 transition-colors select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>{tableTrans.specs || "Electrical"}</span>
                    {sortField === 'amps' && (
                      <span className="material-icons-round text-xs text-sky-400">
                        {sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                      </span>
                    )}
                  </div>
                </th>

                <th 
                  onClick={() => handleSort('children')}
                  className="py-3 px-3 text-center cursor-pointer hover:text-sky-400 transition-colors select-none w-20"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>{tableTrans.childrenCount || "Sons"}</span>
                    {sortField === 'children' && (
                      <span className="material-icons-round text-xs text-sky-400">
                        {sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                      </span>
                    )}
                  </div>
                </th>

                <th className="py-3 px-4">{tableTrans.location || "Location"}</th>

                <th className="py-3 px-3 text-right w-24">{tableTrans.actions || "Actions"}</th>
              </tr>
            </thead>

            <tbody className={`divide-y ${isDark ? 'divide-slate-800/80 bg-slate-900/50' : 'divide-slate-200 bg-white'}`}>
              {filteredAndSortedRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    <span className="material-icons-round text-3xl mb-2 text-slate-600 block">search_off</span>
                    {topTranslations.noMatchingNodes || "No components found matching current filters."}
                  </td>
                </tr>
              ) : (
                filteredAndSortedRows.map((row, index) => {
                  const compConfig = COMPONENT_CONFIG[row.node.type] || { icon: 'help', color: '#94a3b8' };
                  const locationStr = [row.node.building, row.node.floor, row.node.office, row.node.place].filter(Boolean).join(' / ');
                  const isHighlighted = inspectedRow?.node.id === row.node.id;

                  return (
                    <tr 
                      key={row.node.id} 
                      className={`group transition-colors ${
                        isHighlighted 
                          ? (isDark ? 'bg-sky-950/60 border-l-4 border-sky-500' : 'bg-sky-50 border-l-4 border-sky-500')
                          : (isDark ? 'hover:bg-slate-800/60' : 'hover:bg-slate-100/80')
                      }`}
                    >
                      {/* Index */}
                      <td className="py-2.5 px-3 text-center text-slate-500 font-mono text-[11px]">
                        {index + 1}
                      </td>

                      {/* Component (Child) */}
                      <td className="py-2.5 px-4 font-medium">
                        <div className="flex items-center gap-2.5">
                          <div 
                            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border"
                            style={{ 
                              backgroundColor: `${row.node.customColor || compConfig.color}15`,
                              borderColor: `${row.node.customColor || compConfig.color}40`,
                              color: row.node.customColor || compConfig.color
                            }}
                          >
                            <LegendIcon icon={compConfig.icon} color={row.node.customColor || compConfig.color} size={15} />
                          </div>

                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-sm truncate">{row.node.name}</span>
                              {row.node.componentNumber && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-700/70 text-slate-300 font-mono">
                                  #{row.node.componentNumber}
                                </span>
                              )}
                            </div>
                            
                            {/* Badges */}
                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              {row.node.isEssential && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                                  {t.csvHeaders?.essential || "ESSENTIAL"}
                                </span>
                              )}
                              {row.node.hasGeneratorConnection && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                                  GEN
                                </span>
                              )}
                              {row.node.hasMeter && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                                  MTR {row.node.meterNumber ? `#${row.node.meterNumber}` : ''}
                                </span>
                              )}
                              {row.node.isAirConditioning && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                                  A/C
                                </span>
                              )}
                              {row.node.hasTransferSwitch && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                                  ATS {row.node.secondBreakerName ? `(${row.node.secondBreakerName})` : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Type */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-300">
                        <span className="text-xs">{t.componentTypes[row.node.type] || row.node.type}</span>
                      </td>

                      {/* Parent (Father) */}
                      <td className="py-2.5 px-4">
                        {row.parent ? (
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-200">{row.parent.name}</span>
                              <span className="text-[10px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                                #{row.branchIndex}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {t.componentTypes[row.parent.type] || row.parent.type}
                            </span>
                            
                            {/* Extra Dual-Feed Parents */}
                            {row.extraParents.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {row.extraParents.map(ep => (
                                  <span key={ep.id} className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 flex items-center gap-1">
                                    <span className="material-icons-round text-[10px]">alt_route</span>
                                    <span>+ {ep.name}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                            {tableTrans.sourceRoot || "Source Root"}
                          </span>
                        )}
                      </td>

                      {/* Feeder Cable */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {!row.isRoot ? (
                          <div className="flex items-center gap-1.5">
                            <span 
                              className="w-2.5 h-2.5 rounded-full shrink-0 border"
                              style={{ backgroundColor: row.node.connectionStyle?.strokeColor || '#94a3b8' }}
                              title={`Cable Stroke: ${row.node.connectionStyle?.strokeColor || '#94a3b8'}`}
                            />
                            {row.node.connectionStyle?.cableSize ? (
                              <span className="font-mono text-xs text-sky-300 font-semibold bg-sky-950/40 px-1.5 py-0.5 rounded border border-sky-800/40">
                                {row.node.connectionStyle.cableSize}
                              </span>
                            ) : (
                              <span className="text-[10px] text-rose-400 italic bg-rose-950/30 px-1.5 py-0.5 rounded border border-rose-800/30">
                                {topTranslations.missingCableTag || "Unspecified"}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>

                      {/* Circuit Lineage Path */}
                      <td className="py-2.5 px-4 max-w-[280px]">
                        <div 
                          className="flex items-center gap-1 text-[11px] text-slate-300 font-mono overflow-x-auto custom-scrollbar py-1"
                          title={row.path.join(' ➔ ')}
                        >
                          {row.path.map((segment, sIdx) => (
                            <React.Fragment key={sIdx}>
                              <span className={`shrink-0 px-1 py-0.5 rounded ${sIdx === row.path.length - 1 ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30' : 'text-slate-400 hover:text-slate-200'}`}>
                                {segment}
                              </span>
                              {sIdx < row.path.length - 1 && (
                                <span className="text-slate-600 shrink-0">➔</span>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </td>

                      {/* Depth */}
                      <td className="py-2.5 px-3 text-center">
                        <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold">
                          L{row.depth}
                        </span>
                      </td>

                      {/* Electrical Specs */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex flex-col text-[11px] font-mono">
                          {row.node.voltage && <span>{row.node.voltage} V</span>}
                          {row.node.amps && <span className="text-amber-400 font-semibold">{row.node.amps} A</span>}
                          {row.node.kva && <span className="text-emerald-400">{row.node.kva} kVA</span>}
                          {!row.node.voltage && !row.node.amps && !row.node.kva && <span className="text-slate-500">-</span>}
                        </div>
                      </td>

                      {/* Sub-Branches */}
                      <td className="py-2.5 px-3 text-center">
                        {row.childrenCount > 0 ? (
                          <span 
                            className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-950/70 text-indigo-300 border border-indigo-800/60 font-semibold cursor-help"
                            title={row.childrenNames.join(', ')}
                          >
                            {row.childrenCount}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">0</span>
                        )}
                      </td>

                      {/* Location */}
                      <td className="py-2.5 px-4 text-[11px] text-slate-300 max-w-[180px] truncate" title={locationStr}>
                        {locationStr || <span className="text-slate-600">-</span>}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              onSelectNode(row.node);
                              onClose();
                            }}
                            className="p-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/40 text-sky-300 border border-sky-500/30 transition-colors"
                            title={tableTrans.locate || "Locate & Highlight in Diagram"}
                          >
                            <span className="material-icons-round text-sm">my_location</span>
                          </button>
                          <button
                            onClick={() => setInspectedRow(row)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                            title={tableTrans.inspectPath || "Audit Full Circuit Path"}
                          >
                            <span className="material-icons-round text-sm">visibility</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Circuit Path Audit Drawer / Inspector Modal (When a row is inspected) */}
        {inspectedRow && (
          <div className={`p-4 border-t shrink-0 animate-fadeIn ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-300'}`}>
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-sky-400">timeline</span>
                <span className="font-bold text-sm">
                  {auditTrans.title || "Circuit Path Audit"}: <span className="text-sky-400">{inspectedRow.node.name}</span>
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                  {inspectedRow.path.length} steps • Level {inspectedRow.depth}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyPath(inspectedRow.path.join(' ➔ '), 999)}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 flex items-center gap-1"
                >
                  <span className="material-icons-round text-xs">content_copy</span>
                  <span>{copiedPathIndex === 999 ? (tableTrans.pathCopied || "Copied!") : (tableTrans.copyPath || "Copy Path")}</span>
                </button>
                <button
                  onClick={() => {
                    onSelectNode(inspectedRow.node);
                    onClose();
                  }}
                  className="px-2.5 py-1 text-xs bg-sky-600 hover:bg-sky-500 text-white rounded font-medium flex items-center gap-1"
                >
                  <span className="material-icons-round text-xs">my_location</span>
                  <span>{tableTrans.locate || "Locate in Diagram"}</span>
                </button>
                <button
                  onClick={() => setInspectedRow(null)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <span className="material-icons-round text-base">close</span>
                </button>
              </div>
            </div>

            {/* Stepped Visual Trail */}
            <div className="flex flex-wrap items-center gap-2 py-2 overflow-x-auto custom-scrollbar">
              {inspectedRow.pathNodes.map((pn, pIndex) => {
                const pConfig = COMPONENT_CONFIG[pn.type] || { icon: 'help', color: '#94a3b8' };
                const isTarget = pIndex === inspectedRow.pathNodes.length - 1;

                return (
                  <React.Fragment key={pn.id}>
                    <div 
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                        isTarget 
                          ? 'bg-sky-600/20 border-sky-500/60 shadow-lg shadow-sky-900/30' 
                          : 'bg-slate-900 border-slate-700/80'
                      }`}
                    >
                      <div 
                        className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${pn.customColor || pConfig.color}20`, color: pn.customColor || pConfig.color }}
                      >
                        <LegendIcon icon={pConfig.icon} color={pn.customColor || pConfig.color} size={14} />
                      </div>
                      <div className="flex flex-col">
                        <span className={`text-xs font-semibold ${isTarget ? 'text-sky-300' : 'text-slate-200'}`}>
                          {pn.name}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {t.componentTypes[pn.type] || pn.type} {pn.amps ? `• ${pn.amps}A` : ''}
                        </span>
                      </div>
                    </div>

                    {pIndex < inspectedRow.pathNodes.length - 1 && (
                      <div className="flex flex-col items-center">
                        <span className="material-icons-round text-slate-500 text-sm">arrow_forward</span>
                        {inspectedRow.pathNodes[pIndex + 1].connectionStyle?.cableSize && (
                          <span className="text-[9px] text-sky-400 font-mono">
                            {inspectedRow.pathNodes[pIndex + 1].connectionStyle?.cableSize}
                          </span>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
