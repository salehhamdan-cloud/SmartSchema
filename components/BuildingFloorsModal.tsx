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
function parseFloorLevel(rawFloor?: string, tFloorNames?: any, language?: string, isRTL?: boolean): {
  key: string;
  displayName: string;
  rank: number;
  elevation: string;
  isUnassigned: boolean;
} {
  if (!rawFloor || !rawFloor.trim()) {
    return {
      key: '__unassigned__',
      displayName: tFloorNames?.unassigned || (language === 'ar' ? 'بدون دور محدد' : (language === 'he' ? 'ללא קומה' : 'Unassigned Floor')),
      rank: -9999,
      elevation: '--',
      isUnassigned: true
    };
  }

  const str = rawFloor.trim();
  const lower = str.toLowerCase();

  // Roof / Penthouse
  if (/roof|גג|سطח|penthouse/i.test(lower)) {
    return {
      key: 'Roof',
      displayName: tFloorNames?.roof || (language === 'ar' ? 'السطح / الروف' : (language === 'he' ? 'גג / חדר מכונות' : 'Roof / Penthouse')),
      rank: 1000,
      elevation: '+12.00m',
      isUnassigned: false
    };
  }

  // Basement 2
  if (/b2|-2|basement\s*2|מרתף\s*2|بدروم\s*2|قبو\s*2/i.test(lower)) {
    return {
      key: 'Basement 2',
      displayName: tFloorNames?.basement2 || (language === 'ar' ? 'بدروم 2 (B2)' : (language === 'he' ? 'מרתף 2 (B2)' : 'Basement 2 (B2)')),
      rank: -2,
      elevation: '-6.50m',
      isUnassigned: false
    };
  }

  // Basement 1
  if (/b1|-1|basement|מרתף|بدروم|قبو/i.test(lower)) {
    return {
      key: 'Basement 1',
      displayName: tFloorNames?.basement1 || (language === 'ar' ? 'بدروم 1 (B1)' : (language === 'he' ? 'מרתף 1 (B1)' : 'Basement 1 (B1)')),
      rank: -1,
      elevation: '-3.20m',
      isUnassigned: false
    };
  }

  // Ground Floor
  if (/ground|קרקע|ارضي|أرضي|g|0/i.test(lower) && !/\d+/.test(lower.replace(/ground|קרקע|ارضي|أرضي|g|0/gi, ''))) {
    return {
      key: 'Ground Floor',
      displayName: tFloorNames?.ground || (language === 'ar' ? 'الدور الأرضي' : (language === 'he' ? 'קומת קרקע' : 'Ground Floor')),
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
      if (language === 'he') dispName = `קומה ${num}`;
      else if (language === 'ar') dispName = `الدور ${num}`;
      else dispName = `Floor ${num}`;
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
      const parsed = parseFloorLevel(item.floor, floorNamesT, language, isRTL);
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
              const sonParsedFloor = parseFloorLevel(sonExtracted.floor, floorNamesT, language, isRTL);
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
  }, [filteredNodes, floorNamesT, extractedMap, language, isRTL]);

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
          const sonCols = 2;
          const sonsRows = Math.ceil(maxSons / sonCols);
          const sonCardHeight = 96;
          const encHeight = 86 + (maxSons > 0 ? sonsRows * (sonCardHeight + 10) + 16 : 36);
          height += encHeight + 16;
        }
      }
      if (floor.standaloneNodes.length > 0) {
        height += 24; // section label
        const devCols = 3;
        const devCardHeight = 96;
        const devRows = Math.ceil(floor.standaloneNodes.length / devCols);
        height += devRows * (devCardHeight + 12) + 16;
      }
      height += 24; // floor bottom gap
    });
    height += 100; // badges legend + footer
    return Math.max(900, height);
  };

  // Helper: Truncate string safely without clipping unicode or undefined values
  const safeText = (text: string | undefined | null, maxLen: number = 65): string => {
    if (!text) return '';
    const str = String(text).trim();
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 1) + '…';
  };

  // Helper: Retrieve full untruncated display name for any node
  const getNodeFullName = (node?: ElectricalNode | null): string => {
    if (!node) return '';
    const baseName = (node.name || '').trim();
    const typeKey = node.type;
    const translatedType = t.componentTypes?.[typeKey] || typeKey;
    if (
      !baseName ||
      baseName.toUpperCase() === typeKey ||
      baseName.replace(/_/g, ' ').toUpperCase() === typeKey.replace(/_/g, ' ')
    ) {
      return translatedType || baseName || 'Node';
    }
    return baseName;
  };

  // Helper: Format meter display with model and number
  const getMeterDisplay = (node: ElectricalNode, isCompact: boolean = false): string => {
    if (!node.hasMeter) return '';
    const num = node.meterNumber || node.meterSerial;
    const model = node.meterModel;
    const meterWord = t.legend?.meter || 'Meter';
    if (model && num) {
      return isCompact ? `${model} #${num}` : `${meterWord}: ${model} (#${num})`;
    } else if (model) {
      return isCompact ? model : `${meterWord}: ${model}`;
    } else if (num) {
      return isCompact ? `M #${num}` : `${meterWord} #${num}`;
    }
    return isCompact ? meterWord : (t.legend?.meter || 'Energy Meter');
  };

  // Helper: Format multimeter display with model and number/serial
  const getMultimeterDisplay = (node: ElectricalNode, isCompact: boolean = false): string => {
    if (!node.hasMultimeter) return '';
    const num = node.multimeterNumber || node.multimeterSerial;
    const model = node.multimeterModel;
    const mmWord = t.legend?.multimeter || 'Multimeter';
    if (model && num) {
      return isCompact ? `${model} #${num}` : `${mmWord}: ${model} (#${num})`;
    } else if (model) {
      return isCompact ? model : `${mmWord}: ${model}`;
    } else if (num) {
      return isCompact ? `MM #${num}` : `${mmWord} #${num}`;
    }
    return isCompact ? mmWord : (t.legend?.multimeter || 'Digital Multimeter');
  };

  // Helper: Format meter and multimeter tags for Canvas / SVG with model and numbers
  const getMeterTag = (node: ElectricalNode, prefix: string = 'Meter'): string => {
    const parts: string[] = [];
    if (node.hasMeter) {
      const num = node.meterNumber || node.meterSerial;
      const model = node.meterModel;
      if (model && num) {
        parts.push(`[${prefix}: ${model} #${num}]`);
      } else if (model) {
        parts.push(`[${prefix}: ${model}]`);
      } else if (num) {
        parts.push(`[${prefix} #${num}]`);
      } else {
        parts.push(`[${prefix}]`);
      }
    }
    if (node.hasMultimeter) {
      const num = node.multimeterNumber || node.multimeterSerial;
      const model = node.multimeterModel;
      const mmPrefix = prefix === 'Meter' ? 'MM' : 'MM';
      if (model && num) {
        parts.push(`[${mmPrefix}: ${model} #${num}]`);
      } else if (model) {
        parts.push(`[${mmPrefix}: ${model}]`);
      } else if (num) {
        parts.push(`[${mmPrefix} #${num}]`);
      } else {
        parts.push(`[${mmPrefix}]`);
      }
    }
    return parts.join(' ');
  };

  // Badge definition for exported Canvas (PDF) and SVG drawings
  interface ExportBadgeInfo {
    key: string;
    label: string;
    icon: string;
    bg: string;
    text: string;
    border: string;
  }

  const fontSans = (size: number, weight: string = 'normal', style: string = 'normal') => {
    const isItalic = weight === 'italic' || style === 'italic';
    const actualWeight = weight === 'italic' ? 'normal' : weight;
    const stylePrefix = isItalic ? 'italic ' : '';
    return `${stylePrefix}${actualWeight} ${size}px "Cairo", "Heebo", "Rubik", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
  };

  const fontMono = (size: number, weight: string = 'bold') =>
    `${weight} ${size}px "Roboto Mono", ui-monospace, SFMono-Regular, monospace`;

  // Helper: Visual icons, colors and background styling for component types in Canvas & SVG exports
  const getComponentTypeExportVisual = (type: ComponentType) => {
    switch (type) {
      case ComponentType.SYSTEM_ROOT:
        return { symbol: '🏢', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' };
      case ComponentType.DISTRIBUTION_BOARD:
        return { symbol: '⚡', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' };
      case ComponentType.TRANSFORMER:
        return { symbol: '⎎', color: '#d97706', bg: '#fffbeb', border: '#fde68a' };
      case ComponentType.METER:
        return { symbol: '⏱', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' };
      case ComponentType.BREAKER:
        return { symbol: '⏻', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
      case ComponentType.SWITCH:
        return { symbol: '⏼', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' };
      case ComponentType.LOAD:
        return { symbol: '💡', color: '#9333ea', bg: '#faf5ff', border: '#e9d5ff' };
      case ComponentType.GENERATOR:
        return { symbol: '⚙', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
      case ComponentType.UPS:
        return { symbol: '🔋', color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' };
      case ComponentType.BUSBAR:
        return { symbol: '═', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' };
      default:
        return { symbol: '⚡', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' };
    }
  };

  // Helper: Extract complete set of badges/icons with labels and colors for PDF & SVG exports
  const getNodeExportBadges = (node: ElectricalNode): ExportBadgeInfo[] => {
    const list: ExportBadgeInfo[] = [];

    // 1. Meter
    if (node.hasMeter) {
      const label = getMeterDisplay(node, false);
      list.push({
        key: 'meter',
        label,
        icon: '⚡M',
        bg: '#ecfdf5',
        text: '#059669',
        border: '#a7f3d0'
      });
    }

    // 2. Multimeter
    if (node.hasMultimeter) {
      const label = getMultimeterDisplay(node, false);
      list.push({
        key: 'multimeter',
        label,
        icon: '📊',
        bg: '#faf5ff',
        text: '#7c3aed',
        border: '#ddd6fe'
      });
    }

    // 3. Generator Connection
    if (node.hasGeneratorConnection) {
      const genWord = t.legend?.generator || 'Generator';
      const genName = node.generatorName ? `${genWord}: ${node.generatorName}` : genWord;
      list.push({
        key: 'generator',
        label: genName,
        icon: '⚡G',
        bg: '#fef2f2',
        text: '#dc2626',
        border: '#fecaca'
      });
    }

    // 4. Transfer Switch / ATS
    if (node.hasTransferSwitch) {
      const atsWord = t.legend?.transferSwitch || 'ATS';
      const atsName = node.secondBreakerName ? `${atsWord}: ${node.secondBreakerName}` : atsWord;
      list.push({
        key: 'ats',
        label: atsName,
        icon: '⇄',
        bg: '#fffbeb',
        text: '#d97706',
        border: '#fde68a'
      });
    }

    // 5. Essential / Emergency
    if (node.isEssential) {
      list.push({
        key: 'essential',
        label: t.legend?.essential || 'Emergency',
        icon: '★',
        bg: '#fef2f2',
        text: '#e11d48',
        border: '#fecdd3'
      });
    }

    // 6. Air Conditioning
    if (node.isAirConditioning) {
      list.push({
        key: 'ac',
        label: t.legend?.ac || 'AC',
        icon: '❄',
        bg: '#ecfeff',
        text: '#0891b2',
        border: '#a5f3fc'
      });
    }

    // 7. Air Circuit Breaker
    if (node.isAirBreaker) {
      list.push({
        key: 'acb',
        label: t.legend?.airBreaker || 'ACB',
        icon: '💨',
        bg: '#f0f9ff',
        text: '#0284c7',
        border: '#bae6fd'
      });
    }

    // 8. Reserved
    if (node.isReserved) {
      list.push({
        key: 'reserved',
        label: t.legend?.reserved || 'Reserved',
        icon: '🔒',
        bg: '#fefce8',
        text: '#ca8a04',
        border: '#fef08a'
      });
    }

    // 9. Public Board
    if (node.isPublicBoard) {
      list.push({
        key: 'public',
        label: t.legend?.publicBoard || 'Public',
        icon: '👥',
        bg: '#f0fdfa',
        text: '#0d9488',
        border: '#99f6e4'
      });
    }

    // 10. Excluded from Meter
    if (node.isExcludedFromMeter) {
      list.push({
        key: 'unmetered',
        label: t.legend?.noMeter || 'Unmetered',
        icon: '⊘',
        bg: '#f8fafc',
        text: '#64748b',
        border: '#cbd5e1'
      });
    }

    return list;
  };

  // Helper: Draw badge pills onto HTML Canvas 2D with multi-line wrapping
  const drawBadgePillsOnCanvas = (
    ctx: CanvasRenderingContext2D,
    badges: ExportBadgeInfo[],
    anchorX: number,
    startY: number,
    maxWidth: number,
    alignRight: boolean,
    maxRows: number = 2
  ) => {
    if (!badges || badges.length === 0) return;
    const pillHeight = 15;
    const badgeGap = 5;
    const rowGap = 3;
    ctx.font = fontSans(7.5, '600');

    const measured = badges.map(b => {
      const text = `${b.icon}  ${b.label}`;
      const textMetrics = ctx.measureText(text);
      const w = Math.min(maxWidth, Math.max(34, Math.ceil(textMetrics.width) + 12));
      return { ...b, fullText: text, w };
    });

    const rows: (typeof measured)[] = [];
    let currentRow: typeof measured = [];
    let currentW = 0;

    for (const m of measured) {
      if (currentRow.length === 0) {
        currentRow.push(m);
        currentW = m.w;
      } else if (currentW + badgeGap + m.w <= maxWidth) {
        currentRow.push(m);
        currentW += badgeGap + m.w;
      } else if (rows.length + 1 < maxRows) {
        rows.push(currentRow);
        currentRow = [m];
        currentW = m.w;
      } else {
        break;
      }
    }
    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    rows.forEach((rowPills, rIdx) => {
      const y = startY + rIdx * (pillHeight + rowGap);
      if (alignRight) {
        let rightEdge = anchorX;
        rowPills.forEach(p => {
          const px = rightEdge - p.w;
          drawRoundRect(ctx, px, y, p.w, pillHeight, 4);
          ctx.fillStyle = p.bg;
          ctx.fill();
          ctx.strokeStyle = p.border;
          ctx.lineWidth = 0.8;
          ctx.stroke();

          ctx.fillStyle = p.text;
          ctx.textAlign = 'center';
          ctx.fillText(p.fullText, px + p.w / 2, y + 10.5);
          rightEdge -= (p.w + badgeGap);
        });
      } else {
        let leftEdge = anchorX;
        rowPills.forEach(p => {
          drawRoundRect(ctx, leftEdge, y, p.w, pillHeight, 4);
          ctx.fillStyle = p.bg;
          ctx.fill();
          ctx.strokeStyle = p.border;
          ctx.lineWidth = 0.8;
          ctx.stroke();

          ctx.fillStyle = p.text;
          ctx.textAlign = 'center';
          ctx.fillText(p.fullText, leftEdge + p.w / 2, y + 10.5);
          leftEdge += (p.w + badgeGap);
        });
      }
    });
  };

  // Helper: Render badge pills as SVG vector string with multi-line wrapping
  const renderSvgBadgePills = (
    badges: ExportBadgeInfo[],
    anchorX: number,
    startY: number,
    maxWidth: number,
    alignRight: boolean,
    maxRows: number = 2
  ): string => {
    if (!badges || badges.length === 0) return '';
    const pillHeight = 15;
    const badgeGap = 5;
    const rowGap = 3;

    const measured = badges.map(b => {
      const text = `${b.icon}  ${b.label}`;
      let charW = 0;
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        charW += (code > 255) ? 6.5 : 4.6;
      }
      const w = Math.min(maxWidth, Math.max(34, Math.ceil(charW) + 12));
      return { ...b, fullText: text, w };
    });

    const rows: (typeof measured)[] = [];
    let currentRow: typeof measured = [];
    let currentW = 0;

    for (const m of measured) {
      if (currentRow.length === 0) {
        currentRow.push(m);
        currentW = m.w;
      } else if (currentW + badgeGap + m.w <= maxWidth) {
        currentRow.push(m);
        currentW += badgeGap + m.w;
      } else if (rows.length + 1 < maxRows) {
        rows.push(currentRow);
        currentRow = [m];
        currentW = m.w;
      } else {
        break;
      }
    }
    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    let out = '';
    rows.forEach((rowPills, rIdx) => {
      const y = startY + rIdx * (pillHeight + rowGap);
      if (alignRight) {
        let rightEdge = anchorX;
        rowPills.forEach(p => {
          const px = rightEdge - p.w;
          out += `
          <rect x="${px}" y="${y}" width="${p.w}" height="${pillHeight}" rx="4" fill="${p.bg}" stroke="${p.border}" stroke-width="0.8" />
          <text x="${px + p.w / 2}" y="${y + 10.5}" fill="${p.text}" font-size="7.5" font-weight="600" text-anchor="middle">${escapeXml(p.fullText)}</text>`;
          rightEdge -= (p.w + badgeGap);
        });
      } else {
        let leftEdge = anchorX;
        rowPills.forEach(p => {
          out += `
          <rect x="${leftEdge}" y="${y}" width="${p.w}" height="${pillHeight}" rx="4" fill="${p.bg}" stroke="${p.border}" stroke-width="0.8" />
          <text x="${leftEdge + p.w / 2}" y="${y + 10.5}" fill="${p.text}" font-size="7.5" font-weight="600" text-anchor="middle">${escapeXml(p.fullText)}</text>`;
          leftEdge += (p.w + badgeGap);
        });
      }
    });

    return out;
  };

  // Helper: Render all node badges and icons cleanly at the BOTTOM of the node (never beside the name)
  // Ordered strictly as: 1. Meter badge with type and number, 2. Multimeter badge with type and number, 3. Other icons/badges
  const renderNodeBadgesBottom = (node: ElectricalNode, isCompact: boolean = false) => {
    const hasAnyBadge = Boolean(
      node.hasMeter ||
      node.hasMultimeter ||
      node.hasGeneratorConnection ||
      node.hasTransferSwitch ||
      node.isEssential ||
      node.isAirConditioning ||
      node.isAirBreaker ||
      node.isReserved ||
      node.isPublicBoard ||
      node.isExcludedFromMeter
    );

    if (!hasAnyBadge) return null;

    return (
      <div className={`flex items-center gap-2.5 flex-wrap pt-2.5 mt-2.5 border-t ${
        theme === 'dark' ? 'border-slate-800/80' : 'border-slate-200/80'
      }`}>
        {/* 1. Meter badge with Type/Model AND Number */}
        {node.hasMeter && (
          <span
            className="text-[10px] font-mono px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1.5 font-semibold"
            title={node.meterModel ? `${t.legend?.meter || 'Meter'}: ${node.meterModel}${node.meterNumber ? ` • #${node.meterNumber}` : (node.meterSerial ? ` • #${node.meterSerial}` : '')}` : (node.meterNumber ? `${t.legend?.meter || 'Meter'} #${node.meterNumber}` : (t.legend?.meter || 'Energy Meter'))}
          >
            <span className="material-icons-round text-xs">speed</span>
            <span>
              {getMeterDisplay(node, isCompact)}
            </span>
          </span>
        )}

        {/* 2. Multimeter badge with Type/Model AND Number */}
        {node.hasMultimeter && (
          <span
            className="text-[10px] font-mono px-2.5 py-1 rounded-md bg-purple-500/20 text-purple-400 border border-purple-500/40 flex items-center gap-1.5 font-semibold"
            title={node.multimeterModel ? `${t.legend?.multimeter || 'Multimeter'}: ${node.multimeterModel}${node.multimeterSerial ? ` • S/N: ${node.multimeterSerial}` : ''}` : (t.legend?.multimeter || 'Multimeter (V, A, Hz, PF)')}
          >
            <span className="material-icons-round text-xs">multiline_chart</span>
            <span>
              {getMultimeterDisplay(node, isCompact)}
            </span>
          </span>
        )}

        {/* 3. Generator Connection */}
        {node.hasGeneratorConnection && (
          <span
            className="text-[10px] font-mono px-2.5 py-1 rounded-md bg-red-500/20 text-red-400 border border-red-500/40 flex items-center gap-1.5 font-semibold"
            title={node.generatorName ? `${t.legend?.generator || 'Generator'}: ${node.generatorName}` : (t.legend?.generator || 'Generator Connection')}
          >
            <span className="material-icons-round text-xs">power</span>
            <span>{node.generatorName ? `${t.legend?.generator || 'Gen'}: ${node.generatorName}` : (t.legend?.generator || 'Generator')}</span>
          </span>
        )}

        {/* 4. ATS / Transfer Switch */}
        {node.hasTransferSwitch && (
          <span
            className="text-[10px] font-mono px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center gap-1.5 font-semibold"
            title={node.secondBreakerName ? `${t.legend?.transferSwitch || 'ATS'}: ${node.secondBreakerName}` : (t.legend?.transferSwitch || 'ATS Switch')}
          >
            <span className="material-icons-round text-xs">swap_horiz</span>
            <span>{node.secondBreakerName ? `${t.legend?.transferSwitch || 'ATS'}: ${node.secondBreakerName}` : (t.legend?.transferSwitch || 'ATS')}</span>
          </span>
        )}

        {/* 5. Essential / Emergency */}
        {node.isEssential && (
          <span
            className="text-[10px] font-mono px-2.5 py-1 rounded-md bg-red-500/20 text-red-400 border border-red-500/40 flex items-center gap-1.5 font-semibold uppercase"
            title={t.legend?.essential || "Essential Emergency Load"}
          >
            <span className="material-icons-round text-xs">star</span>
            <span>{t.legend?.essential || 'Emergency'}</span>
          </span>
        )}

        {/* 6. Air Conditioning */}
        {node.isAirConditioning && (
          <span
            className="text-[10px] font-mono px-2 py-1 rounded-md bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center gap-1.5 font-semibold"
            title={t.legend?.ac || "Air Conditioning Unit"}
          >
            <span className="material-icons-round text-xs">ac_unit</span>
            <span>{t.legend?.ac || 'AC'}</span>
          </span>
        )}

        {/* 7. Air Breaker */}
        {node.isAirBreaker && (
          <span
            className="text-[10px] font-mono px-2 py-1 rounded-md bg-sky-500/20 text-sky-400 border border-sky-500/40 flex items-center gap-1.5 font-semibold"
            title={t.legend?.airBreaker || "Air Circuit Breaker (ACB)"}
          >
            <span className="material-icons-round text-xs">air</span>
            <span>{t.legend?.airBreaker || 'ACB'}</span>
          </span>
        )}

        {/* 8. Reserved */}
        {node.isReserved && (
          <span
            className="text-[10px] font-mono px-2 py-1 rounded-md bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 flex items-center gap-1.5 font-semibold"
            title={t.legend?.reserved || "Reserved / Lock"}
          >
            <span className="material-icons-round text-xs">lock</span>
            <span>{t.legend?.reserved || 'Reserved'}</span>
          </span>
        )}

        {/* 9. Public Board */}
        {node.isPublicBoard && (
          <span
            className="text-[10px] font-mono px-2 py-1 rounded-md bg-teal-500/20 text-teal-400 border border-teal-500/40 flex items-center gap-1.5 font-semibold"
            title={t.legend?.publicBoard || "Public / Communal Board"}
          >
            <span className="material-icons-round text-xs">people</span>
            <span>{t.legend?.publicBoard || 'Public'}</span>
          </span>
        )}

        {/* 10. Excluded from Meter */}
        {node.isExcludedFromMeter && (
          <span
            className="text-[10px] font-mono px-2 py-1 rounded-md bg-slate-500/20 text-slate-400 border border-slate-500/40 flex items-center gap-1.5 font-semibold"
            title={t.legend?.noMeter || "Not Connected to Meter"}
          >
            <span className="material-icons-round text-xs">power_off</span>
            <span>{t.legend?.noMeter || 'Unmetered'}</span>
          </span>
        )}
      </div>
    );
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

    // 1. Clean Light Architectural CAD Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, svgWidth, totalHeight);

    let currentY = 30;
    const headerHeight = 98;

    // 2. Title Block Header
    drawRoundRect(ctx, 40, currentY, svgWidth - 80, headerHeight, 12);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = '#cbd5e1';
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
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Stats inside card: right to left
      ctx.textAlign = 'right';
      // Equipment (right col)
      ctx.fillStyle = '#0284c7';
      ctx.font = fontSans(13, 'bold');
      ctx.fillText(`${buildingTotals.nodes} ${bfT.components || 'items'}`, statsX + statsWidth - 20, currentY + 38);
      ctx.fillStyle = '#64748b';
      ctx.font = fontSans(10, 'normal');
      ctx.fillText(bfT.totalComponents || 'Equipment', statsX + statsWidth - 20, currentY + 56);

      // Distribution Boards (middle col)
      ctx.fillStyle = '#d97706';
      ctx.font = fontSans(13, 'bold');
      ctx.fillText(`${buildingTotals.boards}`, statsX + statsWidth - 130, currentY + 38);
      ctx.fillStyle = '#64748b';
      ctx.font = fontSans(10, 'normal');
      ctx.fillText(bfT.boards || 'Panels', statsX + statsWidth - 130, currentY + 56);

      // Levels (left col)
      ctx.fillStyle = '#059669';
      ctx.font = fontSans(13, 'bold');
      ctx.fillText(`${floorGroups.length}`, statsX + statsWidth - 235, currentY + 38);
      ctx.fillStyle = '#64748b';
      ctx.font = fontSans(10, 'normal');
      ctx.fillText(bfT.levels || 'Levels', statsX + statsWidth - 235, currentY + 56);

      // Date / Page
      ctx.fillStyle = '#94a3b8';
      ctx.font = fontSans(9, 'normal');
      ctx.fillText(pageDateStr, statsX + statsWidth - 20, currentY + 74);

      // Building Icon on the RIGHT
      const iconCenterX = svgWidth - 68;
      ctx.beginPath();
      ctx.arc(iconCenterX, currentY + 38, 18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
      ctx.fill();

      // Vector Building Path
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(iconCenterX - 9, currentY + 29, 18, 18);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(iconCenterX - 5, currentY + 33, 3, 3);
      ctx.fillRect(iconCenterX + 2, currentY + 33, 3, 3);
      ctx.fillRect(iconCenterX - 5, currentY + 39, 3, 3);
      ctx.fillRect(iconCenterX + 2, currentY + 39, 3, 3);

      // Title Text (Right-aligned)
      ctx.fillStyle = '#0f172a';
      ctx.font = fontSans(20, 'bold');
      ctx.textAlign = 'right';
      ctx.fillText(`${activeProject.name} — ${bfT.title || 'Building & Floor Distribution'}`, svgWidth - 100, currentY + 38);

      // Subtitle
      ctx.fillStyle = '#64748b';
      ctx.font = fontSans(12, 'normal');
      ctx.fillText(bfT.noLinesNote || 'Physical layout: Feeder connections grouped by panel bay without lines', svgWidth - 100, currentY + 62);

      // Scope & Building
      ctx.fillStyle = '#0284c7';
      ctx.font = fontSans(11, '600');
      ctx.fillText(buildingStr, svgWidth - 100, currentY + 84);
    } else {
      // --- LTR Title Block Header ---
      // Building Icon Badge
      ctx.beginPath();
      ctx.arc(68, currentY + 38, 18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
      ctx.fill();

      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(59, currentY + 29, 18, 18);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(63, currentY + 33, 3, 3);
      ctx.fillRect(70, currentY + 33, 3, 3);
      ctx.fillRect(63, currentY + 39, 3, 3);
      ctx.fillRect(70, currentY + 39, 3, 3);

      // Title Text
      ctx.textAlign = 'left';
      ctx.fillStyle = '#0f172a';
      ctx.font = fontSans(20, 'bold');
      ctx.fillText(`${activeProject.name} — ${bfT.title || 'Building & Floor Distribution'}`, 100, currentY + 38);

      // Subtitle
      ctx.fillStyle = '#64748b';
      ctx.font = fontSans(12, 'normal');
      ctx.fillText(bfT.noLinesNote || 'Physical layout: Feeder connections grouped by panel bay without lines', 100, currentY + 62);

      // Scope & Building
      ctx.fillStyle = '#0284c7';
      ctx.font = fontSans(11, '600');
      ctx.fillText(buildingStr, 100, currentY + 84);

      // Stats Card on the RIGHT
      drawRoundRect(ctx, svgWidth - 460, currentY + 16, 365, 66, 8);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#0284c7';
      ctx.font = fontSans(13, 'bold');
      ctx.fillText(`${buildingTotals.nodes} ${bfT.components || 'items'}`, svgWidth - 440, currentY + 38);
      ctx.fillStyle = '#64748b';
      ctx.font = fontSans(10, 'normal');
      ctx.fillText(bfT.totalComponents || 'Equipment', svgWidth - 440, currentY + 56);

      ctx.fillStyle = '#d97706';
      ctx.font = fontSans(13, 'bold');
      ctx.fillText(`${buildingTotals.boards}`, svgWidth - 340, currentY + 38);
      ctx.fillStyle = '#64748b';
      ctx.font = fontSans(10, 'normal');
      ctx.fillText(bfT.boards || 'Panels', svgWidth - 340, currentY + 56);

      ctx.fillStyle = '#059669';
      ctx.font = fontSans(13, 'bold');
      ctx.fillText(`${floorGroups.length}`, svgWidth - 245, currentY + 38);
      ctx.fillStyle = '#64748b';
      ctx.font = fontSans(10, 'normal');
      ctx.fillText(bfT.levels || 'Levels', svgWidth - 245, currentY + 56);

      ctx.fillStyle = '#94a3b8';
      ctx.font = fontSans(9, 'normal');
      ctx.fillText(pageDateStr, svgWidth - 440, currentY + 74);
    }

    currentY += headerHeight + 25;

    // 3. Render Each Floor Slab
    floorsToRender.forEach(floor => {
      const isUnassigned = floor.isUnassigned;
      const slabFill = isUnassigned ? '#c2410c' : '#0284c7';
      const slabStroke = isUnassigned ? '#9a3412' : '#0369a1';
      const slabTitleColor = '#ffffff';

      // Slab Banner Bar
      drawRoundRect(ctx, 40, currentY, svgWidth - 80, 46, 8);
      ctx.fillStyle = slabFill;
      ctx.fill();
      ctx.strokeStyle = slabStroke;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      if (isRTL) {
        // RTL Floor Banner (No floor heights)
        // Floor Name on the RIGHT
        ctx.fillStyle = slabTitleColor;
        ctx.font = fontSans(16, 'bold');
        ctx.textAlign = 'right';
        ctx.fillText(floor.displayName, svgWidth - 65, currentY + 29);

        // Essential Badge
        if (floor.essentialCount > 0) {
          ctx.font = fontSans(16, 'bold');
          const nameWidth = ctx.measureText(floor.displayName).width;
          const essX = Math.max(380, svgWidth - 75 - nameWidth - 135);
          drawRoundRect(ctx, essX, currentY + 11, 125, 24, 12);
          ctx.fillStyle = '#fee2e2';
          ctx.fill();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 0.8;
          ctx.stroke();

          ctx.fillStyle = '#b91c1c';
          ctx.font = fontSans(10, 'bold');
          ctx.textAlign = 'center';
          ctx.fillText(`⚡ ${floor.essentialCount} ${bfT.essential || 'Essential'}`, essX + 62.5, currentY + 27);
        }

        // Slab Totals on the LEFT (No Total Load / Current)
        ctx.fillStyle = '#ffffff';
        ctx.font = fontSans(12, 'bold');
        ctx.textAlign = 'left';
        ctx.fillText(`${floor.nodes.length} ${bfT.components || 'items'}`, 55, currentY + 28);
      } else {
        // LTR Floor Banner (No floor heights)
        // Floor Name on the LEFT
        ctx.fillStyle = slabTitleColor;
        ctx.font = fontSans(16, 'bold');
        ctx.textAlign = 'left';
        ctx.fillText(floor.displayName, 55, currentY + 29);

        // Essential Badge
        if (floor.essentialCount > 0) {
          ctx.font = fontSans(16, 'bold');
          const nameWidth = ctx.measureText(floor.displayName).width;
          const essX = Math.min(svgWidth - 250, 55 + nameWidth + 20);
          drawRoundRect(ctx, essX, currentY + 11, 125, 24, 12);
          ctx.fillStyle = '#fee2e2';
          ctx.fill();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 0.8;
          ctx.stroke();

          ctx.fillStyle = '#b91c1c';
          ctx.font = fontSans(10, 'bold');
          ctx.textAlign = 'center';
          ctx.fillText(`⚡ ${floor.essentialCount} ${bfT.essential || 'Essential'}`, essX + 62.5, currentY + 27);
        }

        // Slab Totals on Right (No Total Load / Current)
        ctx.fillStyle = '#ffffff';
        ctx.font = fontSans(12, 'bold');
        ctx.textAlign = 'right';
        ctx.fillText(`${floor.nodes.length} ${bfT.components || 'items'}`, svgWidth - 55, currentY + 28);
      }

      currentY += 56;

      // Enclosure Bays
      if (floor.enclosures.length > 0) {
        ctx.fillStyle = '#475569';
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
          const sonCols = 2;
          const sonsRows = Math.ceil(maxSons / sonCols);
          const sonCardHeight = 96;
          const encHeight = 86 + (maxSons > 0 ? sonsRows * (sonCardHeight + 10) + 16 : 36);

          const renderEnclosureOnCanvas = (encItem: typeof enc1, boxX: number, boxWidth: number) => {
            if (!encItem) return;
            const board = encItem.board;
            const sons = encItem.localSons;
            const boardParentNumStr = board.parent?.componentNumber ? ` #${board.parent.componentNumber}` : '';
            const boardParentLoc = board.parent ? [board.parent.floor, board.parent.place || board.parent.office].filter(Boolean).join(', ') : '';
            const feederLine1 = board.parent
              ? `${bfT.parentFeeder || 'Feeder'}: ${board.parent.name}${boardParentNumStr}`
              : (bfT.independentSource || 'Main Grid Source');
            const feederLine2 = boardParentLoc ? `📍 ${boardParentLoc}` : '';

            // Enclosure main container
            drawRoundRect(ctx, boxX, currentY, boxWidth, encHeight, 10);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Enclosure header strip (height 86)
            drawRoundRect(ctx, boxX, currentY, boxWidth, 86, 10);
            ctx.fillStyle = '#f1f5f9';
            ctx.fill();
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 1;
            ctx.stroke();

            const boardBadges = getNodeExportBadges(board.node);
            const boardMeta = `${board.node.amps || 0}A • ${board.node.voltage || 400}V • ${board.node.kva || 0}kVA${board.place ? ` • 📍 ${safeText(board.place, 25)}` : ''}`;
            const boardVisual = getComponentTypeExportVisual(board.node.type);
            const boardNumStr = board.node.componentNumber ? ` #${board.node.componentNumber}` : '';
            const boardTitle = `${safeText(getNodeFullName(board.node), 55)}${boardNumStr}`;
            const boardTitleFontSize = boardTitle.length > 35 ? 11 : (boardTitle.length > 25 ? 12 : 13);

            if (isRTL) {
              // --- RTL Enclosure Header ---
              // Feeder Tag on the LEFT
              if (feederLine2) {
                drawRoundRect(ctx, boxX + 14, currentY + 12, 195, 34, 6);
                ctx.fillStyle = '#fef3c7';
                ctx.fill();
                ctx.strokeStyle = '#fde68a';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.fillStyle = '#b45309';
                ctx.font = fontSans(9, '600');
                ctx.textAlign = 'center';
                ctx.fillText(safeText(feederLine1, 26), boxX + 14 + 97.5, currentY + 24);

                ctx.fillStyle = '#92400e';
                ctx.font = fontSans(8.5, '500');
                ctx.textAlign = 'center';
                ctx.fillText(safeText(feederLine2, 28), boxX + 14 + 97.5, currentY + 39);
              } else {
                drawRoundRect(ctx, boxX + 14, currentY + 14, 180, 28, 6);
                ctx.fillStyle = '#fef3c7';
                ctx.fill();
                ctx.strokeStyle = '#fde68a';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.fillStyle = '#b45309';
                ctx.font = fontSans(9.5, '600');
                ctx.textAlign = 'center';
                ctx.fillText(safeText(feederLine1, 30), boxX + 14 + 90, currentY + 32);
              }

              // Component type visual icon box on the RIGHT
              drawRoundRect(ctx, boxX + boxWidth - 38, currentY + 14, 26, 26, 6);
              ctx.fillStyle = boardVisual.bg;
              ctx.fill();
              ctx.strokeStyle = boardVisual.border;
              ctx.lineWidth = 1;
              ctx.stroke();

              ctx.fillStyle = boardVisual.color;
              ctx.font = fontSans(12, 'bold');
              ctx.textAlign = 'center';
              ctx.fillText(boardVisual.symbol, boxX + boxWidth - 25, currentY + 31);

              // Board Name on the RIGHT
              ctx.fillStyle = '#0f172a';
              ctx.font = fontSans(boardTitleFontSize, 'bold');
              ctx.textAlign = 'right';
              ctx.fillText(boardTitle, boxX + boxWidth - 48, currentY + 25);

              // Board Meta Specs on the RIGHT
              ctx.fillStyle = '#64748b';
              ctx.font = fontSans(10, 'normal');
              ctx.textAlign = 'right';
              ctx.fillText(boardMeta, boxX + boxWidth - 48, currentY + 44);

              // Board Badges on the RIGHT (wrapped, up to 2 rows)
              if (boardBadges.length > 0) {
                drawBadgePillsOnCanvas(ctx, boardBadges, boxX + boxWidth - 48, currentY + 54, boxWidth - 250, true, 2);
              }
            } else {
              // --- LTR Enclosure Header ---
              // Component type visual icon box on the LEFT
              drawRoundRect(ctx, boxX + 12, currentY + 14, 26, 26, 6);
              ctx.fillStyle = boardVisual.bg;
              ctx.fill();
              ctx.strokeStyle = boardVisual.border;
              ctx.lineWidth = 1;
              ctx.stroke();

              ctx.fillStyle = boardVisual.color;
              ctx.font = fontSans(12, 'bold');
              ctx.textAlign = 'center';
              ctx.fillText(boardVisual.symbol, boxX + 25, currentY + 31);

              // Board Name & Details
              ctx.fillStyle = '#0f172a';
              ctx.font = fontSans(boardTitleFontSize, 'bold');
              ctx.textAlign = 'left';
              ctx.fillText(boardTitle, boxX + 46, currentY + 25);

              // Board Meta Specs
              ctx.fillStyle = '#64748b';
              ctx.font = fontSans(10, 'normal');
              ctx.textAlign = 'left';
              ctx.fillText(boardMeta, boxX + 46, currentY + 44);

              // Board Badges on the LEFT
              if (boardBadges.length > 0) {
                drawBadgePillsOnCanvas(ctx, boardBadges, boxX + 46, currentY + 54, boxWidth - 250, false, 2);
              }

              // Feeder Tag on the RIGHT
              if (feederLine2) {
                drawRoundRect(ctx, boxX + boxWidth - 209, currentY + 12, 195, 34, 6);
                ctx.fillStyle = '#fef3c7';
                ctx.fill();
                ctx.strokeStyle = '#fde68a';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.fillStyle = '#b45309';
                ctx.font = fontSans(9, '600');
                ctx.textAlign = 'center';
                ctx.fillText(safeText(feederLine1, 26), boxX + boxWidth - 209 + 97.5, currentY + 24);

                ctx.fillStyle = '#92400e';
                ctx.font = fontSans(8.5, '500');
                ctx.textAlign = 'center';
                ctx.fillText(safeText(feederLine2, 28), boxX + boxWidth - 209 + 97.5, currentY + 39);
              } else {
                drawRoundRect(ctx, boxX + boxWidth - 194, currentY + 14, 180, 28, 6);
                ctx.fillStyle = '#fef3c7';
                ctx.fill();
                ctx.strokeStyle = '#fde68a';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.fillStyle = '#b45309';
                ctx.font = fontSans(9.5, '600');
                ctx.textAlign = 'center';
                ctx.fillText(safeText(feederLine1, 30), boxX + boxWidth - 194 + 90, currentY + 32);
              }
            }

            // Sons Grid (2 columns)
            if (sons.length > 0) {
              sons.forEach((sonItem, sIdx) => {
                const sRow = Math.floor(sIdx / 2);
                const sWidth = Math.floor((boxWidth - 28) / 2);
                const sCol = isRTL ? (1 - (sIdx % 2)) : (sIdx % 2);
                const sX = boxX + 10 + sCol * (sWidth + 8);
                const sY = currentY + 86 + 10 + sRow * (sonCardHeight + 10);
                const sonBadges = getNodeExportBadges(sonItem.node);
                const sonVisual = getComponentTypeExportVisual(sonItem.node.type);
                const sonNumStr = sonItem.node.componentNumber ? ` #${sonItem.node.componentNumber}` : '';
                const sonTitle = `${safeText(getNodeFullName(sonItem.node), 45)}${sonNumStr}`;
                const sonTitleFont = sonTitle.length > 28 ? fontSans(9.5, 'bold') : fontSans(10.5, 'bold');
                const sonMeta = `${sonItem.node.amps || 0}A • ${sonItem.node.kva || 0}kVA${sonItem.place ? ` • 📍 ${safeText(sonItem.place, 18)}` : ''}`;
                const sonParentNumStr = sonItem.parent?.componentNumber ? ` #${sonItem.parent.componentNumber}` : '';
                const sonParentLoc = sonItem.parent ? [sonItem.parent.floor, sonItem.parent.place || sonItem.parent.office].filter(Boolean).join(', ') : '';
                const sonParentText = sonItem.parent
                  ? `⚡ ${bfT.parentFeeder || 'Feed'}: ${safeText(sonItem.parent.name, 18)}${sonParentNumStr}${sonParentLoc ? ` • 📍${safeText(sonParentLoc, 14)}` : ''}`
                  : `⚡ ${bfT.independentSource || 'Main Grid'}`;

                drawRoundRect(ctx, sX, sY, sWidth, sonCardHeight, 6);
                ctx.fillStyle = '#f8fafc';
                ctx.fill();
                ctx.strokeStyle = '#e2e8f0';
                ctx.lineWidth = 1;
                ctx.stroke();

                if (isRTL) {
                  // RTL Son Card
                  // Icon box on the RIGHT
                  drawRoundRect(ctx, sX + sWidth - 30, sY + 8, 22, 22, 4);
                  ctx.fillStyle = sonVisual.bg;
                  ctx.fill();
                  ctx.strokeStyle = sonVisual.border;
                  ctx.lineWidth = 0.8;
                  ctx.stroke();

                  ctx.fillStyle = sonVisual.color;
                  ctx.font = fontSans(10, 'bold');
                  ctx.textAlign = 'center';
                  ctx.fillText(sonVisual.symbol, sX + sWidth - 19, sY + 23);

                  // Name & Component Number on the RIGHT
                  ctx.fillStyle = '#0f172a';
                  ctx.font = sonTitleFont;
                  ctx.textAlign = 'right';
                  ctx.fillText(sonTitle, sX + sWidth - 38, sY + 23);

                  // Specs & Location (Tier 2) on the RIGHT
                  ctx.fillStyle = '#0284c7';
                  ctx.font = fontSans(9, '600');
                  ctx.textAlign = 'right';
                  ctx.fillText(sonMeta, sX + sWidth - 10, sY + 37);

                  // Power Source / Father on the RIGHT
                  ctx.fillStyle = '#b45309';
                  ctx.font = fontSans(8.5, '600');
                  ctx.textAlign = 'right';
                  ctx.fillText(safeText(sonParentText, 40), sX + sWidth - 10, sY + 51);

                  // Badges Row (Tier 3, wrapped up to 2 rows)
                  drawBadgePillsOnCanvas(ctx, sonBadges, sX + sWidth - 10, sY + 60, sWidth - 20, true, 2);
                } else {
                  // LTR Son Card
                  // Icon box on the LEFT
                  drawRoundRect(ctx, sX + 8, sY + 8, 22, 22, 4);
                  ctx.fillStyle = sonVisual.bg;
                  ctx.fill();
                  ctx.strokeStyle = sonVisual.border;
                  ctx.lineWidth = 0.8;
                  ctx.stroke();

                  ctx.fillStyle = sonVisual.color;
                  ctx.font = fontSans(10, 'bold');
                  ctx.textAlign = 'center';
                  ctx.fillText(sonVisual.symbol, sX + 19, sY + 23);

                  // Name & Component Number on the LEFT
                  ctx.fillStyle = '#0f172a';
                  ctx.font = sonTitleFont;
                  ctx.textAlign = 'left';
                  ctx.fillText(sonTitle, sX + 38, sY + 23);

                  // Specs & Location on the LEFT
                  ctx.fillStyle = '#0284c7';
                  ctx.font = fontSans(9, '600');
                  ctx.textAlign = 'left';
                  ctx.fillText(sonMeta, sX + 10, sY + 37);

                  // Power Source / Father on the LEFT
                  ctx.fillStyle = '#b45309';
                  ctx.font = fontSans(8.5, '600');
                  ctx.textAlign = 'left';
                  ctx.fillText(safeText(sonParentText, 40), sX + 10, sY + 51);

                  // Badges Row
                  drawBadgePillsOnCanvas(ctx, sonBadges, sX + 10, sY + 60, sWidth - 20, false, 2);
                }
              });
            } else {
              ctx.fillStyle = '#94a3b8';
              ctx.font = fontSans(11, 'italic');
              if (isRTL) {
                ctx.textAlign = 'right';
                ctx.fillText(bfT.noDownstreamBranches || (language === 'ar' ? 'لوحة توزيع — الدوائر الفرعية في لوحات فرعية' : (language === 'he' ? 'לוח חלוקה — מעגלים משניים בלוחות משנה' : 'Distribution board — branch circuits in sub-panels')), boxX + boxWidth - 20, currentY + 110);
              } else {
                ctx.textAlign = 'left';
                ctx.fillText(bfT.noDownstreamBranches || 'Distribution board — branch circuits in sub-panels', boxX + 20, currentY + 110);
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
          currentY += encHeight + 16;
        }
      }

      // Standalone Equipment & Loads (3 columns)
      if (floor.standaloneNodes.length > 0) {
        ctx.fillStyle = '#475569';
        ctx.font = fontSans(11, 'bold');
        if (isRTL) {
          ctx.textAlign = 'right';
          ctx.fillText(`⚡ ${bfT.individualDevices || 'Equipment & Loads'} (${floor.standaloneNodes.length})`, svgWidth - 44, currentY + 14);
        } else {
          ctx.textAlign = 'left';
          ctx.fillText(`⚡ ${bfT.individualDevices || 'Equipment & Loads'} (${floor.standaloneNodes.length})`, 44, currentY + 14);
        }
        currentY += 24;

        const devCols = 3;
        const devCardWidth = Math.floor((svgWidth - 80 - (devCols - 1) * 12) / devCols);
        const devCardHeight = 96;
        const devRows = Math.ceil(floor.standaloneNodes.length / devCols);

        floor.standaloneNodes.forEach((it, sIdx) => {
          const colInRow = sIdx % devCols;
          const sCol = isRTL ? (devCols - 1 - colInRow) : colInRow;
          const sRow = Math.floor(sIdx / devCols);
          const cardX = 40 + sCol * (devCardWidth + 12);
          const cardY = currentY + sRow * (devCardHeight + 12);
          const isDist = it.node.type === ComponentType.DISTRIBUTION_BOARD;
          const devBadges = getNodeExportBadges(it.node);
          const devVisual = getComponentTypeExportVisual(it.node.type);
          const devNumStr = it.node.componentNumber ? ` #${it.node.componentNumber}` : '';
          const devTitle = `${safeText(getNodeFullName(it.node), 55)}${devNumStr}`;
          const devTitleFont = devTitle.length > 35 ? fontSans(10, 'bold') : fontSans(11.5, 'bold');
          const devParentNumStr = it.parent?.componentNumber ? ` #${it.parent.componentNumber}` : '';
          const devParentLoc = it.parent ? [it.parent.floor, it.parent.place || it.parent.office].filter(Boolean).join(', ') : '';
          const devParentText = it.parent
            ? `⚡ ${bfT.parentFeeder || 'Feed'}: ${safeText(it.parent.name, 22)}${devParentNumStr}${devParentLoc ? ` • 📍${safeText(devParentLoc, 18)}` : ''}`
            : `⚡ ${bfT.independentSource || 'Main Grid'}`;
          const devSpecs = `${t.componentTypes[it.node.type] || it.node.type} • ${it.node.amps || 0}A • ${it.node.kva || 0}kVA${it.place ? ` • 📍 ${safeText(it.place, 18)}` : ''}`;

          drawRoundRect(ctx, cardX, cardY, devCardWidth, devCardHeight, 6);
          ctx.fillStyle = isDist ? '#f0fdf4' : '#ffffff';
          ctx.fill();
          ctx.strokeStyle = isDist ? '#86efac' : '#e2e8f0';
          ctx.lineWidth = 1;
          ctx.stroke();

          if (isRTL) {
            // RTL Standalone Equipment Card
            // Visual Icon Box on the RIGHT
            drawRoundRect(ctx, cardX + devCardWidth - 32, cardY + 8, 24, 24, 4);
            ctx.fillStyle = devVisual.bg;
            ctx.fill();
            ctx.strokeStyle = devVisual.border;
            ctx.lineWidth = 0.8;
            ctx.stroke();

            ctx.fillStyle = devVisual.color;
            ctx.font = fontSans(11, 'bold');
            ctx.textAlign = 'center';
            ctx.fillText(devVisual.symbol, cardX + devCardWidth - 20, cardY + 24);

            // Name on the RIGHT
            ctx.fillStyle = '#0f172a';
            ctx.font = devTitleFont;
            ctx.textAlign = 'right';
            ctx.fillText(devTitle, cardX + devCardWidth - 40, cardY + 24);

            // Subtitle 1 (Type • Specs • Location) on the RIGHT
            ctx.fillStyle = '#475569';
            ctx.font = fontSans(9.5, 'normal');
            ctx.textAlign = 'right';
            ctx.fillText(devSpecs, cardX + devCardWidth - 10, cardY + 39);

            // Subtitle 2: Power Source (the father) on the RIGHT
            ctx.fillStyle = '#b45309';
            ctx.font = fontSans(8.5, '600');
            ctx.textAlign = 'right';
            ctx.fillText(safeText(devParentText, 45), cardX + devCardWidth - 10, cardY + 53);

            // Badges Row (wrapped up to 2 rows)
            drawBadgePillsOnCanvas(ctx, devBadges, cardX + devCardWidth - 10, cardY + 62, devCardWidth - 20, true, 2);
          } else {
            // LTR Standalone Equipment Card
            // Visual Icon Box on the LEFT
            drawRoundRect(ctx, cardX + 8, cardY + 8, 24, 24, 4);
            ctx.fillStyle = devVisual.bg;
            ctx.fill();
            ctx.strokeStyle = devVisual.border;
            ctx.lineWidth = 0.8;
            ctx.stroke();

            ctx.fillStyle = devVisual.color;
            ctx.font = fontSans(11, 'bold');
            ctx.textAlign = 'center';
            ctx.fillText(devVisual.symbol, cardX + 20, cardY + 24);

            // Name on the LEFT
            ctx.fillStyle = '#0f172a';
            ctx.font = devTitleFont;
            ctx.textAlign = 'left';
            ctx.fillText(devTitle, cardX + 40, cardY + 24);

            // Subtitle 1 (Type • Specs • Location) on the LEFT
            ctx.fillStyle = '#475569';
            ctx.font = fontSans(9.5, 'normal');
            ctx.textAlign = 'left';
            ctx.fillText(devSpecs, cardX + 10, cardY + 39);

            // Subtitle 2: Power Source (the father) on the LEFT
            ctx.fillStyle = '#b45309';
            ctx.font = fontSans(8.5, '600');
            ctx.textAlign = 'left';
            ctx.fillText(safeText(devParentText, 45), cardX + 10, cardY + 53);

            // Badges Row
            drawBadgePillsOnCanvas(ctx, devBadges, cardX + 10, cardY + 62, devCardWidth - 20, false, 2);
          }
        });
        currentY += devRows * (devCardHeight + 12) + 16;
      }

      currentY += 24;
    });

    // 3.5. Badges Legend Bar
    drawRoundRect(ctx, 40, currentY, svgWidth - 80, 32, 6);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.stroke();

    const sampleBadges: ExportBadgeInfo[] = [
      { key: 'm', label: t.legend?.meter || 'Meter', icon: '⚡M', bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' },
      { key: 'mm', label: t.legend?.multimeter || 'Multimeter', icon: '📊', bg: '#faf5ff', text: '#7c3aed', border: '#ddd6fe' },
      { key: 'gen', label: t.legend?.generator || 'Generator', icon: '⚡G', bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
      { key: 'ats', label: t.legend?.transferSwitch || 'ATS', icon: '⇄', bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
      { key: 'ess', label: t.legend?.essential || 'Emergency', icon: '★', bg: '#fef2f2', text: '#e11d48', border: '#fecdd3' },
      { key: 'ac', label: t.legend?.ac || 'AC', icon: '❄', bg: '#ecfeff', text: '#0891b2', border: '#a5f3fc' },
      { key: 'acb', label: t.legend?.airBreaker || 'ACB', icon: '💨', bg: '#f0f9ff', text: '#0284c7', border: '#bae6fd' },
      { key: 'res', label: t.legend?.reserved || 'Reserved', icon: '🔒', bg: '#fefce8', text: '#ca8a04', border: '#fef08a' },
      { key: 'pub', label: t.legend?.publicBoard || 'Public', icon: '👥', bg: '#f0fdfa', text: '#0d9488', border: '#99f6e4' },
      { key: 'unm', label: t.legend?.noMeter || 'Unmetered', icon: '⊘', bg: '#f8fafc', text: '#64748b', border: '#cbd5e1' }
    ];
    drawBadgePillsOnCanvas(ctx, sampleBadges, isRTL ? svgWidth - 50 : 50, currentY + 8, svgWidth - 100, isRTL);
    currentY += 42;

    // 4. Final Sheet Footer
    drawRoundRect(ctx, 40, currentY, svgWidth - 80, 32, 6);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (isRTL) {
      ctx.fillStyle = '#64748b';
      ctx.font = fontSans(10, 'normal');
      ctx.textAlign = 'right';
      ctx.fillText(bfT.drawingFooterTitle || 'SmartSchema CAD System • Architectural Floor Elevation & Physical Distribution Drawing', svgWidth - 60, currentY + 20);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(bfT.drawingFooterSubtitle || 'Clean Physical Layout (No Inter-Connecting Lines)', 60, currentY + 20);
    } else {
      ctx.fillStyle = '#64748b';
      ctx.font = fontSans(10, 'normal');
      ctx.textAlign = 'left';
      ctx.fillText(bfT.drawingFooterTitle || 'SmartSchema CAD System • Architectural Floor Elevation & Physical Distribution Drawing', 60, currentY + 20);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(bfT.drawingFooterSubtitle || 'Clean Physical Layout (No Inter-Connecting Lines)', svgWidth - 60, currentY + 20);
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
    <rect width="${svgWidth - 80}" height="${headerHeight}" rx="12" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" />
    
    <!-- Stats Card on Left -->
    <rect x="${statsX - 40}" y="16" width="${statsWidth}" height="66" rx="8" fill="#ffffff" stroke="#e2e8f0" stroke-width="1" />
    <text x="${statsX - 40 + statsWidth - 20}" y="38" fill="#0284c7" font-size="13" font-weight="bold" text-anchor="end">${buildingTotals.nodes} ${escapeXml(bfT.components || 'items')}</text>
    <text x="${statsX - 40 + statsWidth - 20}" y="56" fill="#64748b" font-size="10" text-anchor="end">${escapeXml(bfT.totalComponents || 'Equipment')}</text>
    
    <text x="${statsX - 40 + statsWidth - 130}" y="38" fill="#d97706" font-size="13" font-weight="bold" text-anchor="end">${buildingTotals.boards}</text>
    <text x="${statsX - 40 + statsWidth - 130}" y="56" fill="#64748b" font-size="10" text-anchor="end">${escapeXml(bfT.boards || 'Panels')}</text>
    
    <text x="${statsX - 40 + statsWidth - 235}" y="38" fill="#059669" font-size="13" font-weight="bold" text-anchor="end">${floorGroups.length}</text>
    <text x="${statsX - 40 + statsWidth - 235}" y="56" fill="#64748b" font-size="10" text-anchor="end">${escapeXml(bfT.levels || 'Levels')}</text>
    
    <text x="${statsX - 40 + statsWidth - 20}" y="74" fill="#94a3b8" font-size="9" text-anchor="end">${escapeXml(pageDateStr)}</text>

    <!-- Icon & Title on Right -->
    <circle cx="${iconCenterX - 40}" cy="38" r="18" fill="#f59e0b" opacity="0.15" />
    <rect x="${iconCenterX - 40 - 9}" y="29" width="18" height="18" fill="none" stroke="#d97706" stroke-width="1.8" />
    <rect x="${iconCenterX - 40 - 5}" y="33" width="3" height="3" fill="#d97706" />
    <rect x="${iconCenterX - 40 + 2}" y="33" width="3" height="3" fill="#d97706" />
    <rect x="${iconCenterX - 40 - 5}" y="39" width="3" height="3" fill="#d97706" />
    <rect x="${iconCenterX - 40 + 2}" y="39" width="3" height="3" fill="#d97706" />
    
    <text x="${svgWidth - 140}" y="38" fill="#0f172a" font-size="20" font-weight="bold" text-anchor="end">${escapeXml(activeProject.name)} — ${escapeXml(bfT.title || 'Building & Floor Distribution')}</text>
    <text x="${svgWidth - 140}" y="62" fill="#64748b" font-size="12" text-anchor="end">${escapeXml(bfT.noLinesNote || 'Physical layout: Feeder connections grouped by panel bay without lines')}</text>
    <text x="${svgWidth - 140}" y="84" fill="#0284c7" font-size="11" font-weight="600" text-anchor="end">${escapeXml(buildingStr)}</text>
  </g>
`;
    } else {
      svgElements += `
  <g transform="translate(40, ${currentY})">
    <rect width="${svgWidth - 80}" height="${headerHeight}" rx="12" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" />
    <circle cx="36" cy="38" r="18" fill="#f59e0b" opacity="0.15" />
    <rect x="27" y="29" width="18" height="18" fill="none" stroke="#d97706" stroke-width="1.8" />
    <rect x="31" y="33" width="3" height="3" fill="#d97706" />
    <rect x="38" y="33" width="3" height="3" fill="#d97706" />
    <rect x="31" y="39" width="3" height="3" fill="#d97706" />
    <rect x="38" y="39" width="3" height="3" fill="#d97706" />
    
    <text x="68" y="38" fill="#0f172a" font-size="20" font-weight="bold">${escapeXml(activeProject.name)} — ${escapeXml(bfT.title || 'Building & Floor Distribution')}</text>
    <text x="68" y="62" fill="#64748b" font-size="12">${escapeXml(bfT.noLinesNote || 'Physical layout: Feeder connections grouped by panel bay without lines')}</text>
    <text x="68" y="84" fill="#0284c7" font-size="11" font-weight="600">${escapeXml(buildingStr)}</text>
    
    <rect x="${svgWidth - 460}" y="16" width="365" height="66" rx="8" fill="#ffffff" stroke="#e2e8f0" stroke-width="1" />
    <text x="${svgWidth - 440}" y="38" fill="#0284c7" font-size="13" font-weight="bold">${buildingTotals.nodes} ${escapeXml(bfT.components || 'items')}</text>
    <text x="${svgWidth - 440}" y="56" fill="#64748b" font-size="10">${escapeXml(bfT.totalComponents || 'Equipment')}</text>
    
    <text x="${svgWidth - 340}" y="38" fill="#d97706" font-size="13" font-weight="bold">${buildingTotals.boards}</text>
    <text x="${svgWidth - 340}" y="56" fill="#64748b" font-size="10">${escapeXml(bfT.boards || 'Panels')}</text>
    
    <text x="${svgWidth - 245}" y="38" fill="#059669" font-size="13" font-weight="bold">${floorGroups.length}</text>
    <text x="${svgWidth - 245}" y="56" fill="#64748b" font-size="10">${escapeXml(bfT.levels || 'Levels')}</text>
    
    <text x="${svgWidth - 440}" y="74" fill="#94a3b8" font-size="9">${escapeXml(pageDateStr)}</text>
  </g>
`;
    }
    currentY += headerHeight + 25;

    floorsToRender.forEach((floor) => {
      const isUnassigned = floor.isUnassigned;
      const slabFill = isUnassigned ? '#c2410c' : '#0284c7';
      const slabStroke = isUnassigned ? '#9a3412' : '#0369a1';
      const slabTitleColor = '#ffffff';

      if (isRTL) {
        svgElements += `
  <g transform="translate(40, ${currentY})">
    <rect width="${svgWidth - 80}" height="46" rx="8" fill="${slabFill}" stroke="${slabStroke}" stroke-width="1.2" />
    
    <!-- Floor Name on Right (No floor height) -->
    <text x="${svgWidth - 95}" y="29" fill="${slabTitleColor}" font-size="16" font-weight="bold" text-anchor="end">${escapeXml(floor.displayName)}</text>
    
    ${floor.essentialCount > 0 ? `
    <rect x="250" y="11" width="125" height="24" rx="12" fill="#fee2e2" stroke="#ef4444" stroke-width="0.8" />
    <text x="312.5" y="27" fill="#b91c1c" font-size="10" font-weight="bold" text-anchor="middle">⚡ ${floor.essentialCount} ${escapeXml(bfT.essential || 'Essential')}</text>
    ` : ''}

    <!-- Totals on Left -->
    <text x="15" y="28" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="start">${floor.nodes.length} ${escapeXml(bfT.components || 'items')}</text>
  </g>
`;
      } else {
        svgElements += `
  <g transform="translate(40, ${currentY})">
    <rect width="${svgWidth - 80}" height="46" rx="8" fill="${slabFill}" stroke="${slabStroke}" stroke-width="1.2" />
    
    <!-- Floor Name on Left (No floor height) -->
    <text x="25" y="29" fill="${slabTitleColor}" font-size="16" font-weight="bold">${escapeXml(floor.displayName)}</text>
    ${floor.essentialCount > 0 ? `
    <rect x="360" y="11" width="125" height="24" rx="12" fill="#fee2e2" stroke="#ef4444" stroke-width="0.8" />
    <text x="422" y="27" fill="#b91c1c" font-size="10" font-weight="bold" text-anchor="middle">⚡ ${floor.essentialCount} ${escapeXml(bfT.essential || 'Essential')}</text>
    ` : ''}

    <text x="${svgWidth - 105}" y="28" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="end">${floor.nodes.length} ${escapeXml(bfT.components || 'items')}</text>
  </g>
`;
      }
      currentY += 56;

      if (floor.enclosures.length > 0) {
        if (isRTL) {
          svgElements += `
  <g transform="translate(44, ${currentY})">
    <text x="${svgWidth - 88}" y="14" fill="#475569" font-size="11" font-weight="bold" text-anchor="end">📦 ${escapeXml(bfT.enclosureBay || 'Panel Enclosure & Downstream Feed')} (${floor.enclosures.length})</text>
  </g>
`;
        } else {
          svgElements += `
  <g transform="translate(44, ${currentY})">
    <rect x="0" y="2" width="14" height="14" rx="2" fill="none" stroke="#475569" stroke-width="1.4" />
    <line x1="0" y1="6" x2="14" y2="6" stroke="#475569" stroke-width="1" />
    <text x="22" y="14" fill="#475569" font-size="11" font-weight="bold">${escapeXml(bfT.enclosureBay || 'Panel Enclosure & Downstream Feed')} (${floor.enclosures.length})</text>
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
          const sonCols = 2;
          const sonsRows = Math.ceil(maxSons / sonCols);
          const sonCardHeight = 96;
          const encHeight = 86 + (maxSons > 0 ? sonsRows * (sonCardHeight + 10) + 16 : 36);

          const renderEnclosureBox = (encItem: typeof enc1, boxX: number, boxWidth: number) => {
            if (!encItem) return '';
            const board = encItem.board;
            const sons = encItem.localSons;
            const boardParentNumStr = board.parent?.componentNumber ? ` #${board.parent.componentNumber}` : '';
            const boardParentLoc = board.parent ? [board.parent.floor, board.parent.place || board.parent.office].filter(Boolean).join(', ') : '';
            const feederLine1 = board.parent
              ? `${bfT.parentFeeder || 'Feeder'}: ${board.parent.name}${boardParentNumStr}`
              : (bfT.independentSource || 'Main Grid Source');
            const feederLine2 = boardParentLoc ? `📍 ${boardParentLoc}` : '';
            const boardBadges = getNodeExportBadges(board.node);
            const boardMeta = `${board.node.amps || 0}A • ${board.node.voltage || 400}V • ${board.node.kva || 0}kVA${board.place ? ` • 📍 ${escapeXml(safeText(board.place, 25))}` : ''}`;
            const boardVisual = getComponentTypeExportVisual(board.node.type);
            const boardNumStr = board.node.componentNumber ? ` #${board.node.componentNumber}` : '';
            const boardTitle = `${escapeXml(safeText(getNodeFullName(board.node), 55))}${boardNumStr}`;
            const boardTitleFontSize = boardTitle.length > 35 ? 11 : (boardTitle.length > 25 ? 12 : 13);

            let encSvg = `
    <g transform="translate(${boxX}, ${currentY})">
      <rect width="${boxWidth}" height="${encHeight}" rx="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.2" />
      <rect width="${boxWidth}" height="86" rx="10" fill="#f1f5f9" stroke="#e2e8f0" stroke-width="1" />
`;

            if (isRTL) {
              encSvg += `
      <!-- RTL Enclosure Header -->
      ${feederLine2 ? `
      <rect x="14" y="12" width="195" height="34" rx="6" fill="#fef3c7" stroke="#fde68a" stroke-width="1" />
      <text x="111.5" y="24" fill="#b45309" font-size="9" font-weight="600" text-anchor="middle">${escapeXml(safeText(feederLine1, 26))}</text>
      <text x="111.5" y="39" fill="#92400e" font-size="8.5" font-weight="500" text-anchor="middle">${escapeXml(safeText(feederLine2, 28))}</text>
      ` : `
      <rect x="14" y="14" width="180" height="28" rx="6" fill="#fef3c7" stroke="#fde68a" stroke-width="1" />
      <text x="104" y="32" fill="#b45309" font-size="9.5" font-weight="600" text-anchor="middle">${escapeXml(safeText(feederLine1, 30))}</text>
      `}
      
      <rect x="${boxWidth - 38}" y="14" width="26" height="26" rx="6" fill="${boardVisual.bg}" stroke="${boardVisual.border}" stroke-width="1" />
      <text x="${boxWidth - 25}" y="31" fill="${boardVisual.color}" font-size="12" font-weight="bold" text-anchor="middle">${boardVisual.symbol}</text>
      
      <text x="${boxWidth - 48}" y="25" fill="#0f172a" font-size="${boardTitleFontSize}" font-weight="bold" text-anchor="end">${boardTitle}</text>
      <text x="${boxWidth - 48}" y="44" fill="#64748b" font-size="10" text-anchor="end">${boardMeta}</text>
      ${boardBadges.length > 0 ? renderSvgBadgePills(boardBadges, boxWidth - 48, 54, boxWidth - 250, true, 2) : ''}
`;
            } else {
              encSvg += `
      <!-- LTR Enclosure Header -->
      <rect x="12" y="14" width="26" height="26" rx="6" fill="${boardVisual.bg}" stroke="${boardVisual.border}" stroke-width="1" />
      <text x="25" y="31" fill="${boardVisual.color}" font-size="12" font-weight="bold" text-anchor="middle">${boardVisual.symbol}</text>
      
      <text x="46" y="25" fill="#0f172a" font-size="${boardTitleFontSize}" font-weight="bold">${boardTitle}</text>
      <text x="46" y="44" fill="#64748b" font-size="10">${boardMeta}</text>
      ${boardBadges.length > 0 ? renderSvgBadgePills(boardBadges, 46, 54, boxWidth - 250, false, 2) : ''}
      
      ${feederLine2 ? `
      <rect x="${boxWidth - 209}" y="12" width="195" height="34" rx="6" fill="#fef3c7" stroke="#fde68a" stroke-width="1" />
      <text x="${boxWidth - 111.5}" y="24" fill="#b45309" font-size="9" font-weight="600" text-anchor="middle">${escapeXml(safeText(feederLine1, 26))}</text>
      <text x="${boxWidth - 111.5}" y="39" fill="#92400e" font-size="8.5" font-weight="500" text-anchor="middle">${escapeXml(safeText(feederLine2, 28))}</text>
      ` : `
      <rect x="${boxWidth - 194}" y="14" width="180" height="28" rx="6" fill="#fef3c7" stroke="#fde68a" stroke-width="1" />
      <text x="${boxWidth - 104}" y="32" fill="#b45309" font-size="9.5" font-weight="600" text-anchor="middle">${escapeXml(safeText(feederLine1, 30))}</text>
      `}
`;
            }

            if (sons.length > 0) {
              sons.forEach((sonItem, sIdx) => {
                const sRow = Math.floor(sIdx / 2);
                const sWidth = Math.floor((boxWidth - 28) / 2);
                const sCol = isRTL ? (1 - (sIdx % 2)) : (sIdx % 2);
                const sX = 10 + sCol * (sWidth + 8);
                const sY = 86 + 10 + sRow * (sonCardHeight + 10);
                const sonBadges = getNodeExportBadges(sonItem.node);
                const sonVisual = getComponentTypeExportVisual(sonItem.node.type);
                const sonNumStr = sonItem.node.componentNumber ? ` #${sonItem.node.componentNumber}` : '';
                const sonTitle = `${escapeXml(safeText(getNodeFullName(sonItem.node), 45))}${sonNumStr}`;
                const sonTitleFontSize = sonTitle.length > 28 ? 9.5 : 10.5;
                const sonMeta = `${sonItem.node.amps || 0}A • ${sonItem.node.kva || 0}kVA${sonItem.place ? ` • 📍 ${escapeXml(safeText(sonItem.place, 18))}` : ''}`;
                const sonParentNumStr = sonItem.parent?.componentNumber ? ` #${sonItem.parent.componentNumber}` : '';
                const sonParentLoc = sonItem.parent ? [sonItem.parent.floor, sonItem.parent.place || sonItem.parent.office].filter(Boolean).join(', ') : '';
                const sonParentText = sonItem.parent
                  ? `⚡ ${bfT.parentFeeder || 'Feed'}: ${safeText(sonItem.parent.name, 18)}${sonParentNumStr}${sonParentLoc ? ` • 📍${safeText(sonParentLoc, 14)}` : ''}`
                  : `⚡ ${bfT.independentSource || 'Main Grid'}`;

                if (isRTL) {
                  encSvg += `
      <rect x="${sX}" y="${sY}" width="${sWidth}" height="${sonCardHeight}" rx="6" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1" />
      <rect x="${sX + sWidth - 30}" y="${sY + 8}" width="22" height="22" rx="4" fill="${sonVisual.bg}" stroke="${sonVisual.border}" stroke-width="0.8" />
      <text x="${sX + sWidth - 19}" y="${sY + 23}" fill="${sonVisual.color}" font-size="10" font-weight="bold" text-anchor="middle">${sonVisual.symbol}</text>
      <text x="${sX + sWidth - 38}" y="${sY + 23}" fill="#0f172a" font-size="${sonTitleFontSize}" font-weight="bold" text-anchor="end">${sonTitle}</text>
      <text x="${sX + sWidth - 10}" y="${sY + 37}" fill="#0284c7" font-size="9" font-weight="600" text-anchor="end">${sonMeta}</text>
      <text x="${sX + sWidth - 10}" y="${sY + 51}" fill="#b45309" font-size="8.5" font-weight="600" text-anchor="end">${escapeXml(safeText(sonParentText, 40))}</text>
      ${renderSvgBadgePills(sonBadges, sX + sWidth - 10, sY + 60, sWidth - 20, true, 2)}
`;
                } else {
                  encSvg += `
      <rect x="${sX}" y="${sY}" width="${sWidth}" height="${sonCardHeight}" rx="6" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1" />
      <rect x="${sX + 8}" y="${sY + 8}" width="22" height="22" rx="4" fill="${sonVisual.bg}" stroke="${sonVisual.border}" stroke-width="0.8" />
      <text x="${sX + 19}" y="${sY + 23}" fill="${sonVisual.color}" font-size="10" font-weight="bold" text-anchor="middle">${sonVisual.symbol}</text>
      <text x="${sX + 38}" y="${sY + 23}" fill="#0f172a" font-size="${sonTitleFontSize}" font-weight="bold">${sonTitle}</text>
      <text x="${sX + 10}" y="${sY + 37}" fill="#0284c7" font-size="9" font-weight="600">${sonMeta}</text>
      <text x="${sX + 10}" y="${sY + 51}" fill="#b45309" font-size="8.5" font-weight="600">${escapeXml(safeText(sonParentText, 40))}</text>
      ${renderSvgBadgePills(sonBadges, sX + 10, sY + 60, sWidth - 20, false, 2)}
`;
                }
              });
            } else {
              encSvg += `
      <text x="${isRTL ? boxWidth - 20 : 20}" y="110" fill="#94a3b8" font-size="11" font-style="italic" text-anchor="${isRTL ? 'end' : 'start'}">${escapeXml(bfT.noDownstreamBranches || (language === 'ar' ? 'لوحة توزيع — الدوائر الفرعية في لوحات فرعية' : (language === 'he' ? 'לוח חלוקה — מעגלים משניים בלוחות משנה' : 'Distribution board — branch circuits in sub-panels')))}</text>
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
          currentY += encHeight + 16;
        }
      }

      if (floor.standaloneNodes.length > 0) {
        if (isRTL) {
          svgElements += `
  <g transform="translate(44, ${currentY})">
    <text x="${svgWidth - 88}" y="14" fill="#475569" font-size="11" font-weight="bold" text-anchor="end">⚡ ${escapeXml(bfT.individualDevices || 'Equipment & Loads')} (${floor.standaloneNodes.length})</text>
  </g>
`;
        } else {
          svgElements += `
  <g transform="translate(44, ${currentY})">
    <polygon points="6,2 2,8 5,8 4,14 10,7 7,7" fill="#475569" />
    <text x="18" y="14" fill="#475569" font-size="11" font-weight="bold">${escapeXml(bfT.individualDevices || 'Equipment & Loads')} (${floor.standaloneNodes.length})</text>
  </g>
`;
        }
        currentY += 24;

        const devCols = 3;
        const devCardWidth = Math.floor((svgWidth - 80 - (devCols - 1) * 12) / devCols);
        const devCardHeight = 96;
        const devRows = Math.ceil(floor.standaloneNodes.length / devCols);

        floor.standaloneNodes.forEach((it, sIdx) => {
          const colInRow = sIdx % devCols;
          const sCol = isRTL ? (devCols - 1 - colInRow) : colInRow;
          const sRow = Math.floor(sIdx / devCols);
          const cardX = 40 + sCol * (devCardWidth + 12);
          const cardY = currentY + sRow * (devCardHeight + 12);
          const isDist = it.node.type === ComponentType.DISTRIBUTION_BOARD;
          const cardBg = isDist ? '#f0fdf4' : '#ffffff';
          const cardStroke = isDist ? '#86efac' : '#e2e8f0';
          const devBadges = getNodeExportBadges(it.node);
          const devVisual = getComponentTypeExportVisual(it.node.type);
          const devNumStr = it.node.componentNumber ? ` #${it.node.componentNumber}` : '';
          const devTitle = `${escapeXml(safeText(getNodeFullName(it.node), 55))}${devNumStr}`;
          const devTitleFontSize = devTitle.length > 35 ? 10 : 11.5;
          const devParentNumStr = it.parent?.componentNumber ? ` #${it.parent.componentNumber}` : '';
          const devParentLoc = it.parent ? [it.parent.floor, it.parent.place || it.parent.office].filter(Boolean).join(', ') : '';
          const devParentText = it.parent
            ? `⚡ ${bfT.parentFeeder || 'Feed'}: ${safeText(it.parent.name, 22)}${devParentNumStr}${devParentLoc ? ` • 📍${safeText(devParentLoc, 18)}` : ''}`
            : `⚡ ${bfT.independentSource || 'Main Grid'}`;
          const devSpecs = `${escapeXml(t.componentTypes[it.node.type] || it.node.type)} • ${it.node.amps || 0}A • ${it.node.kva || 0}kVA${it.place ? ` • 📍 ${escapeXml(safeText(it.place, 18))}` : ''}`;

          if (isRTL) {
            svgElements += `
  <g transform="translate(${cardX}, ${cardY})">
    <rect width="${devCardWidth}" height="${devCardHeight}" rx="6" fill="${cardBg}" stroke="${cardStroke}" stroke-width="1" />
    <rect x="${devCardWidth - 32}" y="8" width="24" height="24" rx="4" fill="${devVisual.bg}" stroke="${devVisual.border}" stroke-width="0.8" />
    <text x="${devCardWidth - 20}" y="24" fill="${devVisual.color}" font-size="11" font-weight="bold" text-anchor="middle">${devVisual.symbol}</text>
    <text x="${devCardWidth - 40}" y="24" fill="#0f172a" font-size="${devTitleFontSize}" font-weight="bold" text-anchor="end">${devTitle}</text>
    <text x="${devCardWidth - 10}" y="39" fill="#475569" font-size="9.5" text-anchor="end">${devSpecs}</text>
    <text x="${devCardWidth - 10}" y="53" fill="#b45309" font-size="8.5" font-weight="600" text-anchor="end">${escapeXml(safeText(devParentText, 45))}</text>
    ${renderSvgBadgePills(devBadges, devCardWidth - 10, 62, devCardWidth - 20, true, 2)}
  </g>
`;
          } else {
            svgElements += `
  <g transform="translate(${cardX}, ${cardY})">
    <rect width="${devCardWidth}" height="${devCardHeight}" rx="6" fill="${cardBg}" stroke="${cardStroke}" stroke-width="1" />
    <rect x="8" y="8" width="24" height="24" rx="4" fill="${devVisual.bg}" stroke="${devVisual.border}" stroke-width="0.8" />
    <text x="20" y="24" fill="${devVisual.color}" font-size="11" font-weight="bold" text-anchor="middle">${devVisual.symbol}</text>
    <text x="40" y="24" fill="#0f172a" font-size="${devTitleFontSize}" font-weight="bold">${devTitle}</text>
    <text x="10" y="39" fill="#475569" font-size="9.5">${devSpecs}</text>
    <text x="10" y="53" fill="#b45309" font-size="8.5" font-weight="600">${escapeXml(safeText(devParentText, 45))}</text>
    ${renderSvgBadgePills(devBadges, 10, 62, devCardWidth - 20, false, 2)}
  </g>
`;
          }
        });
        currentY += devRows * (devCardHeight + 12) + 16;
      }

      currentY += 24;
    });

    const sampleBadges: ExportBadgeInfo[] = [
      { key: 'm', label: t.legend?.meter || 'Meter', icon: '⚡M', bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' },
      { key: 'mm', label: t.legend?.multimeter || 'Multimeter', icon: '📊', bg: '#faf5ff', text: '#7c3aed', border: '#ddd6fe' },
      { key: 'gen', label: t.legend?.generator || 'Generator', icon: '⚡G', bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
      { key: 'ats', label: t.legend?.transferSwitch || 'ATS', icon: '⇄', bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
      { key: 'ess', label: t.legend?.essential || 'Emergency', icon: '★', bg: '#fef2f2', text: '#e11d48', border: '#fecdd3' },
      { key: 'ac', label: t.legend?.ac || 'AC', icon: '❄', bg: '#ecfeff', text: '#0891b2', border: '#a5f3fc' },
      { key: 'acb', label: t.legend?.airBreaker || 'ACB', icon: '💨', bg: '#f0f9ff', text: '#0284c7', border: '#bae6fd' },
      { key: 'res', label: t.legend?.reserved || 'Reserved', icon: '🔒', bg: '#fefce8', text: '#ca8a04', border: '#fef08a' },
      { key: 'pub', label: t.legend?.publicBoard || 'Public', icon: '👥', bg: '#f0fdfa', text: '#0d9488', border: '#99f6e4' },
      { key: 'unm', label: t.legend?.noMeter || 'Unmetered', icon: '⊘', bg: '#f8fafc', text: '#64748b', border: '#cbd5e1' }
    ];

    svgElements += `
  <g transform="translate(40, ${currentY})">
    <rect width="${svgWidth - 80}" height="32" rx="6" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1" />
    ${renderSvgBadgePills(sampleBadges, isRTL ? svgWidth - 90 : 10, 8, svgWidth - 100, isRTL)}
  </g>
`;
    currentY += 42;

    svgElements += `
  <g transform="translate(40, ${currentY})">
    <rect width="${svgWidth - 80}" height="32" rx="6" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1" />
    <text x="${isRTL ? svgWidth - 100 : 20}" y="20" fill="#64748b" font-size="10" text-anchor="${isRTL ? 'end' : 'start'}">${escapeXml(bfT.drawingFooterTitle || 'SmartSchema CAD System • Architectural Floor Elevation & Physical Distribution Drawing')}</text>
    <text x="${isRTL ? 20 : svgWidth - 100}" y="20" fill="#94a3b8" font-size="10" text-anchor="${isRTL ? 'start' : 'end'}">${escapeXml(bfT.drawingFooterSubtitle || 'Clean Physical Layout (No Inter-Connecting Lines)')}</text>
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
  <rect width="${svgWidth}" height="${totalHeight}" fill="#ffffff" />
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
      const exportRows = filteredNodes.map((item, idx) => {
        const badges = getNodeExportBadges(item.node).map(b => `${b.icon} ${b.label}`).join(', ');
        return {
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
          'Meter': item.node.hasMeter ? (item.node.meterNumber || item.node.meterModel || 'YES') : 'NO',
          'Multimeter': item.node.hasMultimeter ? (item.node.multimeterNumber || item.node.multimeterModel || 'YES') : 'NO',
          'Badges & Icons': badges || '-',
          'Essential': item.node.isEssential ? 'YES' : 'NO',
          'Source Page': item.pageName,
          'Source Project': item.projectName
        };
      });

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
        {/* Top Header Bar (Light Blue in light mode / Elegant Navy Blue in dark mode) */}
        <div
          className={`px-5 py-3.5 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 ${
            theme === 'dark'
              ? 'bg-gradient-to-r from-blue-950/90 via-slate-900 to-slate-900 border-blue-900/50 text-slate-100'
              : 'bg-gradient-to-r from-blue-50 via-sky-50 to-blue-100/60 border-blue-200 text-slate-900 shadow-sm'
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
                <span className={`text-[11px] px-2 py-0.5 rounded-full border hidden sm:inline-flex items-center gap-1 ${
                  theme === 'dark' ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-white text-slate-700 border-slate-200 shadow-2xs'
                }`}>
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
            <div className={`p-1 rounded-xl border flex items-center text-xs ${
              theme === 'dark' ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                onClick={() => setScanScope('active_project')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  scanScope === 'active_project'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
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
                    : theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
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
                    : theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Scan across all projects"
              >
                {t.projects || 'All Projects'}
              </button>
            </div>

            {/* Building Selector */}
            {availableBuildings.length > 0 && (
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs ${
                theme === 'dark' ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-200'
              }`}>
                <span className="material-icons-round text-sm text-amber-400">domain</span>
                <select
                  value={selectedBuilding}
                  onChange={(e) => setSelectedBuilding(e.target.value)}
                  className={`bg-transparent font-medium focus:outline-none cursor-pointer text-xs ${
                    theme === 'dark' ? 'text-slate-200' : 'text-slate-800'
                  }`}
                >
                  <option value="ALL" className={theme === 'dark' ? 'bg-slate-900 text-slate-200' : 'bg-white text-slate-800'}>{bfT.allBuildings || 'All Buildings'}</option>
                  {availableBuildings.map(bld => (
                    <option key={bld} value={bld} className={theme === 'dark' ? 'bg-slate-900 text-slate-200' : 'bg-white text-slate-800'}>{bld}</option>
                  ))}
                  <option value="__unassigned__" className={theme === 'dark' ? 'bg-slate-900 text-slate-200' : 'bg-white text-slate-800'}>{bfT.unassignedBuilding || 'Main / Unassigned'}</option>
                </select>
              </div>
            )}

            {/* Export SVG */}
            <button
              onClick={handleExportSVG}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                theme === 'dark'
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-200 shadow-2xs'
              }`}
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
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                theme === 'dark'
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-200 shadow-2xs'
              }`}
              title={bfT.printPdf || 'Print'}
            >
              <span className="material-icons-round text-sm text-slate-400">print</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className={`p-1.5 rounded-xl transition-colors ${
                theme === 'dark'
                  ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
                  : 'hover:bg-slate-200 text-slate-600 hover:text-slate-900'
              }`}
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
              className={`w-full border rounded-xl py-1.5 ${isRTL ? 'pr-9 pl-8 text-right' : 'pl-9 pr-8 text-left'} text-xs focus:outline-none focus:border-amber-500 transition-all ${
                theme === 'dark'
                  ? 'bg-slate-800/90 border-slate-700 text-white placeholder-slate-500'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
              }`}
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
              className={`rounded-xl px-2.5 py-1.5 text-xs focus:outline-none cursor-pointer border ${
                theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
              }`}
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
                  : theme === 'dark'
                    ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                    : 'bg-white border-slate-300 text-slate-600 hover:text-slate-900 shadow-2xs'
              }`}
            >
              <span className="material-icons-round text-sm">bolt</span>
              <span>{bfT.filterByEssential || 'Essential Only'}</span>
            </button>

            {/* Clean Physical Layout Notice */}
            <div className={`hidden lg:flex items-center gap-1.5 text-[11px] px-3 py-1 rounded-xl border ${
              theme === 'dark' ? 'text-slate-400 bg-slate-800/60 border-slate-700/60' : 'text-slate-600 bg-slate-100 border-slate-200'
            }`}>
              <span className="material-icons-round text-xs text-amber-400">clean_hands</span>
              <span>{bfT.noLinesNote || 'Feeder connections grouped physically by enclosure bay'}</span>
            </div>
          </div>
        </div>

        {/* Main Workspace: 3 Columns (Elevation Riser Sidebar | Floor Slabs Canvas | Node Inspector Drawer) */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left: Architectural Elevation Riser Silhouette Profile */}
          <aside className={`w-56 xl:w-64 border-r p-4 flex flex-col shrink-0 overflow-y-auto custom-scrollbar hidden md:flex ${
            theme === 'dark' ? 'border-slate-800 bg-slate-900/40 text-slate-200' : 'border-blue-100 bg-gradient-to-b from-sky-50/60 via-slate-50 to-indigo-50/40 text-slate-800'
          }`}>
            <div className={`flex items-center justify-between pb-2 mb-3 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-blue-100'}`}>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <span className="material-icons-round text-sm text-amber-500">corporate_fare</span>
                {bfT.elevationRiser || 'Building Elevation'}
              </span>
              <span className="text-[10px] font-mono text-slate-500">NTS</span>
            </div>

            {/* Building Overview Card (No Total Load / Current) */}
            <div className={`rounded-xl p-3 mb-4 shadow-sm border ${
              theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-gradient-to-br from-white via-sky-50/40 to-blue-50/30 border-blue-200 shadow-xs'
            }`}>
              <div className="text-[10px] uppercase font-bold text-sky-500 mb-1">{bfT.totalComponents || 'Total Equipment'}</div>
              <div className={`text-lg font-bold font-mono leading-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                {buildingTotals.nodes} <span className="text-xs text-slate-400 font-sans">items</span>
              </div>
              <div className={`grid grid-cols-2 gap-2 mt-2 pt-2 border-t text-[11px] ${theme === 'dark' ? 'border-slate-800/80' : 'border-blue-100'}`}>
                <div>
                  <span className="text-slate-500 block text-[10px]">{bfT.boards || 'Panels'}</span>
                  <span className="font-bold text-amber-500 font-mono">{buildingTotals.boards}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">{bfT.levels || 'Levels'}</span>
                  <span className="font-bold text-emerald-500 font-mono">{floorGroups.length}</span>
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
                        ? theme === 'dark' ? 'bg-amber-950/20 border-amber-800/40 hover:bg-amber-900/30' : 'bg-amber-50/90 border-amber-300 hover:bg-amber-100/80 text-amber-900'
                        : isActive
                        ? theme === 'dark' ? 'bg-amber-600/20 border-amber-500/60 shadow-md text-white' : 'bg-gradient-to-r from-blue-50 via-sky-50 to-indigo-50 border-blue-500 shadow-sm text-blue-950 font-bold ring-2 ring-blue-400/30'
                        : theme === 'dark' ? 'bg-slate-800/60 border-slate-800 hover:bg-slate-800 hover:border-slate-700 text-slate-200' : 'bg-white border-slate-200 hover:bg-sky-50/60 hover:border-sky-300 text-slate-800 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-6 h-6 rounded-lg text-xs font-bold font-mono flex items-center justify-center shrink-0 ${
                          floor.isUnassigned
                            ? 'bg-amber-900/40 text-amber-300'
                            : isActive
                            ? 'bg-amber-500 text-white'
                            : theme === 'dark' ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {floor.isUnassigned ? '?' : floor.levelRank}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`text-xs font-semibold break-words leading-tight transition-colors ${
                          theme === 'dark' ? 'text-slate-200 group-hover:text-amber-400' : 'text-slate-800 group-hover:text-blue-600'
                        }`} title={floor.displayName}>
                          {floor.displayName}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[11px] font-bold font-mono text-sky-500">
                        {floor.nodes.length} items
                      </div>
                      <div className="text-[9px] text-slate-500">
                        {floor.enclosures.length} {bfT.boards || 'panels'}
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
                      ? theme === 'dark'
                        ? 'bg-slate-900/40 border-dashed border-amber-700/50'
                        : 'bg-amber-50/50 border-dashed border-amber-300 shadow-sm'
                      : theme === 'dark'
                        ? 'bg-slate-900/80 border-slate-800 shadow-xl'
                        : 'bg-white border-blue-100 shadow-md'
                  }`}
                >
                  {/* Architectural Floor Concrete Slab Header (Blue Title Bar) */}
                  <div
                    className={`px-5 py-3 border-b flex flex-wrap items-center justify-between gap-3 ${
                      floor.isUnassigned
                        ? theme === 'dark'
                          ? 'bg-amber-900/40 border-amber-700/60 text-amber-200'
                          : 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 border-amber-400 text-white shadow-md'
                        : 'bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 border-blue-500 text-white shadow-md'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Floor Icon Pill (no height) */}
                      <span
                        className={`p-1.5 rounded-lg text-xs font-bold border flex items-center justify-center ${
                          floor.isUnassigned
                            ? theme === 'dark'
                              ? 'bg-amber-900/60 border-amber-600/70 text-amber-200'
                              : 'bg-amber-200/80 border-amber-400 text-amber-900'
                            : 'bg-white/15 border-white/30 text-white'
                        }`}
                      >
                        <span className="material-icons-round text-sm">
                          {floor.levelRank >= 1000 ? 'roofing' : floor.levelRank < 0 ? 'foundation' : 'stairs'}
                        </span>
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
                          <p className={`text-[11px] mt-0.5 ${theme === 'dark' ? 'text-amber-400/80' : 'text-amber-800'}`}>
                            {bfT.unassignedDesc || 'Components with no floor assigned yet. Assign a floor or room below to organize them.'}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Floor Aggregate Metrics Bar (No Total Load / Current) */}
                    <div className="flex items-center gap-2 sm:gap-3 text-xs">
                      <div className="bg-black/25 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-white/20 flex items-center gap-1.5 font-mono text-white">
                        <span className="text-white/80 text-[10px]">{bfT.boards || 'Panels'}:</span>
                        <span className="font-bold text-white">{floor.enclosures.length}</span>
                      </div>

                      <div className="bg-black/25 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-white/20 flex items-center gap-1.5 font-mono text-white">
                        <span className="text-white/80 text-[10px]">{bfT.totalComponents || 'Items'}:</span>
                        <span className="font-bold text-white">{floor.nodes.length}</span>
                      </div>
                    </div>
                  </div>

                  {/* Floor Slab Body: Enclosure Bays & Individual Room Equipment (NO CONNECTING WIRES) */}
                  <div className="p-4 sm:p-5 space-y-6">

                    {/* 1. Panel Enclosures & Distribution Boards (Cabinet Bays containing their sons) */}
                    {floor.enclosures.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
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
                                className={`rounded-xl border transition-all overflow-hidden ${
                                  isSelected
                                    ? 'border-amber-500 ring-2 ring-amber-500/20 shadow-lg'
                                    : theme === 'dark'
                                    ? 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                                    : 'bg-white border-blue-200 hover:border-blue-400 hover:shadow-md transition-all shadow-xs'
                                }`}
                              >
                                {/* Enclosure Header: Distribution Board Specs (Blue Tinted Title Bar) */}
                                <div
                                  onClick={() => handleInspect(board)}
                                  className={`p-3.5 border-b cursor-pointer transition-colors flex flex-col gap-2 ${
                                    theme === 'dark'
                                      ? 'bg-gradient-to-r from-blue-950/60 via-slate-900 to-sky-950/40 border-blue-900/40 hover:bg-blue-900/30'
                                      : 'bg-gradient-to-r from-blue-50 via-sky-50/60 to-indigo-50/40 border-blue-200 hover:from-blue-100/70 hover:to-indigo-100/70'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                        theme === 'dark' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'bg-blue-600 text-white shadow-xs'
                                      }`}>
                                        <span className="material-icons-round text-lg">
                                          {board.node.type === ComponentType.SYSTEM_ROOT ? 'domain' : 'dns'}
                                        </span>
                                      </div>

                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <h4 className={`text-sm font-bold tracking-tight transition-colors break-words leading-snug ${
                                            theme === 'dark' ? 'text-white hover:text-amber-400' : 'text-slate-900 hover:text-blue-600'
                                          }`} title={getNodeFullName(board.node)}>
                                            {getNodeFullName(board.node)}
                                          </h4>
                                          {board.node.componentNumber && (
                                            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border shrink-0 ${
                                              theme === 'dark' ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200'
                                            }`}>
                                              #{board.node.componentNumber}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                          <span className="text-sky-500 font-semibold font-mono">
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
                                        <div className={`text-[10px] px-2 py-0.5 rounded-md border flex flex-col items-end gap-0.5 ${
                                          theme === 'dark' ? 'bg-slate-800/80 border-slate-700 text-slate-300' : 'bg-white border-blue-200 text-slate-700 shadow-2xs'
                                        }`} title="Feeding Source">
                                          <div className="flex items-center gap-1">
                                            <span className="material-icons-round text-xs text-amber-500">arrow_upward</span>
                                            <span>{bfT.parentFeeder || 'Feeder'}: <strong className={theme === 'dark' ? 'text-white' : 'text-slate-900'}>{board.parent.name}</strong></span>
                                            {board.parent.componentNumber && (
                                              <span className="text-[9px] font-mono text-amber-500 font-bold">#{board.parent.componentNumber}</span>
                                            )}
                                          </div>
                                          {[board.parent.floor, board.parent.place || board.parent.office].filter(Boolean).length > 0 && (
                                            <span className="text-[9px] text-slate-400 font-normal">
                                              📍 {[board.parent.floor, board.parent.place || board.parent.office].filter(Boolean).join(', ')}
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 font-semibold">
                                          {bfT.independentSource || 'Main Source'}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Badges and icons at bottom of node */}
                                  {renderNodeBadgesBottom(board.node, false)}
                                </div>

                                {/* Enclosure Interior: Modular Slots for Downstream Sons */}
                                <div className={`p-3 ${theme === 'dark' ? 'bg-slate-950/40' : 'bg-gradient-to-b from-blue-50/20 via-slate-50/40 to-white'}`}>
                                  <div className="text-[10px] uppercase font-bold text-slate-500 mb-2 flex items-center justify-between">
                                    <span>{bfT.downstreamSons || 'Downstream Sons'} ({localSons.length + remoteSons.length})</span>
                                    <span className="text-[9px] font-mono text-slate-400">{bfT.enclosureSlots || 'ENCLOSURE SLOTS'}</span>
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
                                            className={`p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col justify-between group ${
                                              isSonSelected
                                                ? 'bg-amber-500/10 border-amber-500/70 shadow-2xs'
                                                : theme === 'dark'
                                                ? 'bg-slate-900/90 border-slate-800/80 hover:bg-slate-800 hover:border-slate-700'
                                                : 'bg-white border-slate-200 hover:bg-blue-50/60 hover:border-blue-300 shadow-2xs'
                                            }`}
                                          >
                                            <div className="flex items-start gap-2 min-w-0">
                                              <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 mt-0.5 ${
                                                theme === 'dark' ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'
                                              }`}>
                                                <LegendIcon
                                                  icon={COMPONENT_CONFIG[son.node.type]?.icon || 'help'}
                                                  color={COMPONENT_CONFIG[son.node.type]?.color || '#94a3b8'}
                                                  size={14}
                                                />
                                              </div>
                                              <div className="min-w-0 flex-1">
                                                <div className={`text-xs font-semibold transition-colors flex items-center gap-1.5 flex-wrap ${
                                                  theme === 'dark' ? 'text-slate-200 group-hover:text-amber-400' : 'text-slate-800 group-hover:text-blue-600'
                                                }`}>
                                                  <span className="break-words leading-tight" title={getNodeFullName(son.node)}>
                                                    {getNodeFullName(son.node)}
                                                  </span>
                                                  {son.node.componentNumber && (
                                                    <span className="text-[10px] font-mono text-slate-400">#{son.node.componentNumber}</span>
                                                  )}
                                                </div>
                                                <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                                                  {son.node.amps ? `${son.node.amps}A` : ''} {son.node.kva ? `• ${son.node.kva}kVA` : ''}
                                                  {son.place && <span className="text-slate-400 font-sans"> • 📍 {son.place}</span>}
                                                </div>
                                                {son.parent && (
                                                  <div className="text-[9.5px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1 flex-wrap leading-tight" title={`Power Source: ${son.parent.name}`}>
                                                    <span className="material-icons-round text-[11px] text-amber-500 shrink-0">bolt</span>
                                                    <span>{bfT.parentFeeder || 'Feed'}: <strong>{son.parent.name}</strong></span>
                                                    {son.parent.componentNumber && (
                                                      <span className="font-mono text-[9px] font-bold">#{son.parent.componentNumber}</span>
                                                    )}
                                                    {[son.parent.floor, son.parent.place || son.parent.office].filter(Boolean).length > 0 && (
                                                      <span className="text-slate-400 text-[9px]">
                                                        • 📍{[son.parent.floor, son.parent.place || son.parent.office].filter(Boolean).join(', ')}
                                                      </span>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            </div>

                                            {/* Badges and icons at the bottom of the node */}
                                            {renderNodeBadgesBottom(son.node, true)}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {/* Remote Sons (Fed from here but physically located on other floors) */}
                                  {remoteSons.length > 0 && (
                                    <div className={`mt-2 pt-2 border-t ${theme === 'dark' ? 'border-slate-800/60' : 'border-slate-200'}`}>
                                      <span className="text-[10px] text-slate-500 block mb-1.5">
                                        {bfT.feedsOtherFloors || '⚡ Feeds sub-panels on other floors (no crossing lines):'}
                                      </span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {remoteSons.map(rSon => (
                                          <button
                                            key={rSon.node.id}
                                            onClick={() => handleInspect(rSon)}
                                            className={`text-[10px] p-2 rounded-lg border flex flex-col gap-1 transition-colors text-left ${
                                              theme === 'dark'
                                                ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700/60'
                                                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs'
                                            }`}
                                          >
                                            <div className="flex items-center gap-1 flex-wrap">
                                              <span className="font-semibold break-words leading-tight" title={getNodeFullName(rSon.node)}>
                                                {getNodeFullName(rSon.node)}
                                              </span>
                                              {rSon.node.componentNumber && (
                                                <span className="font-mono text-slate-400 text-[9px]">#{rSon.node.componentNumber}</span>
                                              )}
                                            </div>
                                            <span className="text-amber-500 font-mono text-[9px]">🏢 {rSon.floor || bfT.floorNames?.unassigned || 'No floor'}</span>
                                            {rSon.parent && (
                                              <span className="text-[9px] text-slate-400 flex items-center gap-0.5 flex-wrap">
                                                <span>⚡ {bfT.parentFeeder || 'Feed'}: {rSon.parent.name}</span>
                                                {rSon.parent.componentNumber && <span className="font-mono font-bold">#{rSon.parent.componentNumber}</span>}
                                                {[rSon.parent.floor, rSon.parent.place || rSon.parent.office].filter(Boolean).length > 0 && (
                                                  <span> • 📍{[rSon.parent.floor, rSon.parent.place || rSon.parent.office].filter(Boolean).join(', ')}</span>
                                                )}
                                              </span>
                                            )}
                                            {renderNodeBadgesBottom(rSon.node, true)}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {localSons.length === 0 && remoteSons.length === 0 && (
                                    <div className="text-xs text-slate-500 py-1 italic">
                                      {bfT.noDownstreamCircuits || 'No downstream circuits attached.'}
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
                        <div className="flex items-center gap-2 text-xs font-bold text-blue-500 uppercase tracking-wider">
                          <span className="material-icons-round text-sm text-emerald-500">devices</span>
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
                                className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                                  isSelected
                                    ? 'border-amber-500 ring-2 ring-amber-500/20 shadow-md'
                                    : theme === 'dark'
                                    ? 'bg-slate-900/60 hover:bg-slate-800/80 border-slate-800 hover:border-slate-700'
                                    : 'bg-white hover:bg-indigo-50/40 border-blue-100 hover:border-blue-300 shadow-2xs'
                                }`}
                              >
                                <div>
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                        theme === 'dark' ? 'bg-slate-800 text-slate-300' : 'bg-blue-50 text-blue-700 border border-blue-200'
                                      }`}>
                                        <LegendIcon
                                          icon={COMPONENT_CONFIG[item.node.type]?.icon || 'help'}
                                          color={COMPONENT_CONFIG[item.node.type]?.color || '#94a3b8'}
                                          size={16}
                                        />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <h5 className={`text-xs font-bold break-words leading-snug ${
                                          theme === 'dark' ? 'text-white' : 'text-slate-900'
                                        }`} title={getNodeFullName(item.node)}>
                                          {getNodeFullName(item.node)}
                                        </h5>
                                        <span className="text-[10px] text-slate-500 block mt-0.5">
                                          {t.componentTypes[item.node.type] || item.node.type}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-2.5 flex items-center gap-2 text-[11px] font-mono">
                                    <span className="text-amber-500 font-semibold">
                                      {item.node.amps ? `${item.node.amps}A` : ''}
                                    </span>
                                    {item.node.kva && (
                                      <span className="text-slate-500">• {item.node.kva}kVA</span>
                                    )}
                                    {item.place && (
                                      <span className="text-slate-500 break-words">• {item.place}</span>
                                    )}
                                  </div>

                                  {/* Feeder Reference Badge (NO LINES!) */}
                                  <div className={`mt-2.5 pt-2 border-t flex items-center justify-between text-[10px] ${
                                    theme === 'dark' ? 'border-slate-800/60' : 'border-slate-100'
                                  }`}>
                                    {item.parent ? (
                                      <div className="text-slate-500 flex flex-col gap-0.5 min-w-0 flex-1 mr-2" title={`Fed by ${item.parent.name}`}>
                                        <div className="flex items-center gap-1 flex-wrap">
                                          <span className="material-icons-round text-xs text-amber-500 shrink-0">bolt</span>
                                          <span className="break-words leading-tight">{bfT.parentFeeder || 'Feed'}: <strong className={theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}>{item.parent.name}</strong></span>
                                          {item.parent.componentNumber && (
                                            <span className="text-[9px] font-mono text-amber-500 font-bold">#{item.parent.componentNumber}</span>
                                          )}
                                        </div>
                                        {[item.parent.floor, item.parent.place || item.parent.office].filter(Boolean).length > 0 && (
                                          <span className="text-[9px] text-slate-400">
                                            📍 {[item.parent.floor, item.parent.place || item.parent.office].filter(Boolean).join(', ')}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-emerald-500 font-medium">{bfT.independentSource || 'Independent'}</span>
                                    )}

                                    {/* Quick assign button if unassigned */}
                                    {floor.isUnassigned && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setQuickAssignTargetId(quickAssignTargetId === item.node.id ? null : item.node.id);
                                        }}
                                        className="px-2 py-0.5 rounded bg-amber-600/30 hover:bg-amber-600/50 text-amber-500 border border-amber-500/40 text-[10px] font-semibold transition-colors"
                                      >
                                        {bfT.assignFloor || 'Assign Floor'}
                                      </button>
                                    )}
                                  </div>

                                  {/* Badges and icons at bottom of node */}
                                  {renderNodeBadgesBottom(item.node, false)}
                                </div>

                                {/* Quick Floor Dropdown Popover */}
                                {quickAssignTargetId === item.node.id && (
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className={`mt-2 p-2 rounded-xl shadow-xl space-y-1.5 animate-fadeIn border ${
                                      theme === 'dark' ? 'bg-slate-950 border-amber-500/50' : 'bg-white border-amber-400'
                                    }`}
                                  >
                                    <div className="text-[10px] font-bold text-amber-500 uppercase">
                                      {bfT.quickAssign || 'Quick Assign to Floor'}:
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 text-[11px]">
                                      {[
                                        bfT.floorNames?.roof || 'Roof',
                                        bfT.floorNames?.floor3 || 'Floor 3',
                                        bfT.floorNames?.floor2 || 'Floor 2',
                                        bfT.floorNames?.floor1 || 'Floor 1',
                                        bfT.floorNames?.ground || 'Ground Floor',
                                        bfT.floorNames?.basement1 || 'Basement 1',
                                        bfT.floorNames?.basement2 || 'Basement 2'
                                      ].map(flr => (
                                        <button
                                          key={flr}
                                          onClick={() => handleQuickAssignFloor(item, flr)}
                                          className={`px-2 py-1 rounded transition-colors text-left truncate ${
                                            theme === 'dark'
                                              ? 'bg-slate-800 hover:bg-amber-600 hover:text-white text-slate-300'
                                              : 'bg-slate-100 hover:bg-amber-500 hover:text-white text-slate-700'
                                          }`}
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
                        {language === 'ar' ? 'لا توجد أجهزة موضوعة في هذا الطابق بعد.' : (language === 'he' ? 'טרם הוצב ציוד במפלס קומה זה.' : 'No equipment placed on this floor slab yet.')}
                      </div>
                    )}

                  </div>
                </section>
              );
            })}
          </main>

          {/* Right: Component Detail & Location Editor Inspector Drawer */}
          {inspectedItem && (
            <aside className={`w-80 xl:w-96 border-l p-4 flex flex-col shrink-0 overflow-y-auto custom-scrollbar animate-fadeIn ${
              theme === 'dark' ? 'border-slate-800 bg-slate-900/60 text-slate-200' : 'border-blue-100 bg-gradient-to-b from-sky-50/40 via-white to-blue-50/30 text-slate-800 shadow-md'
            }`}>
              <div className={`flex items-center justify-between pb-3 mb-4 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-blue-100'}`}>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span className="material-icons-round text-sm text-amber-500">info</span>
                  {t.propertiesActions || 'Component Inspector'}
                </span>
                <button
                  onClick={() => setInspectedNodeId(null)}
                  className={`p-1 rounded-lg transition-colors ${
                    theme === 'dark' ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <span className="material-icons-round text-base">close</span>
                </button>
              </div>

              {/* Component Header Card */}
              <div className={`border rounded-xl p-3.5 mb-4 shadow-sm ${
                theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-blue-200 shadow-2xs'
              }`}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-500 border border-amber-500/30 flex items-center justify-center shrink-0">
                    <LegendIcon
                      icon={COMPONENT_CONFIG[inspectedItem.node.type]?.icon || 'help'}
                      color={COMPONENT_CONFIG[inspectedItem.node.type]?.color || '#f59e0b'}
                      size={20}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className={`text-sm font-bold break-words leading-snug ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`} title={inspectedItem.node.name}>
                      {inspectedItem.node.name}
                    </h3>
                    <div className="text-xs text-amber-500 font-medium">
                      {t.componentTypes[inspectedItem.node.type] || inspectedItem.node.type}
                    </div>
                    {inspectedItem.node.componentNumber && (
                      <span className="text-[10px] font-mono text-slate-400">
                        #{inspectedItem.node.componentNumber}
                      </span>
                    )}
                  </div>
                </div>

                {/* Ratings Grid */}
                <div className={`grid grid-cols-3 gap-2 mt-3 pt-3 border-t text-center text-xs ${
                  theme === 'dark' ? 'border-slate-800' : 'border-blue-100'
                }`}>
                  <div className={`p-1.5 rounded-lg border ${
                    theme === 'dark' ? 'bg-slate-950/60 border-slate-800/80' : 'bg-blue-50/80 border-blue-200'
                  }`}>
                    <span className="text-[9px] text-slate-500 block">{t.amps || 'Amps'}</span>
                    <span className={`font-bold font-mono ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>{inspectedItem.node.amps || 0}A</span>
                  </div>
                  <div className={`p-1.5 rounded-lg border ${
                    theme === 'dark' ? 'bg-slate-950/60 border-slate-800/80' : 'bg-sky-50/80 border-sky-200'
                  }`}>
                    <span className="text-[9px] text-slate-500 block">{t.voltage || 'Voltage'}</span>
                    <span className={`font-bold font-mono ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>{inspectedItem.node.voltage || 400}V</span>
                  </div>
                  <div className={`p-1.5 rounded-lg border ${
                    theme === 'dark' ? 'bg-slate-950/60 border-slate-800/80' : 'bg-amber-50/80 border-amber-200'
                  }`}>
                    <span className="text-[9px] text-slate-500 block">{t.power || 'Power'}</span>
                    <span className="font-bold text-amber-500 font-mono">{inspectedItem.node.kva || 0}kVA</span>
                  </div>
                </div>

                {/* Meter and Multimeter Specs Card */}
                {(inspectedItem.node.hasMeter || inspectedItem.node.hasMultimeter) && (
                  <div className={`mt-3 pt-3 border-t space-y-1.5 text-xs ${
                    theme === 'dark' ? 'border-slate-800' : 'border-slate-100'
                  }`}>
                    <div className="text-[10px] uppercase font-bold text-blue-500 flex items-center gap-1">
                      <span className="material-icons-round text-xs">speed</span>
                      <span>{bfT.instrumentation || 'Instrumentation & Metering'}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {inspectedItem.node.hasMeter && (
                        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                          <span className="text-emerald-500 font-medium flex items-center gap-1">
                            <span className="material-icons-round text-xs">electric_meter</span>
                            <span>{inspectedItem.node.meterModel ? `${t.legend?.meter || 'Meter'} (${inspectedItem.node.meterModel})` : (t.legend?.meter || 'Energy Meter')}</span>
                          </span>
                          <span className="font-mono text-[11px] text-emerald-500 font-bold">
                            {inspectedItem.node.meterNumber ? `#${inspectedItem.node.meterNumber}` : (inspectedItem.node.meterSerial ? `#${inspectedItem.node.meterSerial}` : (bfT.active || 'Active'))}
                          </span>
                        </div>
                      )}
                      {inspectedItem.node.hasMultimeter && (
                        <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-between">
                          <span className="text-purple-500 font-medium flex items-center gap-1">
                            <span className="material-icons-round text-xs">multiline_chart</span>
                            <span>{inspectedItem.node.multimeterModel ? `${t.legend?.multimeter || 'Multimeter'} (${inspectedItem.node.multimeterModel})` : (t.legend?.multimeter || 'Digital Multimeter')}</span>
                          </span>
                          <span className="font-mono text-[11px] text-purple-500 font-bold">
                            {inspectedItem.node.multimeterNumber ? `#${inspectedItem.node.multimeterNumber}` : (inspectedItem.node.multimeterSerial ? `#${inspectedItem.node.multimeterSerial}` : (bfT.active || 'Active'))}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Father / Source Feeder Box (NO LINES!) */}
              <div className={`border rounded-xl p-3 mb-4 ${
                theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
              }`}>
                <span className="text-[10px] uppercase font-bold text-blue-500 block mb-2 flex items-center gap-1">
                  <span className="material-icons-round text-xs text-sky-500">arrow_upward</span>
                  {bfT.parentFeeder || 'Direct Parent (Father Feeder)'}
                </span>

                {inspectedItem.parent ? (
                  <div
                    onClick={() => handleInspect(extractedMap.get(inspectedItem.parent!.id) || inspectedItem)}
                    className={`p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      theme === 'dark'
                        ? 'bg-slate-950 border-slate-800 hover:border-slate-700'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <span className={`text-xs font-bold transition-colors break-words leading-snug ${
                          theme === 'dark' ? 'text-white hover:text-amber-400' : 'text-slate-900 hover:text-blue-600'
                        }`} title={inspectedItem.parent.name}>
                          {inspectedItem.parent.name}
                        </span>
                        {inspectedItem.parent.componentNumber && (
                          <span className="text-[10px] font-mono font-bold text-amber-500">
                            #{inspectedItem.parent.componentNumber}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-amber-500 font-mono shrink-0">
                        {inspectedItem.parent.floor || bfT.floorNames?.unassigned || 'Floor ?'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>{t.componentTypes[inspectedItem.parent.type]} • {inspectedItem.parent.amps || 0}A</span>
                      {[inspectedItem.parent.place || inspectedItem.parent.office].filter(Boolean).length > 0 && (
                        <span>• 📍 {[inspectedItem.parent.place || inspectedItem.parent.office].filter(Boolean).join(', ')}</span>
                      )}
                    </div>
                    {inspectedItem.feederCable && (
                      <div className="text-[10px] font-mono text-sky-500 mt-1 flex items-center gap-1">
                        <span className="material-icons-round text-xs">cable</span>
                        <span>{inspectedItem.feederCable}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-emerald-500 font-semibold p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                    ⚡ {bfT.independentSource || 'Root / Independent Power Supply'}
                  </div>
                )}
              </div>

              {/* Downstream Fed Sons List */}
              <div className={`border rounded-xl p-3 mb-4 ${
                theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
              }`}>
                <span className="text-[10px] uppercase font-bold text-blue-500 block mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <span className="material-icons-round text-xs text-emerald-500">arrow_downward</span>
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
                        className={`p-2 rounded-lg border cursor-pointer flex items-center justify-between text-xs transition-colors ${
                          theme === 'dark'
                            ? 'bg-slate-950 border-slate-800/80 hover:border-slate-700'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        <div className="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap mr-2">
                          <span className={`font-semibold block break-words leading-tight ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`} title={son.name}>{son.name}</span>
                          {son.hasMeter && <span className="text-[9px] text-emerald-500 font-mono font-bold shrink-0">[M]</span>}
                          {son.hasMultimeter && <span className="text-[9px] text-purple-500 font-mono font-bold shrink-0">[MM]</span>}
                          <span className="text-[10px] text-slate-500 shrink-0">{son.amps ? `${son.amps}A` : ''}</span>
                        </div>
                        <span className="text-[10px] text-amber-500 font-mono shrink-0">
                          {son.floor || bfT.floorNames?.unassigned || 'No floor'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic p-1">
                    {bfT.noDownstreamSonsTerminal || 'No downstream sons (Terminal load).'}
                  </div>
                )}
              </div>

              {/* Location Editor Form */}
              <div className={`border rounded-xl p-3.5 mb-4 space-y-3 ${
                theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
              }`}>
                <span className="text-[10px] uppercase font-bold text-slate-500 block flex items-center gap-1">
                  <span className="material-icons-round text-xs text-amber-500">edit_location</span>
                  {bfT.editLocation || 'Edit Floor & Location'}
                </span>

                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-1">{bfT.building || 'Building'}</label>
                  <input
                    type="text"
                    value={editLocationForm.building}
                    onChange={(e) => setEditLocationForm({ ...editLocationForm, building: e.target.value })}
                    placeholder={bfT.buildingPlaceholder || 'e.g. Main Building, Tower A'}
                    className={`w-full border rounded-lg px-2.5 py-1.5 text-xs focus:border-amber-500 outline-none ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-1">{bfT.floor || 'Floor'}</label>
                  <input
                    type="text"
                    value={editLocationForm.floor}
                    onChange={(e) => setEditLocationForm({ ...editLocationForm, floor: e.target.value })}
                    placeholder={bfT.floorPlaceholder || 'e.g. Floor 2, Ground, Roof, B1'}
                    className={`w-full border rounded-lg px-2.5 py-1.5 text-xs focus:border-amber-500 outline-none ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-1">{bfT.room || 'Room / Area'}</label>
                  <input
                    type="text"
                    value={editLocationForm.place}
                    onChange={(e) => setEditLocationForm({ ...editLocationForm, place: e.target.value })}
                    placeholder={bfT.roomPlaceholder || 'e.g. Electrical Room 101, Server Rack...'}
                    className={`w-full border rounded-lg px-2.5 py-1.5 text-xs focus:border-amber-500 outline-none ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
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
                className={`w-full py-2.5 rounded-xl text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-2 border ${
                  theme === 'dark'
                    ? 'bg-slate-800 hover:bg-slate-700 text-sky-400 border-slate-700'
                    : 'bg-white hover:bg-slate-100 text-sky-600 border-slate-200 shadow-2xs'
                }`}
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
