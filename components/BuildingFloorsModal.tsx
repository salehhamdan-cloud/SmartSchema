import React, { useState, useMemo, useRef } from 'react';
import { ElectricalNode, ComponentType, Page, Project, Language, Theme } from '../types';
import { COMPONENT_CONFIG } from '../constants';
import { LegendIcon } from './LegendIcon';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';

export interface FlattenedBuildingNode {
  node: ElectricalNode;
  pageId: string;
  pageName: string;
  projectId: string;
  projectName: string;
  parent: ElectricalNode | null;
  directSons: ElectricalNode[];
  feederCable?: string;
  isRoot: boolean;
  building: string;
  floor: string;
  place: string;
  office: string;
}

export interface FloorGroup {
  key: string;
  displayName: string;
  levelRank: number;
  elevation: string;
  isUnassigned: boolean;
  nodes: FlattenedBuildingNode[];
  totalKva: number;
  totalAmps: number;
  boardsCount: number;
  sonsCount: number;
  essentialCount: number;
  rooms: Map<string, FlattenedBuildingNode[]>;
  enclosures: {
    board: FlattenedBuildingNode;
    localSons: FlattenedBuildingNode[];
    remoteSons: FlattenedBuildingNode[];
  }[];
  standaloneNodes: FlattenedBuildingNode[];
}

interface BuildingFloorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProject: Project;
  allProjects: Project[];
  activePage: Page;
  onNavigateToNode: (pageId: string, nodeId: string) => void;
  onUpdateNodeLocation?: (pageId: string, nodeId: string, updates: Partial<ElectricalNode>) => void;
  t: any;
  language: Language;
  theme: Theme;
  isRTL?: boolean;
}

// Helper to determine floor ordering rank and default elevation
function parseFloorLevel(rawFloor?: string, tFloorNames?: any): {
  key: string;
  displayName: string;
  rank: number;
  elevation: string;
  isUnassigned: boolean;
} {
  if (!rawFloor || !rawFloor.trim()) {
    return {
      key: '__unassigned__',
      displayName: tFloorNames?.unassigned || 'Unassigned Floor',
      rank: -9999,
      elevation: '--',
      isUnassigned: true
    };
  }

  const str = rawFloor.trim();
  const lower = str.toLowerCase();

  // Roof / Penthouse
  if (/roof|גג|سطح|penthouse/i.test(lower)) {
    return {
      key: 'Roof',
      displayName: tFloorNames?.roof || 'Roof / Penthouse',
      rank: 1000,
      elevation: '+12.00m',
      isUnassigned: false
    };
  }

  // Basement 2
  if (/b2|-2|basement\s*2|מרתף\s*2|بدروم\s*2|قبو\s*2/i.test(lower)) {
    return {
      key: 'Basement 2',
      displayName: tFloorNames?.basement2 || 'Basement 2 (B2)',
      rank: -2,
      elevation: '-6.50m',
      isUnassigned: false
    };
  }

  // Basement 1
  if (/b1|-1|basement|מרתף|بدروم|قبو/i.test(lower)) {
    return {
      key: 'Basement 1',
      displayName: tFloorNames?.basement1 || 'Basement 1 (B1)',
      rank: -1,
      elevation: '-3.20m',
      isUnassigned: false
    };
  }

  // Ground Floor
  if (/ground|קרקע|ارضي|أرضي|g|0/i.test(lower) && !/\d+/.test(lower.replace(/ground|קרקע|ارضي|أرضي|g|0/gi, ''))) {
    return {
      key: 'Ground Floor',
      displayName: tFloorNames?.ground || 'Ground Floor (Level 0)',
      rank: 0,
      elevation: '±0.00m',
      isUnassigned: false
    };
  }

  // Numbered floors (e.g., "Floor 3", "קומה 3", "3", "3rd", "طابق 2")
  const numMatch = str.match(/(-?\d+)/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    const elev = (num * 3.6).toFixed(1);
    const sign = num > 0 ? '+' : '';
    let dispName = str;
    if (num === 1 && tFloorNames?.floor1) dispName = tFloorNames.floor1;
    else if (num === 2 && tFloorNames?.floor2) dispName = tFloorNames.floor2;
    else if (num === 3 && tFloorNames?.floor3) dispName = tFloorNames.floor3;
    else if (!str.includes(' ') && !str.includes('Floor') && !str.includes('קומה') && !str.includes('طابق')) {
      dispName = `Floor ${num}`;
    }

    return {
      key: `Floor ${num}`,
      displayName: dispName,
      rank: num,
      elevation: `${sign}${elev}m`,
      isUnassigned: false
    };
  }

  // Custom named floors (e.g., "Mezzanine", "Gallery")
  return {
    key: str,
    displayName: str,
    rank: 0.5,
    elevation: '+1.80m',
    isUnassigned: false
  };
}

export const BuildingFloorsModal: React.FC<BuildingFloorsModalProps> = ({
  isOpen,
  onClose,
  activeProject,
  allProjects,
  activePage,
  onNavigateToNode,
  onUpdateNodeLocation,
  t,
  language,
  theme,
  isRTL: isRTLProp = false
}) => {
  const isRTL = Boolean(isRTLProp || language === 'he' || language === 'ar');
  const bfT = t.buildingFloors || {};
  const floorNamesT = bfT.floorNames || {};

  // Filters & State
  const [scanScope, setScanScope] = useState<'active_project' | 'active_page' | 'all_projects'>('active_project');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [essentialOnly, setEssentialOnly] = useState<boolean>(false);
  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(null);
  const [activeFloorKey, setActiveFloorKey] = useState<string | null>(null);
  const [quickAssignTargetId, setQuickAssignTargetId] = useState<string | null>(null);
  const [editLocationForm, setEditLocationForm] = useState<{
    building: string;
    floor: string;
    place: string;
    office: string;
  }>({ building: '', floor: '', place: '', office: '' });
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  // 1. Traverse and extract all nodes with parent-son references across the chosen scope
  const allExtractedNodes = useMemo<FlattenedBuildingNode[]>(() => {
    const list: FlattenedBuildingNode[] = [];

    // Determine target projects
    const projectsToScan = scanScope === 'all_projects' ? allProjects : [activeProject];

    projectsToScan.forEach(proj => {
      const pagesToScan = scanScope === 'active_page' && proj.id === activeProject.id
        ? [activePage]
        : proj.pages;

      pagesToScan.forEach(page => {
        // Build map for instant lookup within this page
        const pageNodeMap = new Map<string, ElectricalNode>();
        const register = (n: ElectricalNode) => {
          pageNodeMap.set(n.id, n);
          (n.children || []).forEach(register);
        };
        (page.items || []).forEach(register);

        // Traverse hierarchy
        const traverse = (n: ElectricalNode, parent: ElectricalNode | null) => {
          list.push({
            node: n,
            pageId: page.id,
            pageName: page.name,
            projectId: proj.id,
            projectName: proj.name,
            parent,
            directSons: n.children || [],
            feederCable: n.connectionStyle?.cableSize,
            isRoot: !parent,
            building: (n.building || '').trim(),
            floor: (n.floor || '').trim(),
            place: (n.place || '').trim(),
            office: (n.office || '').trim()
          });

          (n.children || []).forEach(child => {
            traverse(child, n);
          });
        };

        (page.items || []).forEach(rootNode => {
          traverse(rootNode, null);
        });
      });
    });

    return list;
  }, [scanScope, activeProject, allProjects, activePage]);

  // Lookup map of all extracted nodes by ID
  const extractedMap = useMemo(() => {
    const map = new Map<string, FlattenedBuildingNode>();
    allExtractedNodes.forEach(item => {
      map.set(item.node.id, item);
    });
    return map;
  }, [allExtractedNodes]);

  // 2. Discover all buildings
  const availableBuildings = useMemo(() => {
    const bSet = new Set<string>();
    allExtractedNodes.forEach(item => {
      if (item.building) {
        bSet.add(item.building);
      }
    });
    return Array.from(bSet).sort();
  }, [allExtractedNodes]);

  // 3. Filter nodes by Building, Search, Type, Essential
  const filteredNodes = useMemo(() => {
    return allExtractedNodes.filter(item => {
      // Building filter
      if (selectedBuilding !== 'ALL') {
        if (selectedBuilding === '__unassigned__') {
          if (item.building) return false;
        } else if (item.building !== selectedBuilding) {
          return false;
        }
      }

      // Type filter
      if (selectedTypeFilter !== 'ALL' && item.node.type !== selectedTypeFilter) {
        return false;
      }

      // Essential filter
      if (essentialOnly && !item.node.isEssential) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.node.name.toLowerCase().includes(q);
        const matchesNum = (item.node.componentNumber || '').toLowerCase().includes(q);
        const matchesPlace = item.place.toLowerCase().includes(q);
        const matchesFloor = item.floor.toLowerCase().includes(q);
        const matchesParent = item.parent ? item.parent.name.toLowerCase().includes(q) : false;
        const matchesType = (t.componentTypes[item.node.type] || '').toLowerCase().includes(q);
        if (!matchesName && !matchesNum && !matchesPlace && !matchesFloor && !matchesParent && !matchesType) {
          return false;
        }
      }

      return true;
    });
  }, [allExtractedNodes, selectedBuilding, selectedTypeFilter, essentialOnly, searchQuery, t]);

  // 4. Group into Floors (Architectural vertical order: Roof -> Higher floors -> Ground -> Basements -> Unassigned)
  const floorGroups = useMemo<FloorGroup[]>(() => {
    const map = new Map<string, FloorGroup>();

    // Process each filtered node
    filteredNodes.forEach(item => {
      const parsed = parseFloorLevel(item.floor, floorNamesT);
      let group = map.get(parsed.key);

      if (!group) {
        group = {
          key: parsed.key,
          displayName: parsed.displayName,
          levelRank: parsed.rank,
          elevation: parsed.elevation,
          isUnassigned: parsed.isUnassigned,
          nodes: [],
          totalKva: 0,
          totalAmps: 0,
          boardsCount: 0,
          sonsCount: 0,
          essentialCount: 0,
          rooms: new Map<string, FlattenedBuildingNode[]>(),
          enclosures: [],
          standaloneNodes: []
        };
        map.set(parsed.key, group);
      }

      group.nodes.push(item);

      // Accumulate stats
      const kva = item.node.kva || (item.node.amps && item.node.voltage ? (item.node.amps * item.node.voltage) / 1000 : 0);
      group.totalKva += kva;
      group.totalAmps += item.node.amps || 0;
      if (item.node.isEssential) group.essentialCount++;
      if (item.node.type === ComponentType.DISTRIBUTION_BOARD || item.node.type === ComponentType.SYSTEM_ROOT || item.node.type === ComponentType.TRANSFORMER || item.node.type === ComponentType.GENERATOR) {
        group.boardsCount++;
      }
      group.sonsCount += item.directSons.length;

      // Group by room
      const roomKey = item.place || item.office || (language === 'en' ? 'General Space' : language === 'he' ? 'חלל כללי' : 'منطقة عامة');
      const roomList = group.rooms.get(roomKey) || [];
      roomList.push(item);
      group.rooms.set(roomKey, roomList);
    });

    // Structure each floor into Enclosure Bays (Boards + their sons) and Standalone Nodes
    map.forEach(group => {
      const boardSet = new Set<string>();

      // Identify boards/enclosures residing on this floor
      group.nodes.forEach(item => {
        const isEnclosureHost = item.node.type === ComponentType.DISTRIBUTION_BOARD ||
          item.node.type === ComponentType.SYSTEM_ROOT ||
          item.node.type === ComponentType.TRANSFORMER ||
          item.node.type === ComponentType.GENERATOR ||
          item.node.type === ComponentType.BUSBAR;

        if (isEnclosureHost && item.directSons.length > 0) {
          boardSet.add(item.node.id);

          // Find sons that are physically on this floor vs on other floors
          const localSons: FlattenedBuildingNode[] = [];
          const remoteSons: FlattenedBuildingNode[] = [];

          item.directSons.forEach(son => {
            const sonExtracted = extractedMap.get(son.id);
            if (sonExtracted) {
              const sonParsedFloor = parseFloorLevel(sonExtracted.floor, floorNamesT);
              if (sonParsedFloor.key === group.key || (!sonExtracted.floor && group.isUnassigned)) {
                localSons.push(sonExtracted);
              } else {
                remoteSons.push(sonExtracted);
              }
            } else {
              // Fallback
              localSons.push({
                node: son,
                pageId: item.pageId,
                pageName: item.pageName,
                projectId: item.projectId,
                projectName: item.projectName,
                parent: item.node,
                directSons: son.children || [],
                isRoot: false,
                building: son.building || item.building,
                floor: son.floor || item.floor,
                place: son.place || item.place,
                office: son.office || item.office
              });
            }
          });

          group.enclosures.push({
            board: item,
            localSons,
            remoteSons
          });
        }
      });

      // All sons that are already inside a local enclosure bay don't need to be duplicated as standalone
      const enclosedLocalSonIds = new Set<string>();
      group.enclosures.forEach(enc => {
        enc.localSons.forEach(s => enclosedLocalSonIds.add(s.node.id));
      });

      // Standalone components on this floor
      group.nodes.forEach(item => {
        if (!boardSet.has(item.node.id) && !enclosedLocalSonIds.has(item.node.id)) {
          group.standaloneNodes.push(item);
        }
      });
    });

    // Sort floors vertically: Roof (highest rank) down to Basements, then Unassigned at bottom
    return Array.from(map.values()).sort((a, b) => {
      if (a.isUnassigned) return 1;
      if (b.isUnassigned) return -1;
      return b.levelRank - a.levelRank;
    });
  }, [filteredNodes, floorNamesT, extractedMap, language]);

  // Selected Inspected Node
  const inspectedItem = useMemo(() => {
    if (!inspectedNodeId) return null;
    return extractedMap.get(inspectedNodeId) || null;
  }, [inspectedNodeId, extractedMap]);

  // Overall Building Totals
  const buildingTotals = useMemo(() => {
    let kva = 0;
    let amps = 0;
    let nodes = filteredNodes.length;
    let boards = 0;
    let sons = 0;
    let essential = 0;

    filteredNodes.forEach(item => {
      kva += item.node.kva || (item.node.amps && item.node.voltage ? (item.node.amps * item.node.voltage) / 1000 : 0);
      amps += item.node.amps || 0;
      if (item.node.isEssential) essential++;
      if (item.node.type === ComponentType.DISTRIBUTION_BOARD || item.node.type === ComponentType.SYSTEM_ROOT) boards++;
      sons += item.directSons.length;
    });

    return { kva, amps, nodes, boards, sons, essential };
  }, [filteredNodes]);

  // Scroll to floor slab
  const handleScrollToFloor = (floorKey: string) => {
    setActiveFloorKey(floorKey);
    const el = document.getElementById(`floor-slab-${floorKey.replace(/\s+/g, '_')}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Inspect node and initialize edit form
  const handleInspect = (item: FlattenedBuildingNode) => {
    setInspectedNodeId(item.node.id);
    setEditLocationForm({
      building: item.building || '',
      floor: item.floor || '',
      place: item.place || '',
      office: item.office || ''
    });
  };

  // Save location updates directly to project
  const handleSaveLocation = () => {
    if (!inspectedItem || !onUpdateNodeLocation) return;
    onUpdateNodeLocation(inspectedItem.pageId, inspectedItem.node.id, {
      building: editLocationForm.building.trim(),
      floor: editLocationForm.floor.trim(),
      place: editLocationForm.place.trim(),
      office: editLocationForm.office.trim()
    });
  };

  // Quick floor assign from Unassigned tray
  const handleQuickAssignFloor = (targetItem: FlattenedBuildingNode, chosenFloor: string) => {
    if (!onUpdateNodeLocation) return;
    onUpdateNodeLocation(targetItem.pageId, targetItem.node.id, {
      floor: chosenFloor
    });
    setQuickAssignTargetId(null);
  };

  // Helper: Canvas 2D rounded rectangle with isolated path creation
  const drawRoundRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) => {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      try {
        (ctx as any).roundRect(x, y, w, h, radius);
        return;
      } catch (_) {}
    }
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };

  // Helper: XML Escaping for robust SVG rendering
  const escapeXml = (unsafe: string | number | undefined | null): string => {
    if (unsafe === undefined || unsafe === null) return '';
    return String(unsafe)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // remove illegal XML control characters
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  // Calculate pixel height required for a set of floor groups
  const calculateElevationHeight = (floorsToRender: FloorGroup[]): number => {
    let height = 30 + 98 + 25; // initial padding + header + gap
    floorsToRender.forEach(floor => {
      height += 56; // slab banner + gap
      if (floor.enclosures.length > 0) {
        height += 24; // section label
        const encRows = Math.ceil(floor.enclosures.length / 2);
        for (let r = 0; r < encRows; r++) {
          const enc1 = floor.enclosures[r * 2];
          const enc2 = floor.enclosures[r * 2 + 1];
          const maxSons = Math.max(
            enc1 ? enc1.localSons.length : 0,
            enc2 ? enc2.localSons.length : 0
          );
          const sonsRows = Math.ceil(maxSons / 3);
          const encHeight = 62 + (maxSons > 0 ? sonsRows * 44 + 14 : 14);
          height += encHeight + 14;
        }
      }
      if (floor.standaloneNodes.length > 0) {
        height += 24; // section label
        const devRows = Math.ceil(floor.standaloneNodes.length / 4);
        height += devRows * (44 + 8) + 10;
      }
      height += 22; // floor bottom gap
    });
    height += 55; // footer
    return Math.max(900, height);
  };

  // Helper: Truncate string safely without clipping unicode or undefined values
  const safeText = (text: string | undefined | null, maxLen: number = 24): string => {
    if (!text) return '';
    const str = String(text).trim();
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 1) + '…';
  };

  // Direct Canvas 2D Renderer for architectural building elevation (100% reliable, zero image decoding, native RTL)
  const renderElevationToCanvas = (
    floorsToRender: FloorGroup[],
    pageNum?: number,
    totalPages?: number,
    scale: number = 2.0
  ): HTMLCanvasElement => {
    const svgWidth = 1400;
    const totalHeight = calculateElevationHeight(floorsToRender);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(svgWidth * scale);
    canvas.height = Math.round(totalHeight * scale);
    canvas.dir = isRTL ? 'rtl' : 'ltr';

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }

    ctx.save();
    ctx.scale(scale, scale);
    try {
      ctx.direction = isRTL ? 'rtl' : 'ltr';
    } catch (_) {}
    ctx.textBaseline = 'alphabetic';

    const fontSans = (size: number, weight: string = 'normal', style: string = 'normal') => {
      const isItalic = weight === 'italic' || style === 'italic';
      const actualWeight = weight === 'italic' ? 'normal' : weight;
      const stylePrefix = isItalic ? 'italic ' : '';
      return `${stylePrefix}${actualWeight} ${size}px "Cairo", "Heebo", "Rubik", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
    };
    const fontMono = (size: number, weight: string = 'bold') =>
      `${weight} ${size}px "Roboto Mono", ui-monospace, SFMono-Regular, monospace`;

    // 1. Dark Blueprint Background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, svgWidth, totalHeight);

    let currentY = 30;
    const headerHeight = 98;

    // 2. Title Block Header
    drawRoundRect(ctx, 40, currentY, svgWidth - 80, headerHeight, 12);
    ctx.fillStyle = '#111827';
    ctx.fill();
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const buildingStr = `${bfT.building || 'Building'}: ${selectedBuilding === 'ALL' ? (bfT.allBuildings || 'All Buildings') : selectedBuilding} • ${bfT.scope || 'Scope'}: ${scanScope === 'active_page' ? (bfT.activePageOnly || 'Active Page') : scanScope === 'all_projects' ? (bfT.allProjects || 'All Projects') : (bfT.allPages || 'All Pages')}`;
    const pageDateStr = `${new Date().toLocaleDateString()}${pageNum && totalPages ? ` • Page ${pageNum} of ${totalPages}` : ''}`;

    if (isRTL) {
      // --- RTL Title Block Header ---
      // Stats Card on the LEFT
      const statsWidth = 365;
      const statsX = 55;
      drawRoundRect(ctx, statsX, currentY + 16, statsWidth, 66, 8);
      ctx.fillStyle = '#1f2937';
      ctx.fill();
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Stats inside card: right to left
      ctx.textAlign = 'right';
      // Total Load (right col)
      ctx.fillStyle = '#f59e0b';
      ctx.font = fontSans(13, 'bold');
      ctx.fillText(`${buildingTotals.kva.toFixed(1)} kVA`, statsX + statsWidth - 20, currentY + 38);
      ctx.fillStyle = '#9ca3af';
      ctx.font = fontSans(10, 'normal');
      ctx.fillText(bfT.totalLoad || 'Total Load', statsX + statsWidth - 20, currentY + 56);

      // Current (middle col)
      ctx.fillStyle = '#e5e7eb';
      ctx.font = fontSans(13, 'bold');
      ctx.fillText(`${buildingTotals.amps} A`, statsX + statsWidth - 130, currentY + 38);
      ctx.fillStyle = '#9ca3af';
      ctx.font = fontSans(10, 'normal');
      ctx.fillText(bfT.totalCurrent || 'Current', statsX + statsWidth - 130, currentY + 56);

      // Equipment (left col)
      ctx.fillStyle = '#38bdf8';
      ctx.font = fontSans(13, 'bold');
      ctx.fillText(`${buildingTotals.nodes} items`, statsX + statsWidth - 235, currentY + 38);
      ctx.fillStyle = '#9ca3af';
      ctx.font = fontSans(10, 'normal');
      ctx.fillText(bfT.totalComponents || 'Equipment', statsX + statsWidth - 235, currentY + 56);

      // Date / Page
      ctx.fillStyle = '#6b7280';
      ctx.font = fontSans(9, 'normal');
      ctx.fillText(pageDateStr, statsX + statsWidth - 20, currentY + 74);

      // Building Icon on the RIGHT
      const iconCenterX = svgWidth - 68;
      ctx.beginPath();
      ctx.arc(iconCenterX, currentY + 38, 18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
      ctx.fill();

      // Vector Building Path
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(iconCenterX - 9, currentY + 29, 18, 18);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(iconCenterX - 5, currentY + 33, 3, 3);
      ctx.fillRect(iconCenterX + 2, currentY + 33, 3, 3);
      ctx.fillRect(iconCenterX - 5, currentY + 39, 3, 3);
      ctx.fillRect(iconCenterX + 2, currentY + 39, 3, 3);

      // Title Text (Right-aligned)
      ctx.fillStyle = '#f9fafb';
      ctx.font = fontSans(20, 'bold');
      ctx.textAlign = 'right';
      ctx.fillText(`${activeProject.name} — ${bfT.title || 'Building & Floor Distribution'}`, svgWidth - 100, currentY + 38);

      // Subtitle
      ctx.fillStyle = '#9ca3af';
      ctx.font = fontSans(12, 'normal');
      ctx.fillText(bfT.noLinesNote || 'Physical layout: Feeder connections grouped by panel bay without lines', svgWidth - 100, currentY + 62);

      // Scope & Building
      ctx.fillStyle = '#60a5fa';
      ctx.font = fontSans(11, '600');
      ctx.fillText(buildingStr, svgWidth - 100, currentY + 84);
    } else {
      // --- LTR Title Block Header ---
      // Building Icon Badge
      ctx.beginPath();
      ctx.arc(68, currentY + 38, 18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
      ctx.fill();

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(59, currentY + 29, 18, 18);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(63, currentY + 33, 3, 3);
      ctx.fillRect(70, currentY + 33, 3, 3);
      ctx.fillRect(63, currentY + 39, 3, 3);
      ctx.fillRect(70, currentY + 39, 3, 3);

      // Title Text
      ctx.textAlign = 'left';
      ctx.fillStyle = '#f9fafb';
      ctx.font = fontSans(20, 'bold');
      ctx.fillText(`${activeProject.name} — ${bfT.title || 'Building & Floor Distribution'}`, 100, currentY + 38);

      // Subtitle
      ctx.fillStyle = '#9ca3af';
      ctx.font = fontSans(12, 'normal');
      ctx.fillText(bfT.noLinesNote || 'Physical layout: Feeder connections grouped by panel bay without lines', 100, currentY + 62);

      // Scope & Building
      ctx.fillStyle = '#60a5fa';
      ctx.font = fontSans(11, '600');
      ctx.fillText(buildingStr, 100, currentY + 84);

      // Stats Card on the RIGHT
      drawRoundRect(ctx, svgWidth - 460, currentY + 16, 365, 66, 8);
      ctx.fillStyle = '#1f2937';
      ctx.fill();
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.font = fontSans(13, 'bold');
      ctx.fillText(`${buildingTotals.kva.toFixed(1)} kVA`, svgWidth - 440, currentY + 38);
      ctx.fillStyle = '#9ca3af';
      ctx.font = fontSans(10, 'normal');
      ctx.fillText(bfT.totalLoad || 'Total Load', svgWidth - 440, currentY + 56);

      ctx.fillStyle = '#e5e7eb';
      ctx.font = fontSans(13, 'bold');
      ctx.fillText(`${buildingTotals.amps} A`, svgWidth - 340, currentY + 38);
      ctx.fillStyle = '#9ca3af';
      ctx.font = fontSans(10, 'normal');
      ctx.fillText(bfT.totalCurrent || 'Current', svgWidth - 340, currentY + 56);

      ctx.fillStyle = '#38bdf8';
      ctx.font = fontSans(13, 'bold');
      ctx.fillText(`${buildingTotals.nodes} items`, svgWidth - 245, currentY + 38);
      ctx.fillStyle = '#9ca3af';
      ctx.font = fontSans(10, 'normal');
      ctx.fillText(bfT.totalComponents || 'Equipment', svgWidth - 245, currentY + 56);

      ctx.fillStyle = '#6b7280';
      ctx.font = fontSans(9, 'normal');
      ctx.fillText(pageDateStr, svgWidth - 440, currentY + 74);
    }

    currentY += headerHeight + 25;

    // 3. Render Each Floor Slab
    floorsToRender.forEach(floor => {
      const isUnassigned = floor.isUnassigned;
      const slabFill = isUnassigned ? '#451a03' : '#1e293b';
      const slabStroke = isUnassigned ? '#b45309' : '#475569';
      const slabTitleColor = isUnassigned ? '#fde68a' : '#f8fafc';

      // Slab Banner Bar
      drawRoundRect(ctx, 40, currentY, svgWidth - 80, 46, 8);
      ctx.fillStyle = slabFill;
      ctx.fill();
      ctx.strokeStyle = slabStroke;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      if (isRTL) {
        // RTL Floor Banner
        // Level elevation badge on the RIGHT
        const badgeX = svgWidth - 127;
        drawRoundRect(ctx, badgeX, currentY + 9, 75, 28, 6);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.font = fontMono(11, 'bold');
        ctx.textAlign = 'center';
        ctx.fillText(floor.elevation, badgeX + 37.5, currentY + 27);

        // Floor Name on the RIGHT (to the left of badge)
        ctx.fillStyle = slabTitleColor;
        ctx.font = fontSans(16, 'bold');
        ctx.textAlign = 'right';
        ctx.fillText(floor.displayName, badgeX - 15, currentY + 29);

        // Essential Badge
        if (floor.essentialCount > 0) {
          ctx.font = fontSans(16, 'bold');
          const nameWidth = ctx.measureText(floor.displayName).width;
          const essX = Math.max(380, badgeX - 25 - nameWidth - 130);
          drawRoundRect(ctx, essX, currentY + 11, 125, 24, 12);
          ctx.fillStyle = '#7f1d1d';
          ctx.fill();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 0.8;
          ctx.stroke();

          ctx.fillStyle = '#fecaca';
          ctx.font = fontSans(10, 'bold');
          ctx.textAlign = 'center';
          ctx.fillText(`⚡ ${floor.essentialCount} ${bfT.essential || 'Essential'}`, essX + 62.5, currentY + 27);
        }

        // Slab Totals on the LEFT
        ctx.fillStyle = '#38bdf8';
        ctx.font = fontSans(12, 'bold');
        ctx.textAlign = 'left';
        ctx.fillText(`${floor.totalKva.toFixed(1)} kVA • ${floor.totalAmps} A • ${floor.nodes.length} ${bfT.components || 'items'}`, 55, currentY + 28);
      } else {
        // LTR Floor Banner
        // Level elevation badge on the LEFT
        drawRoundRect(ctx, 52, currentY + 9, 75, 28, 6);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.font = fontMono(11, 'bold');
        ctx.textAlign = 'center';
        ctx.fillText(floor.elevation, 89, currentY + 27);

        // Floor Name on the LEFT
        ctx.fillStyle = slabTitleColor;
        ctx.font = fontSans(16, 'bold');
        ctx.textAlign = 'left';
        ctx.fillText(floor.displayName, 140, currentY + 29);

        // Essential Badge
        if (floor.essentialCount > 0) {
          drawRoundRect(ctx, 420, currentY + 11, 125, 24, 12);
          ctx.fillStyle = '#7f1d1d';
          ctx.fill();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 0.8;
          ctx.stroke();

          ctx.fillStyle = '#fecaca';
          ctx.font = fontSans(10, 'bold');
          ctx.textAlign = 'center';
          ctx.fillText(`⚡ ${floor.essentialCount} ${bfT.essential || 'Essential'}`, 482, currentY + 27);
        }

        // Slab Totals on Right
        ctx.fillStyle = '#38bdf8';
        ctx.font = fontSans(12, 'bold');
        ctx.textAlign = 'right';
        ctx.fillText(`${floor.totalKva.toFixed(1)} kVA • ${floor.totalAmps} A • ${floor.nodes.length} items`, svgWidth - 55, currentY + 28);
      }

      currentY += 56;

      // Enclosure Bays
      if (floor.enclosures.length > 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = fontSans(11, 'bold');
        if (isRTL) {
          ctx.textAlign = 'right';
          ctx.fillText(`📦 ${bfT.enclosureBay || 'Panel Enclosure & Downstream Feed'} (${floor.enclosures.length})`, svgWidth - 44, currentY + 14);
        } else {
          ctx.textAlign = 'left';
          ctx.fillText(`📦 ${bfT.enclosureBay || 'Panel Enclosure & Downstream Feed'} (${floor.enclosures.length})`, 44, currentY + 14);
        }
        currentY += 24;

        const encRows = Math.ceil(floor.enclosures.length / 2);
        for (let r = 0; r < encRows; r++) {
          const enc1 = floor.enclosures[r * 2];
          const enc2 = floor.enclosures[r * 2 + 1];
          const maxSons = Math.max(
            enc1 ? enc1.localSons.length : 0,
            enc2 ? enc2.localSons.length : 0
          );
          const sonsRows = Math.ceil(maxSons / 3);
          const encHeight = 62 + (maxSons > 0 ? sonsRows * 44 + 14 : 14);

          const renderEnclosureOnCanvas = (encItem: typeof enc1, boxX: number, boxWidth: number) => {
            if (!encItem) return;
            const board = encItem.board;
            const sons = encItem.localSons;
            const rawFeeder = board.parent
              ? `${bfT.parentFeeder || 'Feeder'}: ${board.parent.name}`
              : (bfT.independentSource || 'Main Grid Source');
            const feederText = safeText(rawFeeder, 30);

            // Enclosure main container
            drawRoundRect(ctx, boxX, currentY, boxWidth, encHeight, 10);
            ctx.fillStyle = '#0b1329';
            ctx.fill();
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Enclosure header strip
            drawRoundRect(ctx, boxX, currentY, boxWidth, 42, 10);
            ctx.fillStyle = '#141e33';
            ctx.fill();
            ctx.strokeStyle = '#24334d';
            ctx.lineWidth = 1;
            ctx.stroke();

            const boardMeta = `${board.node.amps || 0}A • ${board.node.voltage || 400}V • ${board.node.kva || 0}kVA ${board.place ? `• 📍 ${safeText(board.place, 14)}` : ''}`;

            if (isRTL) {
              // --- RTL Enclosure Header ---
              // Circle icon on the RIGHT
              ctx.beginPath();
              ctx.arc(boxX + boxWidth - 22, currentY + 21, 12, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(2, 132, 199, 0.2)';
              ctx.fill();

              // Lightning glyph
              ctx.fillStyle = '#38bdf8';
              ctx.font = fontSans(12, 'bold');
              ctx.textAlign = 'center';
              ctx.fillText('⚡', boxX + boxWidth - 22, currentY + 25);

              // Board Name on the RIGHT
              ctx.fillStyle = '#ffffff';
              ctx.font = fontSans(13, 'bold');
              ctx.textAlign = 'right';
              ctx.fillText(safeText(board.node.name || 'Panel', 24), boxX + boxWidth - 42, currentY + 21);

              // Board Meta Specs on the RIGHT
              ctx.fillStyle = '#94a3b8';
              ctx.font = fontSans(10, 'normal');
              ctx.fillText(boardMeta, boxX + boxWidth - 42, currentY + 35);

              // Feeder Tag on the LEFT
              drawRoundRect(ctx, boxX + 12, currentY + 10, 202, 22, 6);
              ctx.fillStyle = '#1e293b';
              ctx.fill();
              ctx.strokeStyle = '#334155';
              ctx.lineWidth = 1;
              ctx.stroke();

              ctx.fillStyle = '#f59e0b';
              ctx.font = fontSans(10, '600');
              ctx.textAlign = 'center';
              ctx.fillText(feederText, boxX + 12 + 101, currentY + 25);
            } else {
              // --- LTR Enclosure Header ---
              // Circle icon on the LEFT
              ctx.beginPath();
              ctx.arc(boxX + 22, currentY + 21, 12, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(2, 132, 199, 0.2)';
              ctx.fill();

              // Lightning glyph
              ctx.fillStyle = '#38bdf8';
              ctx.font = fontSans(12, 'bold');
              ctx.textAlign = 'center';
              ctx.fillText('⚡', boxX + 22, currentY + 25);

              // Board Name & Details
              ctx.fillStyle = '#ffffff';
              ctx.font = fontSans(13, 'bold');
              ctx.textAlign = 'left';
              ctx.fillText(safeText(board.node.name || 'Panel', 24), boxX + 42, currentY + 21);

              ctx.fillStyle = '#94a3b8';
              ctx.font = fontSans(10, 'normal');
              ctx.fillText(boardMeta, boxX + 42, currentY + 35);

              // Feeder Tag on the RIGHT
              drawRoundRect(ctx, boxX + boxWidth - 215, currentY + 10, 202, 22, 6);
              ctx.fillStyle = '#1e293b';
              ctx.fill();
              ctx.strokeStyle = '#334155';
              ctx.lineWidth = 1;
              ctx.stroke();

              ctx.fillStyle = '#f59e0b';
              ctx.font = fontSans(10, '600');
              ctx.textAlign = 'center';
              ctx.fillText(feederText, boxX + boxWidth - 114, currentY + 25);
            }

            // Sons Grid
            if (sons.length > 0) {
              sons.forEach((sonItem, sIdx) => {
                const sRow = Math.floor(sIdx / 3);
                const sWidth = Math.floor((boxWidth - 32) / 3);
                const sCol = isRTL ? (2 - (sIdx % 3)) : (sIdx % 3);
                const sX = boxX + 12 + sCol * (sWidth + 6);
                const sY = currentY + 50 + sRow * 44;

                drawRoundRect(ctx, sX, sY, sWidth, 38, 6);
                ctx.fillStyle = '#111c33';
                ctx.fill();
                ctx.strokeStyle = '#1f2d47';
                ctx.lineWidth = 1;
                ctx.stroke();

                if (isRTL) {
                  // RTL Son Card
                  ctx.fillStyle = '#f1f5f9';
                  ctx.font = fontSans(11, 'bold');
                  ctx.textAlign = 'right';
                  ctx.fillText(safeText(sonItem.node.name || 'Node', 16), sX + sWidth - 8, sY + 16);

                  ctx.fillStyle = '#38bdf8';
                  ctx.font = fontSans(9, 'normal');
                  ctx.fillText(`${sonItem.node.amps || 0}A • ${sonItem.node.kva || 0}kVA`, sX + sWidth - 8, sY + 30);

                  ctx.fillStyle = '#64748b';
                  ctx.font = fontSans(9, 'normal');
                  ctx.textAlign = 'left';
                  ctx.fillText(safeText(sonItem.place || sonItem.office || '', 10), sX + 8, sY + 30);
                } else {
                  // LTR Son Card
                  ctx.fillStyle = '#f1f5f9';
                  ctx.font = fontSans(11, 'bold');
                  ctx.textAlign = 'left';
                  ctx.fillText(safeText(sonItem.node.name || 'Node', 16), sX + 8, sY + 16);

                  ctx.fillStyle = '#38bdf8';
                  ctx.font = fontSans(9, 'normal');
                  ctx.fillText(`${sonItem.node.amps || 0}A • ${sonItem.node.kva || 0}kVA`, sX + 8, sY + 30);

                  ctx.fillStyle = '#64748b';
                  ctx.font = fontSans(9, 'normal');
                  ctx.textAlign = 'right';
                  ctx.fillText(safeText(sonItem.place || sonItem.office || '', 10), sX + sWidth - 8, sY + 30);
                }
              });
            } else {
              ctx.fillStyle = '#64748b';
              ctx.font = fontSans(11, 'italic');
              if (isRTL) {
                ctx.textAlign = 'right';
                ctx.fillText(bfT.noDownstreamBranches || 'לוח חלוקה — מעגלים משניים בלוחות משנה', boxX + boxWidth - 20, currentY + 65);
              } else {
                ctx.textAlign = 'left';
                ctx.fillText('Distribution board — branch circuits in sub-panels', boxX + 20, currentY + 65);
              }
            }
          };

          const colWidth = (svgWidth - 95) / 2;
          const enc1X = isRTL ? (40 + colWidth + 15) : 40;
          const enc2X = isRTL ? 40 : (40 + colWidth + 15);

          renderEnclosureOnCanvas(enc1, enc1X, colWidth);
          if (enc2) {
            renderEnclosureOnCanvas(enc2, enc2X, colWidth);
          }
          currentY += encHeight + 14;
        }
      }

      // Standalone Equipment & Loads
      if (floor.standaloneNodes.length > 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = fontSans(11, 'bold');
        if (isRTL) {
          ctx.textAlign = 'right';
          ctx.fillText(`⚡ ${bfT.individualDevices || 'Equipment & Loads'} (${floor.standaloneNodes.length})`, svgWidth - 44, currentY + 14);
        } else {
          ctx.textAlign = 'left';
          ctx.fillText(`⚡ ${bfT.individualDevices || 'Equipment & Loads'} (${floor.standaloneNodes.length})`, 44, currentY + 14);
        }
        currentY += 24;

        const devCols = 4;
        const devCardWidth = Math.floor((svgWidth - 80 - (devCols - 1) * 10) / devCols);
        const devCardHeight = 44;
        const devRows = Math.ceil(floor.standaloneNodes.length / devCols);

        floor.standaloneNodes.forEach((it, sIdx) => {
          const colInRow = sIdx % devCols;
          const sCol = isRTL ? (devCols - 1 - colInRow) : colInRow;
          const sRow = Math.floor(sIdx / devCols);
          const cardX = 40 + sCol * (devCardWidth + 10);
          const cardY = currentY + sRow * (devCardHeight + 8);
          const isDist = it.node.type === ComponentType.DISTRIBUTION_BOARD;

          drawRoundRect(ctx, cardX, cardY, devCardWidth, devCardHeight, 6);
          ctx.fillStyle = isDist ? '#1e293b' : '#0f172a';
          ctx.fill();
          ctx.strokeStyle = isDist ? '#38bdf8' : '#26334d';
          ctx.lineWidth = 1;
          ctx.stroke();

          if (isRTL) {
            // RTL Standalone Equipment Card
            // Name on the RIGHT
            ctx.fillStyle = '#f8fafc';
            ctx.font = fontSans(11, 'bold');
            ctx.textAlign = 'right';
            ctx.fillText(safeText(it.node.name || 'Component', 18), cardX + devCardWidth - 10, cardY + 18);

            // Specs (Amps/kVA) on the RIGHT
            ctx.fillStyle = '#38bdf8';
            ctx.font = fontSans(9, '600');
            ctx.fillText(`${it.node.amps || 0}A • ${it.node.kva || 0}kVA`, cardX + devCardWidth - 10, cardY + 34);

            // Component Type on the LEFT
            ctx.fillStyle = '#94a3b8';
            ctx.font = fontSans(9, 'normal');
            ctx.textAlign = 'left';
            ctx.fillText(safeText(t.componentTypes[it.node.type] || it.node.type, 14), cardX + 10, cardY + 18);

            // Location on the LEFT
            ctx.fillStyle = '#64748b';
            ctx.font = fontSans(9, 'normal');
            ctx.fillText(safeText(it.place || it.office || '', 14), cardX + 10, cardY + 34);
          } else {
            // LTR Standalone Equipment Card
            ctx.fillStyle = '#f8fafc';
            ctx.font = fontSans(11, 'bold');
            ctx.textAlign = 'left';
            ctx.fillText(safeText(it.node.name || 'Component', 18), cardX + 10, cardY + 18);

            ctx.fillStyle = '#38bdf8';
            ctx.font = fontSans(9, '600');
            ctx.fillText(`${it.node.amps || 0}A • ${it.node.kva || 0}kVA`, cardX + 10, cardY + 34);

            ctx.fillStyle = '#94a3b8';
            ctx.font = fontSans(9, 'normal');
            ctx.textAlign = 'right';
            ctx.fillText(safeText(t.componentTypes[it.node.type] || it.node.type, 14), cardX + devCardWidth - 10, cardY + 18);

            ctx.fillStyle = '#64748b';
            ctx.font = fontSans(9, 'normal');
            ctx.fillText(safeText(it.place || it.office || '', 14), cardX + devCardWidth - 10, cardY + 34);
          }
        });

        currentY += devRows * (devCardHeight + 8) + 10;
      }

      currentY += 22;
    });

    // 4. Final Sheet Footer
    drawRoundRect(ctx, 40, currentY, svgWidth - 80, 32, 6);
    ctx.fillStyle = '#111827';
    ctx.fill();
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (isRTL) {
      ctx.fillStyle = '#6b7280';
      ctx.font = fontSans(10, 'normal');
      ctx.textAlign = 'right';
      ctx.fillText('SmartSchema CAD System • Architectural Floor Elevation & Physical Distribution Drawing', svgWidth - 60, currentY + 20);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#4b5563';
      ctx.fillText('Clean Physical Layout (No Inter-Connecting Lines)', 60, currentY + 20);
    } else {
      ctx.fillStyle = '#6b7280';
      ctx.font = fontSans(10, 'normal');
      ctx.textAlign = 'left';
      ctx.fillText('SmartSchema CAD System • Architectural Floor Elevation & Physical Distribution Drawing', 60, currentY + 20);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#4b5563';
      ctx.fillText('Clean Physical Layout (No Inter-Connecting Lines)', svgWidth - 60, currentY + 20);
    }

    ctx.restore();
    return canvas;
  };

  // Helper: Build pure vector SVG document for export (validated W3C XML, mirrored for RTL)
  const buildElevationSvg = (
    floorsToRender: FloorGroup[],
    pageNum?: number,
    totalPages?: number
  ): { svgString: string; width: number; height: number } => {
    const svgWidth = 1400;
    let currentY = 30;
    let svgElements = '';

    const headerHeight = 98;
    const buildingStr = `${bfT.building || 'Building'}: ${selectedBuilding === 'ALL' ? (bfT.allBuildings || 'All Buildings') : selectedBuilding} • ${bfT.scope || 'Scope'}: ${scanScope === 'active_page' ? (bfT.activePageOnly || 'Active Page') : scanScope === 'all_projects' ? (bfT.allProjects || 'All Projects') : (bfT.allPages || 'All Pages')}`;
    const pageDateStr = `${new Date().toLocaleDateString()}${pageNum && totalPages ? ` • Page ${pageNum} of ${totalPages}` : ''}`;

    if (isRTL) {
      // RTL Header SVG
      const statsWidth = 365;
      const statsX = 55;
      const iconCenterX = svgWidth - 68;

      svgElements += `
  <g transform="translate(40, ${currentY})">
    <rect width="${svgWidth - 80}" height="${headerHeight}" rx="12" fill="#111827" stroke="#374151" stroke-width="1.5" />
    
    <!-- Stats Card on Left -->
    <rect x="${statsX - 40}" y="16" width="${statsWidth}" height="66" rx="8" fill="#1f2937" stroke="#374151" stroke-width="1" />
    <text x="${statsX - 40 + statsWidth - 20}" y="38" fill="#f59e0b" font-size="13" font-weight="bold" text-anchor="end">${buildingTotals.kva.toFixed(1)} kVA</text>
    <text x="${statsX - 40 + statsWidth - 20}" y="56" fill="#9ca3af" font-size="10" text-anchor="end">${escapeXml(bfT.totalLoad || 'Total Load')}</text>
    
    <text x="${statsX - 40 + statsWidth - 130}" y="38" fill="#e5e7eb" font-size="13" font-weight="bold" text-anchor="end">${buildingTotals.amps} A</text>
    <text x="${statsX - 40 + statsWidth - 130}" y="56" fill="#9ca3af" font-size="10" text-anchor="end">${escapeXml(bfT.totalCurrent || 'Current')}</text>
    
    <text x="${statsX - 40 + statsWidth - 235}" y="38" fill="#38bdf8" font-size="13" font-weight="bold" text-anchor="end">${buildingTotals.nodes} items</text>
    <text x="${statsX - 40 + statsWidth - 235}" y="56" fill="#9ca3af" font-size="10" text-anchor="end">${escapeXml(bfT.totalComponents || 'Equipment')}</text>
    
    <text x="${statsX - 40 + statsWidth - 20}" y="74" fill="#6b7280" font-size="9" text-anchor="end">${escapeXml(pageDateStr)}</text>

    <!-- Icon & Title on Right -->
    <circle cx="${iconCenterX - 40}" cy="38" r="18" fill="#f59e0b" opacity="0.18" />
    <rect x="${iconCenterX - 40 - 9}" y="29" width="18" height="18" fill="none" stroke="#f59e0b" stroke-width="1.8" />
    <rect x="${iconCenterX - 40 - 5}" y="33" width="3" height="3" fill="#f59e0b" />
    <rect x="${iconCenterX - 40 + 2}" y="33" width="3" height="3" fill="#f59e0b" />
    <rect x="${iconCenterX - 40 - 5}" y="39" width="3" height="3" fill="#f59e0b" />
    <rect x="${iconCenterX - 40 + 2}" y="39" width="3" height="3" fill="#f59e0b" />
    
    <text x="${svgWidth - 140}" y="38" fill="#f9fafb" font-size="20" font-weight="bold" text-anchor="end">${escapeXml(activeProject.name)} — ${escapeXml(bfT.title || 'Building & Floor Distribution')}</text>
    <text x="${svgWidth - 140}" y="62" fill="#9ca3af" font-size="12" text-anchor="end">${escapeXml(bfT.noLinesNote || 'Physical layout: Feeder connections grouped by panel bay without lines')}</text>
    <text x="${svgWidth - 140}" y="84" fill="#60a5fa" font-size="11" font-weight="600" text-anchor="end">${escapeXml(buildingStr)}</text>
  </g>
`;
    } else {
      svgElements += `
  <g transform="translate(40, ${currentY})">
    <rect width="${svgWidth - 80}" height="${headerHeight}" rx="12" fill="#111827" stroke="#374151" stroke-width="1.5" />
    <circle cx="36" cy="38" r="18" fill="#f59e0b" opacity="0.18" />
    <rect x="27" y="29" width="18" height="18" fill="none" stroke="#f59e0b" stroke-width="1.8" />
    <rect x="31" y="33" width="3" height="3" fill="#f59e0b" />
    <rect x="38" y="33" width="3" height="3" fill="#f59e0b" />
    <rect x="31" y="39" width="3" height="3" fill="#f59e0b" />
    <rect x="38" y="39" width="3" height="3" fill="#f59e0b" />
    
    <text x="68" y="38" fill="#f9fafb" font-size="20" font-weight="bold">${escapeXml(activeProject.name)} — ${escapeXml(bfT.title || 'Building & Floor Distribution')}</text>
    <text x="68" y="62" fill="#9ca3af" font-size="12">${escapeXml(bfT.noLinesNote || 'Physical layout: Feeder connections grouped by panel bay without lines')}</text>
    <text x="68" y="84" fill="#60a5fa" font-size="11" font-weight="600">${escapeXml(buildingStr)}</text>
    
    <rect x="${svgWidth - 460}" y="16" width="365" height="66" rx="8" fill="#1f2937" stroke="#374151" stroke-width="1" />
    <text x="${svgWidth - 440}" y="38" fill="#f59e0b" font-size="13" font-weight="bold">${buildingTotals.kva.toFixed(1)} kVA</text>
    <text x="${svgWidth - 440}" y="56" fill="#9ca3af" font-size="10">${escapeXml(bfT.totalLoad || 'Total Load')}</text>
    
    <text x="${svgWidth - 340}" y="38" fill="#e5e7eb" font-size="13" font-weight="bold">${buildingTotals.amps} A</text>
    <text x="${svgWidth - 340}" y="56" fill="#9ca3af" font-size="10">${escapeXml(bfT.totalCurrent || 'Current')}</text>
    
    <text x="${svgWidth - 245}" y="38" fill="#38bdf8" font-size="13" font-weight="bold">${buildingTotals.nodes} items</text>
    <text x="${svgWidth - 245}" y="56" fill="#9ca3af" font-size="10">${escapeXml(bfT.totalComponents || 'Equipment')}</text>
    
    <text x="${svgWidth - 440}" y="74" fill="#6b7280" font-size="9">${escapeXml(pageDateStr)}</text>
  </g>
`;
    }
    currentY += headerHeight + 25;

    floorsToRender.forEach((floor) => {
      const isUnassigned = floor.isUnassigned;
      const slabFill = isUnassigned ? '#451a03' : '#1e293b';
      const slabStroke = isUnassigned ? '#b45309' : '#475569';
      const slabTitleColor = isUnassigned ? '#fde68a' : '#f8fafc';

      if (isRTL) {
        const badgeX = svgWidth - 127 - 40;
        svgElements += `
  <g transform="translate(40, ${currentY})">
    <rect width="${svgWidth - 80}" height="46" rx="8" fill="${slabFill}" stroke="${slabStroke}" stroke-width="1.2" />
    
    <!-- Level Badge on Right -->
    <rect x="${badgeX}" y="9" width="75" height="28" rx="6" fill="#0f172a" stroke="#334155" />
    <text x="${badgeX + 37.5}" y="27" fill="#38bdf8" font-size="11" font-weight="bold" font-family="monospace" text-anchor="middle">${escapeXml(floor.elevation)}</text>
    
    <!-- Floor Name on Right -->
    <text x="${badgeX - 15}" y="29" fill="${slabTitleColor}" font-size="16" font-weight="bold" text-anchor="end">${escapeXml(floor.displayName)}</text>
    
    ${floor.essentialCount > 0 ? `
    <rect x="${Math.max(340, badgeX - 250)}" y="11" width="125" height="24" rx="12" fill="#7f1d1d" stroke="#ef4444" stroke-width="0.8" />
    <text x="${Math.max(340, badgeX - 250) + 62.5}" y="27" fill="#fecaca" font-size="10" font-weight="bold" text-anchor="middle">⚡ ${floor.essentialCount} ${escapeXml(bfT.essential || 'Essential')}</text>
    ` : ''}

    <!-- Totals on Left -->
    <text x="15" y="28" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="start">${floor.totalKva.toFixed(1)} kVA • ${floor.totalAmps} A • ${floor.nodes.length} ${escapeXml(bfT.components || 'items')}</text>
  </g>
`;
      } else {
        svgElements += `
  <g transform="translate(40, ${currentY})">
    <rect width="${svgWidth - 80}" height="46" rx="8" fill="${slabFill}" stroke="${slabStroke}" stroke-width="1.2" />
    <rect x="12" y="9" width="75" height="28" rx="6" fill="#0f172a" stroke="#334155" />
    <text x="49" y="27" fill="#38bdf8" font-size="11" font-weight="bold" font-family="monospace" text-anchor="middle">${escapeXml(floor.elevation)}</text>
    
    <text x="100" y="29" fill="${slabTitleColor}" font-size="16" font-weight="bold">${escapeXml(floor.displayName)}</text>
    ${floor.essentialCount > 0 ? `
    <rect x="360" y="11" width="125" height="24" rx="12" fill="#7f1d1d" stroke="#ef4444" stroke-width="0.8" />
    <text x="422" y="27" fill="#fecaca" font-size="10" font-weight="bold" text-anchor="middle">⚡ ${floor.essentialCount} ${escapeXml(bfT.essential || 'Essential')}</text>
    ` : ''}

    <text x="${svgWidth - 105}" y="28" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="end">${floor.totalKva.toFixed(1)} kVA • ${floor.totalAmps} A • ${floor.nodes.length} items</text>
  </g>
`;
      }
      currentY += 56;

      if (floor.enclosures.length > 0) {
        if (isRTL) {
          svgElements += `
  <g transform="translate(44, ${currentY})">
    <text x="${svgWidth - 88}" y="14" fill="#94a3b8" font-size="11" font-weight="bold" text-anchor="end">📦 ${escapeXml(bfT.enclosureBay || 'Panel Enclosure & Downstream Feed')} (${floor.enclosures.length})</text>
  </g>
`;
        } else {
          svgElements += `
  <g transform="translate(44, ${currentY})">
    <rect x="0" y="2" width="14" height="14" rx="2" fill="none" stroke="#94a3b8" stroke-width="1.4" />
    <line x1="0" y1="6" x2="14" y2="6" stroke="#94a3b8" stroke-width="1" />
    <text x="22" y="14" fill="#94a3b8" font-size="11" font-weight="bold">${escapeXml(bfT.enclosureBay || 'Panel Enclosure & Downstream Feed')} (${floor.enclosures.length})</text>
  </g>
`;
        }
        currentY += 24;

        const encRows = Math.ceil(floor.enclosures.length / 2);
        for (let r = 0; r < encRows; r++) {
          const enc1 = floor.enclosures[r * 2];
          const enc2 = floor.enclosures[r * 2 + 1];
          const maxSons = Math.max(
            enc1 ? enc1.localSons.length : 0,
            enc2 ? enc2.localSons.length : 0
          );
          const sonsRows = Math.ceil(maxSons / 3);
          const encHeight = 62 + (maxSons > 0 ? sonsRows * 44 + 14 : 14);

          const renderEnclosureBox = (encItem: typeof enc1, boxX: number, boxWidth: number) => {
            if (!encItem) return '';
            const board = encItem.board;
            const sons = encItem.localSons;
            const rawFeeder = board.parent
              ? `${bfT.parentFeeder || 'Feeder'}: ${board.parent.name}`
              : (bfT.independentSource || 'Main Grid Source');
            const feederText = escapeXml(safeText(rawFeeder, 30));

            let encSvg = `
    <g transform="translate(${boxX}, ${currentY})">
      <rect width="${boxWidth}" height="${encHeight}" rx="10" fill="#0b1329" stroke="#1e293b" stroke-width="1.2" />
      <rect width="${boxWidth}" height="42" rx="10" fill="#141e33" stroke="#24334d" stroke-width="1" />
`;
            if (isRTL) {
              encSvg += `
      <!-- RTL Enclosure Header -->
      <circle cx="${boxWidth - 22}" cy="21" r="12" fill="#0284c7" opacity="0.2" />
      <text x="${boxWidth - 22}" y="25" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="middle">⚡</text>
      
      <text x="${boxWidth - 42}" y="21" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="end">${escapeXml(safeText(board.node.name || 'Panel', 24))}</text>
      <text x="${boxWidth - 42}" y="35" fill="#94a3b8" font-size="10" text-anchor="end">${board.node.amps || 0}A • ${board.node.voltage || 400}V • ${board.node.kva || 0}kVA ${board.place ? `• ${escapeXml(safeText(board.place, 14))}` : ''}</text>
      
      <rect x="12" y="10" width="202" height="22" rx="6" fill="#1e293b" stroke="#334155" />
      <text x="113" y="25" fill="#f59e0b" font-size="10" font-weight="600" text-anchor="middle">${feederText}</text>
`;
            } else {
              encSvg += `
      <!-- LTR Enclosure Header -->
      <circle cx="22" cy="21" r="12" fill="#0284c7" opacity="0.2" />
      <text x="22" y="25" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="middle">⚡</text>
      
      <text x="42" y="21" fill="#ffffff" font-size="13" font-weight="bold">${escapeXml(safeText(board.node.name || 'Panel', 24))}</text>
      <text x="42" y="35" fill="#94a3b8" font-size="10">${board.node.amps || 0}A • ${board.node.voltage || 400}V • ${board.node.kva || 0}kVA ${board.place ? `• ${escapeXml(safeText(board.place, 14))}` : ''}</text>
      
      <rect x="${boxWidth - 215}" y="10" width="202" height="22" rx="6" fill="#1e293b" stroke="#334155" />
      <text x="${boxWidth - 114}" y="25" fill="#f59e0b" font-size="10" font-weight="600" text-anchor="middle">${feederText}</text>
`;
            }

            if (sons.length > 0) {
              sons.forEach((sonItem, sIdx) => {
                const sRow = Math.floor(sIdx / 3);
                const sWidth = Math.floor((boxWidth - 32) / 3);
                const sCol = isRTL ? (2 - (sIdx % 3)) : (sIdx % 3);
                const sX = 12 + sCol * (sWidth + 6);
                const sY = 50 + sRow * 44;

                if (isRTL) {
                  encSvg += `
      <rect x="${sX}" y="${sY}" width="${sWidth}" height="38" rx="6" fill="#111c33" stroke="#1f2d47" stroke-width="1" />
      <text x="${sX + sWidth - 8}" y="${sY + 16}" fill="#f1f5f9" font-size="11" font-weight="bold" text-anchor="end">${escapeXml(safeText(sonItem.node.name || 'Node', 16))}</text>
      <text x="${sX + sWidth - 8}" y="${sY + 30}" fill="#38bdf8" font-size="9" text-anchor="end">${sonItem.node.amps || 0}A • ${sonItem.node.kva || 0}kVA</text>
      <text x="${sX + 8}" y="${sY + 30}" fill="#64748b" font-size="9" text-anchor="start">${escapeXml(safeText(sonItem.place || sonItem.office || '', 10))}</text>
`;
                } else {
                  encSvg += `
      <rect x="${sX}" y="${sY}" width="${sWidth}" height="38" rx="6" fill="#111c33" stroke="#1f2d47" stroke-width="1" />
      <text x="${sX + 8}" y="${sY + 16}" fill="#f1f5f9" font-size="11" font-weight="bold">${escapeXml(safeText(sonItem.node.name || 'Node', 16))}</text>
      <text x="${sX + 8}" y="${sY + 30}" fill="#38bdf8" font-size="9">${sonItem.node.amps || 0}A • ${sonItem.node.kva || 0}kVA</text>
      <text x="${sX + sWidth - 8}" y="${sY + 30}" fill="#64748b" font-size="9" text-anchor="end">${escapeXml(safeText(sonItem.place || sonItem.office || '', 10))}</text>
`;
                }
              });
            } else {
              encSvg += `
      <text x="${isRTL ? boxWidth - 20 : 20}" y="65" fill="#64748b" font-size="11" font-style="italic" text-anchor="${isRTL ? 'end' : 'start'}">${escapeXml(bfT.noDownstreamBranches || 'Distribution board — branch circuits in sub-panels')}</text>
`;
            }

            encSvg += `\n    </g>`;
            return encSvg;
          };

          const colWidth = (svgWidth - 95) / 2;
          const enc1X = isRTL ? (40 + colWidth + 15) : 40;
          const enc2X = isRTL ? 40 : (40 + colWidth + 15);

          svgElements += renderEnclosureBox(enc1, enc1X, colWidth);
          if (enc2) {
            svgElements += renderEnclosureBox(enc2, enc2X, colWidth);
          }
          currentY += encHeight + 14;
        }
      }

      if (floor.standaloneNodes.length > 0) {
        if (isRTL) {
          svgElements += `
  <g transform="translate(44, ${currentY})">
    <text x="${svgWidth - 88}" y="14" fill="#94a3b8" font-size="11" font-weight="bold" text-anchor="end">⚡ ${escapeXml(bfT.individualDevices || 'Equipment & Loads')} (${floor.standaloneNodes.length})</text>
  </g>
`;
        } else {
          svgElements += `
  <g transform="translate(44, ${currentY})">
    <polygon points="6,2 2,8 5,8 4,14 10,7 7,7" fill="#94a3b8" />
    <text x="18" y="14" fill="#94a3b8" font-size="11" font-weight="bold">${escapeXml(bfT.individualDevices || 'Equipment & Loads')} (${floor.standaloneNodes.length})</text>
  </g>
`;
        }
        currentY += 24;

        const devCols = 4;
        const devCardWidth = Math.floor((svgWidth - 80 - (devCols - 1) * 10) / devCols);
        const devCardHeight = 44;
        const devRows = Math.ceil(floor.standaloneNodes.length / devCols);

        floor.standaloneNodes.forEach((it, sIdx) => {
          const colInRow = sIdx % devCols;
          const sCol = isRTL ? (devCols - 1 - colInRow) : colInRow;
          const sRow = Math.floor(sIdx / devCols);
          const cardX = 40 + sCol * (devCardWidth + 10);
          const cardY = currentY + sRow * (devCardHeight + 8);
          const isDist = it.node.type === ComponentType.DISTRIBUTION_BOARD;
          const cardBg = isDist ? '#1e293b' : '#0f172a';
          const cardStroke = isDist ? '#38bdf8' : '#26334d';

          if (isRTL) {
            svgElements += `
  <g transform="translate(${cardX}, ${cardY})">
    <rect width="${devCardWidth}" height="${devCardHeight}" rx="6" fill="${cardBg}" stroke="${cardStroke}" stroke-width="1" />
    <text x="${devCardWidth - 10}" y="18" fill="#f8fafc" font-size="11" font-weight="bold" text-anchor="end">${escapeXml(safeText(it.node.name || 'Component', 18))}</text>
    <text x="${devCardWidth - 10}" y="34" fill="#38bdf8" font-size="9" font-weight="600" text-anchor="end">${it.node.amps || 0}A • ${it.node.kva || 0}kVA</text>
    <text x="10" y="18" fill="#94a3b8" font-size="9" text-anchor="start">${escapeXml(safeText(t.componentTypes[it.node.type] || it.node.type, 14))}</text>
    <text x="10" y="34" fill="#64748b" font-size="9" text-anchor="start">${escapeXml(safeText(it.place || it.office || '', 14))}</text>
  </g>
`;
          } else {
            svgElements += `
  <g transform="translate(${cardX}, ${cardY})">
    <rect width="${devCardWidth}" height="${devCardHeight}" rx="6" fill="${cardBg}" stroke="${cardStroke}" stroke-width="1" />
    <text x="10" y="18" fill="#f8fafc" font-size="11" font-weight="bold">${escapeXml(safeText(it.node.name || 'Component', 18))}</text>
    <text x="10" y="34" fill="#38bdf8" font-size="9" font-weight="600">${it.node.amps || 0}A • ${it.node.kva || 0}kVA</text>
    <text x="${devCardWidth - 10}" y="18" fill="#94a3b8" font-size="9" text-anchor="end">${escapeXml(safeText(t.componentTypes[it.node.type] || it.node.type, 14))}</text>
    <text x="${devCardWidth - 10}" y="34" fill="#64748b" font-size="9" text-anchor="end">${escapeXml(safeText(it.place || it.office || '', 14))}</text>
  </g>
`;
          }
        });
        currentY += devRows * (devCardHeight + 8) + 10;
      }

      currentY += 22;
    });

    svgElements += `
  <g transform="translate(40, ${currentY})">
    <rect width="${svgWidth - 80}" height="32" rx="6" fill="#111827" stroke="#1f2937" stroke-width="1" />
    <text x="${isRTL ? svgWidth - 100 : 20}" y="20" fill="#6b7280" font-size="10" text-anchor="${isRTL ? 'end' : 'start'}">SmartSchema CAD System • Architectural Floor Elevation &amp; Physical Distribution Drawing</text>
    <text x="${isRTL ? 20 : svgWidth - 100}" y="20" fill="#4b5563" font-size="10" text-anchor="${isRTL ? 'start' : 'end'}">Clean Physical Layout (No Inter-Connecting Lines)</text>
  </g>
`;
    currentY += 55;

    const totalHeight = Math.max(900, currentY);

    const fullSvg = `<svg width="${svgWidth}" height="${totalHeight}" viewBox="0 0 ${svgWidth} ${totalHeight}" dir="${isRTL ? 'rtl' : 'ltr'}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <style type="text/css">
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&amp;family=Heebo:wght@400;600;700&amp;family=Rubik:wght@400;600;700&amp;display=swap');
      text { font-family: 'Cairo', 'Heebo', 'Rubik', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    </style>
  </defs>
  <rect width="${svgWidth}" height="${totalHeight}" fill="#090d16" />
${svgElements}
</svg>`;

    return { svgString: fullSvg, width: svgWidth, height: totalHeight };
  };

  // Export to PDF (Direct high-DPI Canvas 2D generation with multi-page support & RTL text shaping)
  const handleExportPDF = async () => {
    if (floorGroups.length === 0) {
      alert(bfT.noComponentsFound || 'No components found for this building or floor.');
      return;
    }

    setIsGeneratingPdf(true);
    try {
      // Ensure web fonts are completely ready before rendering
      if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
        try {
          await document.fonts.ready;
        } catch (_) {}
      }

      const safeProjectName = activeProject.name.trim().replace(/[^\w\u0590-\u05FF\u0600-\u06FF\s-]/g, '_');
      const baseFileName = `${safeProjectName}_Building_Elevation`;

      // Paginate floors: 3 floors per page for optimal landscape sheet proportion
      const FLOORS_PER_PAGE = 3;
      const pages: FloorGroup[][] = [];

      for (let i = 0; i < floorGroups.length; i += FLOORS_PER_PAGE) {
        pages.push(floorGroups.slice(i, i + FLOORS_PER_PAGE));
      }

      let pdfDoc: jsPDF | null = null;
      const svgWidth = 1400;

      for (let pIdx = 0; pIdx < pages.length; pIdx++) {
        const pageFloors = pages[pIdx];
        const pageHeight = calculateElevationHeight(pageFloors);
        const isLandscape = svgWidth >= pageHeight;
        
        // Direct Canvas 2D rendering at 2.0x scale (300+ DPI equivalent, 100% reliable)
        const canvas = renderElevationToCanvas(pageFloors, pIdx + 1, pages.length, 2.0);

        if (!pdfDoc) {
          pdfDoc = new jsPDF({
            orientation: isLandscape ? 'landscape' : 'portrait',
            unit: 'pt',
            format: [svgWidth, pageHeight],
            compress: true
          });
        } else {
          pdfDoc.addPage([svgWidth, pageHeight], isLandscape ? 'landscape' : 'portrait');
        }

        const actualWidth = pdfDoc.internal.pageSize.getWidth();
        const actualHeight = pdfDoc.internal.pageSize.getHeight();
        const pngData = canvas.toDataURL('image/png');
        pdfDoc.addImage(pngData, 'PNG', 0, 0, actualWidth, actualHeight, undefined, 'FAST');
      }

      if (pdfDoc) {
        pdfDoc.save(`${baseFileName}.pdf`);
      }
    } catch (err) {
      console.error('PDF generation error:', err);
      alert(bfT.pdfError || 'Failed to generate PDF document');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Export to SVG
  const handleExportSVG = () => {
    try {
      const safeProjectName = activeProject.name.trim().replace(/[^\w\u0590-\u05FF\u0600-\u06FF\s-]/g, '_');
      const baseFileName = `${safeProjectName}_Building_Elevation`;
      const { svgString } = buildElevationSvg(floorGroups);

      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseFileName}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      console.error('SVG export error:', err);
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const exportRows = filteredNodes.map((item, idx) => ({
        '#': idx + 1,
        'Component': item.node.name,
        'Type': t.componentTypes[item.node.type] || item.node.type,
        'Building': item.building || 'Main',
        'Floor': item.floor || 'Unassigned',
        'Room / Space': item.place || item.office || '-',
        'Feeder / Father': item.parent ? item.parent.name : 'Independent / Root',
        'Parent Floor': item.parent ? (item.parent.floor || 'Same') : '-',
        'Downstream Sons Count': item.directSons.length,
        'Amps (A)': item.node.amps || '',
        'Voltage (V)': item.node.voltage || '',
        'kVA': item.node.kva || '',
        'Essential': item.node.isEssential ? 'YES' : 'NO',
        'Source Page': item.pageName,
        'Source Project': item.projectName
      }));

      const ws = XLSX.utils.json_to_sheet(exportRows);
      ws['!views'] = [{ rightToLeft: isRTL }];
      XLSX.utils.book_append_sheet(wb, ws, 'Building Floor Layout');
      XLSX.writeFile(wb, `${activeProject.name}_Building_Floors.xlsx`);
    } catch (err) {
      console.error('Excel export error:', err);
    }
  };

  // Print
  const handlePrint = () => {
    handleExportPDF();
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 animate-fadeIn ${isRTL ? 'rtl' : 'ltr'}`}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div
        className={`w-full max-w-[98vw] xl:max-w-[95vw] 2xl:max-w-[1680px] h-[95vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-all ${
          theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
        }`}
      >
        {/* Top Header Bar */}
        <div
          className={`px-5 py-3.5 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 ${
            theme === 'dark' ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          {/* Title & Badge */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 via-orange-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-orange-500/20 shrink-0">
              <span className="material-icons-round text-2xl">apartment</span>
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                  {bfT.title || 'Building & Floor Distribution'}
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  {activeProject.name}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 hidden sm:inline-flex items-center gap-1">
                  <span className="material-icons-round text-xs text-sky-400">layers</span>
                  {floorGroups.length} {bfT.levels || 'Levels'}
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                {bfT.subtitle || 'Architectural floor elevation & room distribution without line clutter'}
              </p>
            </div>
          </div>

          {/* Scope Selector, Building Filter & Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Scan Scope Radio Pill */}
            <div className="bg-slate-800/80 p-1 rounded-xl border border-slate-700 flex items-center text-xs">
              <button
                onClick={() => setScanScope('active_project')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  scanScope === 'active_project'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Scan all pages in this project"
              >
                {bfT.allPages || 'All Pages'}
              </button>
              <button
                onClick={() => setScanScope('active_page')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  scanScope === 'active_page'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Scan only current active page"
              >
                {bfT.activePageOnly || 'Active Page'}
              </button>
              <button
                onClick={() => setScanScope('all_projects')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  scanScope === 'all_projects'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Scan across all projects"
              >
                {t.projects || 'All Projects'}
              </button>
            </div>

            {/* Building Selector */}
            {availableBuildings.length > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs">
                <span className="material-icons-round text-sm text-amber-400">domain</span>
                <select
                  value={selectedBuilding}
                  onChange={(e) => setSelectedBuilding(e.target.value)}
                  className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer text-xs"
                >
                  <option value="ALL" className="bg-slate-900 text-slate-200">{bfT.allBuildings || 'All Buildings'}</option>
                  {availableBuildings.map(bld => (
                    <option key={bld} value={bld} className="bg-slate-900 text-slate-200">{bld}</option>
                  ))}
                  <option value="__unassigned__" className="bg-slate-900 text-slate-200">{bfT.unassignedBuilding || 'Main / Unassigned'}</option>
                </select>
              </div>
            )}

            {/* Export SVG */}
            <button
              onClick={handleExportSVG}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title={bfT.exportSvg || 'Export SVG'}
            >
              <span className="material-icons-round text-sm text-sky-400">download</span>
              <span className="hidden sm:inline">SVG</span>
            </button>

            {/* Export PDF */}
            <button
              onClick={handleExportPDF}
              disabled={isGeneratingPdf}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                isGeneratingPdf
                  ? 'bg-rose-950/60 border border-rose-800/60 text-rose-300/70 cursor-wait'
                  : 'bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 hover:border-rose-400/60 shadow-sm'
              }`}
              title={bfT.exportPdf || 'Export PDF Document'}
            >
              <span className={`material-icons-round text-sm text-rose-400 ${isGeneratingPdf ? 'animate-spin' : ''}`}>
                {isGeneratingPdf ? 'refresh' : 'picture_as_pdf'}
              </span>
              <span className="font-bold">
                {isGeneratingPdf ? (bfT.generatingPdf || 'Generating...') : 'PDF'}
              </span>
            </button>

            {/* Export Excel */}
            <button
              onClick={handleExportExcel}
              className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title={bfT.exportExcel || 'Excel Report'}
            >
              <span className="material-icons-round text-sm">table_view</span>
              <span className="hidden sm:inline">Excel</span>
            </button>

            {/* Print */}
            <button
              onClick={handlePrint}
              disabled={isGeneratingPdf}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title={bfT.printPdf || 'Print'}
            >
              <span className="material-icons-round text-sm text-slate-400">print</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors"
              title={bfT.cancel || 'Close'}
            >
              <span className="material-icons-round text-xl">close</span>
            </button>
          </div>
        </div>

        {/* Filter & Search Ribbon */}
        <div
          className={`px-5 py-2.5 border-b flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 ${
            theme === 'dark' ? 'bg-slate-900/50 border-slate-800/80' : 'bg-slate-100/70 border-slate-200'
          }`}
        >
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <span className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? 'right-3' : 'left-3'} material-icons-round text-slate-500 text-sm pointer-events-none`}>
              search
            </span>
            <input
              type="text"
              placeholder={bfT.searchPlaceholder || 'Search components, room, type, floor...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full bg-slate-800/90 border border-slate-700 rounded-xl py-1.5 ${isRTL ? 'pr-9 pl-8 text-right' : 'pl-9 pr-8 text-left'} text-xs text-white focus:outline-none focus:border-amber-500 transition-all placeholder-slate-500`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? 'left-2.5' : 'right-2.5'} text-slate-400 hover:text-white`}
              >
                <span className="material-icons-round text-xs">close</span>
              </button>
            )}
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Type Selector */}
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL">{bfT.filterByType || 'All Types'}</option>
              {Object.values(ComponentType).map(type => (
                <option key={type} value={type}>{t.componentTypes[type] || type}</option>
              ))}
            </select>

            {/* Essential Only Toggle */}
            <button
              onClick={() => setEssentialOnly(prev => !prev)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                essentialOnly
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-sm'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="material-icons-round text-sm">bolt</span>
              <span>{bfT.filterByEssential || 'Essential Only'}</span>
            </button>

            {/* Clean Physical Layout Notice */}
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-800/60 px-3 py-1 rounded-xl border border-slate-700/60">
              <span className="material-icons-round text-xs text-amber-400">clean_hands</span>
              <span>{bfT.noLinesNote || 'Feeder connections grouped physically by enclosure bay'}</span>
            </div>
          </div>
        </div>

        {/* Main Workspace: 3 Columns (Elevation Riser Sidebar | Floor Slabs Canvas | Node Inspector Drawer) */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left: Architectural Elevation Riser Silhouette Profile */}
          <aside className="w-56 xl:w-64 border-r border-slate-800 bg-slate-900/40 p-4 flex flex-col shrink-0 overflow-y-auto custom-scrollbar hidden md:flex">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <span className="material-icons-round text-sm text-amber-400">corporate_fare</span>
                {bfT.elevationRiser || 'Building Elevation'}
              </span>
              <span className="text-[10px] font-mono text-slate-500">NTS</span>
            </div>

            {/* Building Totalizer Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 mb-4 shadow-sm">
              <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">{bfT.totalLoad || 'Total Load'}</div>
              <div className="text-lg font-bold text-amber-400 font-mono leading-tight">
                {buildingTotals.kva.toFixed(1)} <span className="text-xs text-slate-400 font-sans">kVA</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-800/80 text-[11px]">
                <div>
                  <span className="text-slate-500 block text-[10px]">{bfT.totalCurrent || 'Total Current'}</span>
                  <span className="font-bold text-slate-300 font-mono">{buildingTotals.amps} A</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">{bfT.totalComponents || 'Components'}</span>
                  <span className="font-bold text-sky-400 font-mono">{buildingTotals.nodes}</span>
                </div>
              </div>
            </div>

            {/* Architectural Building Slabs Tower Graphic */}
            <div className="flex-1 flex flex-col space-y-2">
              <div className="text-[10px] uppercase font-bold text-slate-500 px-1">{bfT.levels || 'Floor Levels'}</div>

              {/* Roof Antenna Graphic */}
              <div className="flex flex-col items-center py-1 opacity-70">
                <div className="w-0.5 h-6 bg-slate-500"></div>
                <div className="w-6 h-0.5 bg-slate-500"></div>
                <div className="w-12 h-1 bg-amber-500/50 rounded-t"></div>
              </div>

              {/* Floor Level Buttons Stacked in Riser Order */}
              {floorGroups.map((floor) => {
                const isActive = activeFloorKey === floor.key;
                return (
                  <button
                    key={floor.key}
                    onClick={() => handleScrollToFloor(floor.key)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between group relative overflow-hidden ${
                      floor.isUnassigned
                        ? 'bg-amber-950/20 border-amber-800/40 hover:bg-amber-900/30'
                        : isActive
                        ? 'bg-amber-600/20 border-amber-500/60 shadow-md'
                        : 'bg-slate-800/60 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-6 h-6 rounded-lg text-xs font-bold font-mono flex items-center justify-center shrink-0 ${
                          floor.isUnassigned
                            ? 'bg-amber-900/40 text-amber-300'
                            : isActive
                            ? 'bg-amber-500 text-white'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {floor.isUnassigned ? '?' : floor.levelRank}
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-semibold text-slate-200 truncate group-hover:text-amber-400 transition-colors">
                          {floor.displayName}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          {floor.elevation}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[11px] font-bold font-mono text-amber-400">
                        {floor.totalKva > 0 ? `${floor.totalKva.toFixed(0)}kVA` : '-'}
                      </div>
                      <div className="text-[9px] text-slate-500">
                        {floor.nodes.length} items
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Center: Main Elevation Floor Slabs Canvas (NO CROSSING LINES) */}
          <main
            id="building-elevation-canvas"
            ref={canvasRef}
            className="flex-1 p-4 lg:p-6 overflow-y-auto custom-scrollbar space-y-6"
          >
            {/* If no components match */}
            {floorGroups.length === 0 && (
              <div className="p-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                <span className="material-icons-round text-4xl text-slate-600 mb-2">apartment</span>
                <p className="text-sm font-medium">{bfT.noComponentsFound || 'No components found for this building or floor.'}</p>
                <p className="text-xs text-slate-600 mt-1">Try changing the scan scope or clearing search filters.</p>
              </div>
            )}

            {/* Render Each Architectural Floor Slab */}
            {floorGroups.map((floor) => {
              const slabId = `floor-slab-${floor.key.replace(/\s+/g, '_')}`;

              return (
                <section
                  key={floor.key}
                  id={slabId}
                  className={`rounded-2xl border transition-all overflow-hidden ${
                    floor.isUnassigned
                      ? 'bg-slate-900/40 border-dashed border-amber-700/50'
                      : 'bg-slate-900/80 border-slate-800 shadow-xl'
                  }`}
                >
                  {/* Architectural Floor Concrete Slab Header */}
                  <div
                    className={`px-5 py-3 border-b flex flex-wrap items-center justify-between gap-3 ${
                      floor.isUnassigned
                        ? 'bg-amber-950/30 border-amber-800/40 text-amber-300'
                        : 'bg-gradient-to-r from-slate-800 via-slate-800/90 to-slate-800/70 border-slate-700/80 text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Floor Level Pill */}
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono tracking-wider uppercase border flex items-center gap-1.5 ${
                          floor.isUnassigned
                            ? 'bg-amber-900/50 border-amber-700/60 text-amber-200'
                            : 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                        }`}
                      >
                        <span className="material-icons-round text-sm">
                          {floor.levelRank >= 1000 ? 'roofing' : floor.levelRank < 0 ? 'foundation' : 'stairs'}
                        </span>
                        <span>{floor.elevation}</span>
                      </span>

                      <div>
                        <div className="text-base font-bold tracking-tight flex items-center gap-2">
                          <span>{floor.displayName}</span>
                          {floor.essentialCount > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 font-semibold flex items-center gap-1">
                              <span className="material-icons-round text-xs">priority_high</span>
                              {floor.essentialCount} {bfT.essential || 'Essential'}
                            </span>
                          )}
                        </div>
                        {floor.isUnassigned && (
                          <p className="text-[11px] text-amber-400/80 mt-0.5">
                            {bfT.unassignedDesc || 'Components with no floor assigned yet. Assign a floor or room below to organize them.'}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Floor Aggregate Metrics Bar */}
                    <div className="flex items-center gap-2 sm:gap-3 text-xs">
                      <div className="bg-slate-900/70 px-2.5 py-1 rounded-lg border border-slate-700/60 flex items-center gap-1.5 font-mono">
                        <span className="text-slate-400 text-[10px]">{bfT.totalLoad || 'Load'}:</span>
                        <span className="font-bold text-amber-400">{floor.totalKva.toFixed(1)} kVA</span>
                      </div>

                      <div className="bg-slate-900/70 px-2.5 py-1 rounded-lg border border-slate-700/60 flex items-center gap-1.5 font-mono">
                        <span className="text-slate-400 text-[10px]">{bfT.totalCurrent || 'Current'}:</span>
                        <span className="font-bold text-slate-200">{floor.totalAmps} A</span>
                      </div>

                      <div className="bg-slate-900/70 px-2.5 py-1 rounded-lg border border-slate-700/60 flex items-center gap-1.5 font-mono">
                        <span className="text-slate-400 text-[10px]">{bfT.totalComponents || 'Items'}:</span>
                        <span className="font-bold text-sky-400">{floor.nodes.length}</span>
                      </div>
                    </div>
                  </div>

                  {/* Floor Slab Body: Enclosure Bays & Individual Room Equipment (NO CONNECTING WIRES) */}
                  <div className="p-4 sm:p-5 space-y-6">

                    {/* 1. Panel Enclosures & Distribution Boards (Cabinet Bays containing their sons) */}
                    {floor.enclosures.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                          <span className="material-icons-round text-sm text-sky-400">dns</span>
                          <span>{bfT.enclosureBay || 'Panel Enclosure & Downstream Feed'}</span>
                          <span className="text-[10px] font-mono text-slate-500">({floor.enclosures.length})</span>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {floor.enclosures.map(({ board, localSons, remoteSons }) => {
                            const isSelected = inspectedNodeId === board.node.id;

                            return (
                              <div
                                key={board.node.id}
                                className={`rounded-xl border transition-all overflow-hidden bg-slate-950/80 ${
                                  isSelected
                                    ? 'border-amber-500 ring-2 ring-amber-500/20 shadow-lg'
                                    : 'border-slate-800 hover:border-slate-700'
                                }`}
                              >
                                {/* Enclosure Header: Distribution Board Specs */}
                                <div
                                  onClick={() => handleInspect(board)}
                                  className="p-3.5 bg-gradient-to-r from-slate-900 to-slate-900/80 border-b border-slate-800 cursor-pointer hover:bg-slate-800/50 transition-colors flex items-center justify-between"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center shrink-0">
                                      <span className="material-icons-round text-lg">
                                        {board.node.type === ComponentType.SYSTEM_ROOT ? 'domain' : 'dns'}
                                      </span>
                                    </div>

                                    <div>
                                      <div className="flex items-center gap-2">
                                        <h4 className="text-sm font-bold text-white tracking-tight hover:text-amber-400 transition-colors">
                                          {board.node.name}
                                        </h4>
                                        {board.node.componentNumber && (
                                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                            #{board.node.componentNumber}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                                        <span className="text-sky-400 font-semibold font-mono">
                                          {board.node.amps || 0}A • {board.node.voltage || 400}V • {board.node.kva || 0}kVA
                                        </span>
                                        {board.place && (
                                          <span className="text-slate-500">• 📍 {board.place}</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Feeder / Parent badge (NO LINES!) */}
                                  <div className="text-right shrink-0">
                                    {board.parent ? (
                                      <div className="text-[10px] bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700 text-slate-300 flex items-center gap-1" title="Feeding Source">
                                        <span className="material-icons-round text-xs text-amber-400">arrow_upward</span>
                                        <span>{bfT.parentFeeder || 'Feeder'}: <strong className="text-white">{board.parent.name}</strong></span>
                                      </div>
                                    ) : (
                                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-semibold">
                                        {bfT.independentSource || 'Main Source'}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Enclosure Interior: Modular Slots for Downstream Sons */}
                                <div className="p-3 bg-slate-950/40">
                                  <div className="text-[10px] uppercase font-bold text-slate-500 mb-2 flex items-center justify-between">
                                    <span>{bfT.downstreamSons || 'Downstream Sons'} ({localSons.length + remoteSons.length})</span>
                                    <span className="text-[9px] font-mono text-slate-600">ENCLOSURE SLOTS</span>
                                  </div>

                                  {/* Local Sons (Living on this floor) */}
                                  {localSons.length > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {localSons.map((son) => {
                                        const isSonSelected = inspectedNodeId === son.node.id;

                                        return (
                                          <div
                                            key={son.node.id}
                                            onClick={() => handleInspect(son)}
                                            className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-between group ${
                                              isSonSelected
                                                ? 'bg-amber-500/10 border-amber-500/70 text-white'
                                                : 'bg-slate-900/90 border-slate-800/80 hover:bg-slate-800 hover:border-slate-700'
                                            }`}
                                          >
                                            <div className="flex items-center gap-2 min-w-0">
                                              <div className="w-6 h-6 rounded bg-slate-800 text-slate-300 flex items-center justify-center shrink-0">
                                                <LegendIcon
                                                  icon={COMPONENT_CONFIG[son.node.type]?.icon || 'help'}
                                                  color={COMPONENT_CONFIG[son.node.type]?.color || '#94a3b8'}
                                                  size={14}
                                                />
                                              </div>
                                              <div className="truncate">
                                                <div className="text-xs font-semibold text-slate-200 group-hover:text-amber-400 truncate transition-colors">
                                                  {son.node.name}
                                                </div>
                                                <div className="text-[10px] font-mono text-slate-400">
                                                  {son.node.amps ? `${son.node.amps}A` : ''} {son.node.kva ? `• ${son.node.kva}kVA` : ''}
                                                </div>
                                              </div>
                                            </div>

                                            {son.node.isEssential && (
                                              <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" title="Essential Emergency Load"></span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {/* Remote Sons (Fed from here but physically located on other floors) */}
                                  {remoteSons.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-slate-800/60">
                                      <span className="text-[10px] text-slate-500 block mb-1.5">
                                        ⚡ Feeds sub-panels on other floors (no crossing lines):
                                      </span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {remoteSons.map(rSon => (
                                          <button
                                            key={rSon.node.id}
                                            onClick={() => handleInspect(rSon)}
                                            className="text-[10px] px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/60 flex items-center gap-1 transition-colors"
                                          >
                                            <span className="font-semibold text-slate-200">{rSon.node.name}</span>
                                            <span className="text-amber-400 font-mono">({rSon.floor || 'No floor'})</span>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {localSons.length === 0 && remoteSons.length === 0 && (
                                    <div className="text-xs text-slate-600 py-1 italic">
                                      No downstream circuits attached.
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 2. Standalone Equipment & Branch Loads on this Floor */}
                    {floor.standaloneNodes.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                          <span className="material-icons-round text-sm text-emerald-400">devices</span>
                          <span>{bfT.individualDevices || 'Equipment & Loads on this Floor'}</span>
                          <span className="text-[10px] font-mono text-slate-500">({floor.standaloneNodes.length})</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                          {floor.standaloneNodes.map((item) => {
                            const isSelected = inspectedNodeId === item.node.id;

                            return (
                              <div
                                key={item.node.id}
                                onClick={() => handleInspect(item)}
                                className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between bg-slate-900/60 hover:bg-slate-800/80 ${
                                  isSelected
                                    ? 'border-amber-500 ring-2 ring-amber-500/20 shadow-md'
                                    : 'border-slate-800 hover:border-slate-700'
                                }`}
                              >
                                <div>
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center shrink-0">
                                        <LegendIcon
                                          icon={COMPONENT_CONFIG[item.node.type]?.icon || 'help'}
                                          color={COMPONENT_CONFIG[item.node.type]?.color || '#94a3b8'}
                                          size={16}
                                        />
                                      </div>
                                      <div className="truncate">
                                        <h5 className="text-xs font-bold text-white truncate">
                                          {item.node.name}
                                        </h5>
                                        <span className="text-[10px] text-slate-400 block truncate">
                                          {t.componentTypes[item.node.type] || item.node.type}
                                        </span>
                                      </div>
                                    </div>

                                    {item.node.isEssential && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-red-500/20 text-red-300 border border-red-500/30 font-semibold uppercase shrink-0">
                                        EMERGENCY
                                      </span>
                                    )}
                                  </div>

                                  <div className="mt-2.5 flex items-center gap-2 text-[11px] font-mono">
                                    <span className="text-amber-400 font-semibold">
                                      {item.node.amps ? `${item.node.amps}A` : ''}
                                    </span>
                                    {item.node.kva && (
                                      <span className="text-slate-400">• {item.node.kva}kVA</span>
                                    )}
                                    {item.place && (
                                      <span className="text-slate-500 truncate">• {item.place}</span>
                                    )}
                                  </div>
                                </div>

                                {/* Feeder Reference Badge (NO LINES!) */}
                                <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px]">
                                  {item.parent ? (
                                    <span className="text-slate-400 truncate flex items-center gap-1" title={`Fed by ${item.parent.name}`}>
                                      <span className="material-icons-round text-xs text-amber-400">bolt</span>
                                      <span className="truncate">Fed by: <strong className="text-slate-200">{item.parent.name}</strong></span>
                                    </span>
                                  ) : (
                                    <span className="text-emerald-400 font-medium">Independent</span>
                                  )}

                                  {/* Quick assign button if unassigned */}
                                  {floor.isUnassigned && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setQuickAssignTargetId(quickAssignTargetId === item.node.id ? null : item.node.id);
                                      }}
                                      className="px-2 py-0.5 rounded bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 border border-amber-500/40 text-[10px] font-semibold transition-colors"
                                    >
                                      {bfT.assignFloor || 'Assign Floor'}
                                    </button>
                                  )}
                                </div>

                                {/* Quick Floor Dropdown Popover */}
                                {quickAssignTargetId === item.node.id && (
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="mt-2 p-2 bg-slate-950 border border-amber-500/50 rounded-xl shadow-xl space-y-1.5 animate-fadeIn"
                                  >
                                    <div className="text-[10px] font-bold text-amber-400 uppercase">
                                      {bfT.quickAssign || 'Quick Assign to Floor'}:
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 text-[11px]">
                                      {['Roof', 'Floor 3', 'Floor 2', 'Floor 1', 'Ground Floor', 'Basement 1', 'Basement 2'].map(flr => (
                                        <button
                                          key={flr}
                                          onClick={() => handleQuickAssignFloor(item, flr)}
                                          className="px-2 py-1 bg-slate-800 hover:bg-amber-600 hover:text-white rounded text-slate-300 transition-colors text-left truncate"
                                        >
                                          {flr}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {floor.enclosures.length === 0 && floor.standaloneNodes.length === 0 && (
                      <div className="text-xs text-slate-500 py-3 text-center italic">
                        No equipment placed on this floor slab yet.
                      </div>
                    )}

                  </div>
                </section>
              );
            })}
          </main>

          {/* Right: Component Detail & Location Editor Inspector Drawer */}
          {inspectedItem && (
            <aside className="w-80 xl:w-96 border-l border-slate-800 bg-slate-900/60 p-4 flex flex-col shrink-0 overflow-y-auto custom-scrollbar animate-fadeIn">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span className="material-icons-round text-sm text-amber-400">info</span>
                  {t.propertiesActions || 'Component Inspector'}
                </span>
                <button
                  onClick={() => setInspectedNodeId(null)}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                >
                  <span className="material-icons-round text-base">close</span>
                </button>
              </div>

              {/* Component Header Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 mb-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                    <LegendIcon
                      icon={COMPONENT_CONFIG[inspectedItem.node.type]?.icon || 'help'}
                      color={COMPONENT_CONFIG[inspectedItem.node.type]?.color || '#f59e0b'}
                      size={20}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-white truncate">
                      {inspectedItem.node.name}
                    </h3>
                    <div className="text-xs text-amber-400/90 font-medium">
                      {t.componentTypes[inspectedItem.node.type] || inspectedItem.node.type}
                    </div>
                    {inspectedItem.node.componentNumber && (
                      <span className="text-[10px] font-mono text-slate-400">
                        Component #{inspectedItem.node.componentNumber}
                      </span>
                    )}
                  </div>
                </div>

                {/* Ratings Grid */}
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800 text-center text-xs">
                  <div className="bg-slate-950/60 p-1.5 rounded-lg border border-slate-800/80">
                    <span className="text-[9px] text-slate-500 block">Amps</span>
                    <span className="font-bold text-slate-200 font-mono">{inspectedItem.node.amps || 0}A</span>
                  </div>
                  <div className="bg-slate-950/60 p-1.5 rounded-lg border border-slate-800/80">
                    <span className="text-[9px] text-slate-500 block">Voltage</span>
                    <span className="font-bold text-slate-200 font-mono">{inspectedItem.node.voltage || 400}V</span>
                  </div>
                  <div className="bg-slate-950/60 p-1.5 rounded-lg border border-slate-800/80">
                    <span className="text-[9px] text-slate-500 block">Power</span>
                    <span className="font-bold text-amber-400 font-mono">{inspectedItem.node.kva || 0}kVA</span>
                  </div>
                </div>
              </div>

              {/* Father / Source Feeder Box (NO LINES!) */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 mb-4">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-2 flex items-center gap-1">
                  <span className="material-icons-round text-xs text-sky-400">arrow_upward</span>
                  {bfT.parentFeeder || 'Direct Parent (Father Feeder)'}
                </span>

                {inspectedItem.parent ? (
                  <div
                    onClick={() => handleInspect(extractedMap.get(inspectedItem.parent!.id) || inspectedItem)}
                    className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white hover:text-amber-400 transition-colors">
                        {inspectedItem.parent.name}
                      </span>
                      <span className="text-[10px] text-amber-400 font-mono">
                        {inspectedItem.parent.floor || 'Floor ?'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {t.componentTypes[inspectedItem.parent.type]} • {inspectedItem.parent.amps || 0}A
                    </div>
                    {inspectedItem.feederCable && (
                      <div className="text-[10px] font-mono text-sky-400 mt-1 flex items-center gap-1">
                        <span className="material-icons-round text-xs">cable</span>
                        <span>{inspectedItem.feederCable}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-emerald-400 font-semibold p-2 bg-emerald-950/20 border border-emerald-800/40 rounded-lg">
                    ⚡ {bfT.independentSource || 'Root / Independent Power Supply'}
                  </div>
                )}
              </div>

              {/* Downstream Fed Sons List */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 mb-4">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <span className="material-icons-round text-xs text-emerald-400">arrow_downward</span>
                    <span>{bfT.downstreamSons || 'Downstream Fed Sons'}</span>
                  </span>
                  <span className="text-slate-500 font-mono">({inspectedItem.directSons.length})</span>
                </span>

                {inspectedItem.directSons.length > 0 ? (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar">
                    {inspectedItem.directSons.map(son => (
                      <div
                        key={son.id}
                        onClick={() => {
                          const ext = extractedMap.get(son.id);
                          if (ext) handleInspect(ext);
                        }}
                        className="p-2 bg-slate-950 rounded-lg border border-slate-800/80 hover:border-slate-700 cursor-pointer flex items-center justify-between text-xs"
                      >
                        <div className="truncate">
                          <span className="font-semibold text-slate-200 block truncate">{son.name}</span>
                          <span className="text-[10px] text-slate-500">{son.amps ? `${son.amps}A` : ''}</span>
                        </div>
                        <span className="text-[10px] text-amber-400 font-mono shrink-0">
                          {son.floor || 'No floor'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic p-1">
                    No downstream sons (Terminal load).
                  </div>
                )}
              </div>

              {/* Location Editor Form */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 mb-4 space-y-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 block flex items-center gap-1">
                  <span className="material-icons-round text-xs text-amber-400">edit_location</span>
                  {bfT.editLocation || 'Edit Floor & Location'}
                </span>

                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-1">{bfT.building || 'Building'}</label>
                  <input
                    type="text"
                    value={editLocationForm.building}
                    onChange={(e) => setEditLocationForm({ ...editLocationForm, building: e.target.value })}
                    placeholder="e.g. Main Building, Tower A"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-1">{bfT.floor || 'Floor'}</label>
                  <input
                    type="text"
                    value={editLocationForm.floor}
                    onChange={(e) => setEditLocationForm({ ...editLocationForm, floor: e.target.value })}
                    placeholder="e.g. Floor 2, Ground, Roof, B1"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-1">{bfT.room || 'Room / Area'}</label>
                  <input
                    type="text"
                    value={editLocationForm.place}
                    onChange={(e) => setEditLocationForm({ ...editLocationForm, place: e.target.value })}
                    placeholder={bfT.roomPlaceholder || 'e.g. Electrical Room 101, Server Rack...'}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-amber-500 outline-none"
                  />
                </div>

                <button
                  onClick={handleSaveLocation}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold shadow-md transition-colors flex items-center justify-center gap-1.5"
                >
                  <span className="material-icons-round text-sm">save</span>
                  <span>{bfT.saveChanges || 'Save Location'}</span>
                </button>
              </div>

              {/* Locate in Diagram Action */}
              <button
                onClick={() => onNavigateToNode(inspectedItem.pageId, inspectedItem.node.id)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 rounded-xl text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-icons-round text-sm">open_in_new</span>
                <span>{bfT.locateInDiagram || 'Locate in SLD Diagram'}</span>
              </button>
            </aside>
          )}

        </div>
      </div>
    </div>
  );
};
