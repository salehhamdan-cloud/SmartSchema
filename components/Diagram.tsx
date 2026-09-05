
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { ElectricalNode, ComponentType, Project, DiagramOrientation, AnnotationItem, PalmRejectionMode } from '../types';
import { COMPONENT_CONFIG, ICON_PATHS, SNAP_GRID_SIZE } from '../constants';
import { CanvasZoomControls } from './CanvasZoomControls';
import { eraseAnnotationSegments } from '../utils/annotationUtils';

interface DiagramProps {
  data: ElectricalNode[];
  onNodeClick: (node: ElectricalNode, isMulti: boolean) => void;
  onLinkClick: (sourceId: string, targetId: string) => void;
  onDuplicateChild: (node: ElectricalNode) => void;
  onDeleteNode: (node: ElectricalNode) => void;
  onToggleCollapse: (node: ElectricalNode) => void;
  onGroupNode: (node: ElectricalNode) => void;
  onNodeMove?: (updates: { id: string; x: number; y: number }[]) => void;
  onAddRoot?: () => void;
  onAddGenerator?: () => void;
  onBackgroundClick?: () => void;
  selectedNodeId: string | null;
  multiSelection: Set<string>;
  selectedLinkId: string | null;
  orientation: DiagramOrientation;
  searchMatches: Set<string> | null;
  isConnectMode?: boolean;
  connectionSourceId?: string | null;
  isPrintMode?: boolean;
  activeProject?: Project;
  onDisconnectLink?: () => void;
  onEditPrintSettings?: (field?: string) => void;
  t: any;
  language: string;
  theme: 'light' | 'dark';
  isCleanView?: boolean;
  activeFilters?: Set<string>;
  annotations?: AnnotationItem[];
  isAnnotating?: boolean;
  annotationColor?: string;
  annotationWidth?: number;
  annotationTool?: 'pen' | 'highlighter' | 'eraser';
  palmRejectionMode?: PalmRejectionMode;
  onStylusDetected?: (detected: boolean) => void;
  onAnnotationAdd?: (path: string, color: string, width?: number, tool?: 'pen' | 'highlighter') => void;
  onDeleteAnnotation?: (id: string) => void;
  onUpdateAnnotations?: (items: AnnotationItem[]) => void;
  onToggleLayoutLocked?: () => void;
  onToggleAnnotating?: () => void;
  isLayoutLocked?: boolean;
  showCanvasZoomControls?: boolean;
}

type ExtendedHierarchyNode = Omit<
  d3.HierarchyPointNode<ElectricalNode>,
  'parent' | 'children'
> & {
  width: number;
  height: number;
  x: number;
  y: number;
  __isDragging?: boolean;
  __totalDx?: number;
  __totalDy?: number;
  __initialManualX?: number;
  __initialManualY?: number;
  _children?: ExtendedHierarchyNode[] | null;
  children?: ExtendedHierarchyNode[] | undefined;
  parent: ExtendedHierarchyNode | null;
  data: ElectricalNode;
};

type DiagramLink = {
  source: ExtendedHierarchyNode;
  target: ExtendedHierarchyNode;
};

// Helper to wrap text into multiple lines cleanly
const wrapDiagramText = (text: string, maxChars: number = 28): string[] => {
  if (!text || !text.trim()) return [];
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const w of words) {
    if ((current ? current + ' ' + w : w).length <= maxChars) {
      current = current ? current + ' ' + w : w;
    } else {
      if (current) lines.push(current);
      if (w.length > maxChars) {
        let rem = w;
        while (rem.length > maxChars) {
          lines.push(rem.slice(0, maxChars));
          rem = rem.slice(maxChars);
        }
        current = rem;
      } else {
        current = w;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
};

// Helper to format floor number with floor prefix
const formatFloorText = (floorStr?: string, tFloorWord?: string): string => {
  if (!floorStr || !floorStr.trim()) return '';
  const trimmed = floorStr.trim();
  const floorWord = tFloorWord || 'Floor';
  if (
    trimmed.toLowerCase().includes('floor') ||
    trimmed.toLowerCase().includes('flr') ||
    trimmed.includes('קומה') ||
    trimmed.includes('طابق') ||
    trimmed.includes('الطابق')
  ) {
    return trimmed;
  }
  return `${floorWord} ${trimmed}`;
};

// Helper to format serial number with SN: prefix
const formatSerialNumber = (sn?: string): string => {
  if (!sn || !sn.trim()) return '';
  const trimmed = sn.trim();
  if (/^s\/?n[:\s-]?/i.test(trimmed)) {
    return trimmed;
  }
  return `SN: ${trimmed}`;
};

// Helper to determine two-line or single-line badge text (Model on line 1, Serial Number on line 2)
const getBadgeLines = (model?: string, serial?: string, rawNumber?: string): { line1: string; line2: string; isTwoLine: boolean } => {
  const m = model?.trim() || '';
  const s = formatSerialNumber(serial || rawNumber);
  if (m && s) {
    return { line1: m, line2: s, isTwoLine: true };
  }
  if (m) {
    return { line1: m, line2: '', isTwoLine: false };
  }
  if (s) {
    return { line1: s, line2: '', isTwoLine: false };
  }
  return { line1: '', line2: '', isTwoLine: false };
};

// Helper to format all location fields nicely without truncation or overflow
const getDiagramLocationLines = (data: ElectricalNode, tFloorWord?: string, maxChars: number = 30): string[] => {
  const parts: string[] = [];
  if (data.building && data.building.trim()) parts.push(`🏢 ${data.building.trim()}`);
  const floorFormatted = formatFloorText(data.floor, tFloorWord);
  if (floorFormatted) parts.push(`📍 ${floorFormatted}`);
  if (data.office && data.office.trim()) parts.push(`🚪 ${data.office.trim()}`);
  if (data.place && data.place.trim()) parts.push(`🏷️ ${data.place.trim()}`);

  if (parts.length === 0) return [];

  const lines: string[] = [];
  let current = '';

  for (const part of parts) {
    const candidate = current ? `${current} • ${part}` : part;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = part;
    }
  }
  if (current) lines.push(current);
  return lines;
};

// Helper to check if node matches active filter keys (including bld:, flr:, off:, plc:)
const checkNodeMatchesFilters = (nodeData: ElectricalNode, filters: Set<string>): boolean => {
  if (!filters || filters.size === 0) return true;
  for (const filter of filters) {
    if (filter === 'meter' && nodeData.hasMeter) return true;
    if (filter === 'generator' && nodeData.hasGeneratorConnection) return true;
    if (filter === 'no-meter' && nodeData.isExcludedFromMeter) return true;
    if (filter === 'ac' && nodeData.isAirConditioning) return true;
    if ((filter === 'airBreaker' || filter === 'isAirBreaker' || filter === 'air-breaker' || filter === 'acb') && nodeData.isAirBreaker) return true;
    if (filter === 'reserved' && nodeData.isReserved) return true;
    if (filter === 'essential' && nodeData.isEssential) return true;
    if (filter === 'non-essential' && nodeData.isEssential === false) return true;
    if ((filter === 'multimeter' || filter === 'hasMultimeter') && nodeData.hasMultimeter) return true;
    if ((filter === 'publicBoard' || filter === 'public-board' || filter === 'isPublicBoard') && nodeData.isPublicBoard) return true;
    if (Object.values(ComponentType).includes(filter as ComponentType) && nodeData.type === filter) return true;
    
    // Location filters
    if (filter.startsWith('bld:') && nodeData.building && nodeData.building.trim().toLowerCase() === filter.slice(4).trim().toLowerCase()) return true;
    if (filter.startsWith('flr:') && nodeData.floor && nodeData.floor.trim().toLowerCase() === filter.slice(4).trim().toLowerCase()) return true;
    if (filter.startsWith('off:') && nodeData.office && nodeData.office.trim().toLowerCase() === filter.slice(4).trim().toLowerCase()) return true;
    if (filter.startsWith('plc:') && nodeData.place && nodeData.place.trim().toLowerCase() === filter.slice(4).trim().toLowerCase()) return true;
  }
  return false;
};

export const Diagram: React.FC<DiagramProps> = ({
  data,
  onNodeClick,
  onLinkClick,
  onDuplicateChild,
  onDeleteNode,
  onToggleCollapse,
  onGroupNode,
  onNodeMove,
  onAddRoot,
  onAddGenerator,
  onBackgroundClick,
  selectedNodeId,
  multiSelection,
  selectedLinkId,
  orientation,
  searchMatches,
  isConnectMode = false,
  connectionSourceId = null,
  isPrintMode = false,
  activeProject,
  onDisconnectLink,
  onEditPrintSettings,
  t,
  language,
  theme,
  isCleanView = false,
  activeFilters = new Set(),
  annotationsPos = undefined,
  annotations = [],
  isAnnotating = false,
  annotationColor = '#ef4444',
  annotationWidth = 3,
  annotationTool = 'pen',
  palmRejectionMode = 'smart-palm',
  onStylusDetected,
  onAnnotationAdd,
  onDeleteAnnotation,
  onUpdateAnnotations,
  onToggleLayoutLocked,
  onToggleAnnotating,
  isLayoutLocked = false,
  showCanvasZoomControls = true
}: DiagramProps & { annotationsPos?: any }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const hasInitialFitRef = useRef<boolean>(false);
  const prevOrientationRef = useRef<DiagramOrientation>(orientation);

  // Palm Rejection & Stylus Tracking State Refs
  const lastPenTimestampRef = useRef<number>(0);
  const hasStylusEverTouchedRef = useRef<boolean>(false);
  const activeDrawingPointerIdRef = useRef<number | null>(null);
  const annotationsGroupRef = useRef<SVGGElement | null>(null);

  const isRTL = language === 'he' || language === 'ar';
  const isDark = theme === 'dark';

  const bgColor = isDark ? '#0f172a' : '#ffffff';
  const dotColor = isDark ? '#1e293b' : '#e2e8f0';
  const linkColor = isDark ? '#cbd5e1' : '#334155';
  const textColor = isDark ? '#f1f5f9' : '#0f172a';
  const nodeBgColor = isDark ? '#1e293b' : '#ffffff';
  const rootNodeBgColor = isDark ? '#334155' : '#f8fafc';
  const secondaryTextColor = isDark ? '#94a3b8' : '#475569';
  const MULTILINGUAL_FONT_FAMILY = "'Cairo', 'Heebo', 'Rubik', 'Noto Sans Arabic', 'Noto Sans Hebrew', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Segoe UI Arabic', 'Tahoma', Arial, sans-serif";

  const getTranslatedDescription = (desc?: string) => {
    if (!desc) return '';
    const defaults: Record<string, string> = {
      'Main Supply': t.defaultDesc.grid,
      'Standby Power': t.defaultDesc.gen,
      'Step Down/Up': t.defaultDesc.trans,
      'Independent Load': t.defaultDesc.load,
      'Grouped Components': t.inputPanel.groupNode,
    };
    return defaults[desc] || desc;
  };

  const getTranslatedName = (name: string, type: string) => {
    if (
      !name ||
      name.toUpperCase() === type ||
      name.replace(/_/g, ' ').toUpperCase() === type.replace(/_/g, ' ')
    ) {
      return t.componentTypes[type] || name;
    }
    return name;
  };

  const getFormattedCompNumAndType = (compNum?: string, type?: string) => {
    const typeName = t.componentTypes[type || ''] || type || '';
    if (!compNum) return typeName;
    if (!typeName) return compNum;
    if (isRTL) {
      // In Hebrew and Arabic, place component type on the right side of the component number
      return `${typeName} • ${compNum}`;
    }
    return `${compNum} • ${typeName}`;
  };

  useEffect(() => {
    if (wrapperRef.current) {
      setDimensions({
        width: wrapperRef.current.offsetWidth,
        height: wrapperRef.current.offsetHeight,
      });
    }
    const handleResize = () => {
      if (wrapperRef.current) {
        setDimensions({
          width: wrapperRef.current.offsetWidth,
          height: wrapperRef.current.offsetHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const renderAnnotationsLayer = useCallback(() => {
    if (!annotationsGroupRef.current) return;
    const layer = d3.select(annotationsGroupRef.current);
    layer.selectAll('*').remove();

    if (annotations && annotations.length > 0) {
      annotations.forEach(ant => {
        const isEraserMode = isAnnotating && annotationTool === 'eraser';
        const isHighlighter = ant.tool === 'highlighter';
        const strokeW = ant.width || (isHighlighter ? 14 : 3);
        const opacity = isHighlighter ? 0.35 : 0.9;

        const pathEl = layer.append('path')
          .attr('d', ant.path)
          .attr('stroke', ant.color)
          .attr('stroke-width', strokeW)
          .attr('fill', 'none')
          .attr('stroke-linecap', 'round')
          .attr('stroke-linejoin', 'round')
          .attr('opacity', opacity)
          .style('cursor', isEraserMode ? 'crosshair' : 'inherit')
          .style('pointer-events', isEraserMode ? 'all' : 'none');

        if (isEraserMode) {
          pathEl.on('pointerdown click', function(e: any) {
            e.stopPropagation();
            if (onDeleteAnnotation) onDeleteAnnotation(ant.id);
          });
        }
      });
    }
  }, [annotations, isAnnotating, annotationTool, onDeleteAnnotation]);

  useEffect(() => {
    renderAnnotationsLayer();
  }, [renderAnnotationsLayer]);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.on('click', (event) => {
      if (event.defaultPrevented) return;
      if (isAnnotating) return;
      onBackgroundClick?.();
    });

    const defs = svg.append('defs');
    const pattern = defs
      .append('pattern')
      .attr('id', 'dot-pattern')
      .attr('width', 20)
      .attr('height', 20)
      .attr('patternUnits', 'userSpaceOnUse');

    pattern
      .append('circle')
      .attr('cx', 2)
      .attr('cy', 2)
      .attr('r', 1)
      .attr('fill', dotColor);
      
    const filter = defs.append('filter')
        .attr('id', 'filter-glow')
        .attr('x', '-50%')
        .attr('y', '-50%')
        .attr('width', '200%')
        .attr('height', '200%');
    
    filter.append('feGaussianBlur')
        .attr('stdDeviation', '4')
        .attr('result', 'coloredBlur');

    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    svg
      .style('background-color', bgColor)
      .style('background-image', 'url(#dot-pattern)');

    const { width, height } = dimensions;

    if (!data || data.length === 0) {
      const g = svg
        .append('g')
        .attr('transform', `translate(${width / 2},${height / 2})`);

      g.append('circle')
        .attr('r', 40)
        .attr('fill', rootNodeBgColor)
        .attr('stroke', secondaryTextColor)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,5')
        .style('cursor', isCleanView ? 'default' : 'pointer')
        .on('click', (e) => {
          if (isCleanView) return;
          e.stopPropagation();
          onAddRoot && onAddRoot();
        });

      g.append('path')
        .attr('d', "M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z")
        .attr('transform', 'translate(-16, -16) scale(1.33)')
        .attr('fill', secondaryTextColor)
        .style('pointer-events', 'none');

      g.append('text')
        .attr('y', 60)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('fill', secondaryTextColor)
        .text(t.addFirstNode);

      return;
    }

    const margin = { top: 100, right: 150, bottom: 100, left: 150 };

    ['arrow', 'circle', 'diamond'].forEach((type) => {
      const markerStart = defs
        .append('marker')
        .attr('id', `${type}-start`)
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 5)
        .attr('refY', 5)
        .attr('markerWidth', 7)
        .attr('markerHeight', 7)
        .attr('orient', 'auto-start-reverse');

      if (type === 'arrow')
        markerStart.append('path').attr('d', 'M10,0 L0,5 L10,10 z').attr('fill', linkColor);
      else if (type === 'circle')
        markerStart.append('circle').attr('cx', 5).attr('cy', 5).attr('r', 4).attr('fill', linkColor);
      else if (type === 'diamond')
        markerStart.append('path').attr('d', 'M5,0 L10,5 L5,10 L0,5 z').attr('fill', linkColor);

      const markerEnd = defs
        .append('marker')
        .attr('id', `${type}-end`)
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 8)
        .attr('refY', 5)
        .attr('markerWidth', 7)
        .attr('markerHeight', 7)
        .attr('orient', 'auto');

      if (type === 'arrow')
        markerEnd.append('path').attr('d', 'M0,0 L10,5 L0,10 z').attr('fill', linkColor);
      else if (type === 'circle')
        markerEnd.append('circle').attr('cx', 5).attr('cy', 5).attr('r', 4).attr('fill', linkColor);
      else if (type === 'diamond')
        markerEnd.append('path').attr('d', 'M5,0 L10,5 L5,10 L0,5 z').attr('fill', linkColor);
    });

    defs
      .append('marker')
      .attr('id', 'arrow-end-extra')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 5)
      .attr('refY', 5)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,0 L10,5 L0,10 z')
      .attr('fill', isDark ? '#f59e0b' : '#d97706');

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .filter((event) => {
          if (isAnnotating) {
            // Allow 2-finger pinch and drag navigation on tablets even while drawing mode is active
            if (event.touches && event.touches.length >= 2) {
              return true;
            }
            return false;
          }
          return !event.button && !event.ctrlKey;
      })
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        g.attr('transform', event.transform);
      });

    zoomBehaviorRef.current = zoom;
    svg.call(zoom);
    svg.call(zoom.transform, transformRef.current);

    const virtualRootData: ElectricalNode = {
      id: 'virtual-root',
      name: 'Virtual Root',
      type: ComponentType.SYSTEM_ROOT,
      children: data,
    };

    const root = d3.hierarchy<ElectricalNode>(virtualRootData);

    root.descendants().forEach((d: any) => {
      if (d.data.isCollapsed && d.children) {
        d._children = d.children;
        d.children = null;
      }
    });

    const tempText = svg
      .append('text')
      .style('font-family', MULTILINGUAL_FONT_FAMILY)
      .style('font-size', '9px')
      .style('font-weight', 'bold')
      .style('visibility', 'hidden');

    const getTextWidth = (text: string, fontSize: string, fontWeight: string, fallbackCharWidth: number) => {
      if (!text) return 0;
      tempText
        .style('font-family', MULTILINGUAL_FONT_FAMILY)
        .style('font-size', fontSize)
        .style('font-weight', fontWeight)
        .text(text);
      const measured = tempText.node()?.getComputedTextLength() || 0;
      return measured > 0 ? measured : text.length * fallbackCharWidth;
    };

    const getNodeSize = (d: d3.HierarchyNode<ElectricalNode>) => {
      if (d.data.id === 'virtual-root') return { w: 1, h: 1 };

      const isCircle = d.data.shape === 'circle';
      const isSquare = d.data.shape === 'square';

      if (isCircle || isSquare) {
        return { w: 76, h: 76 }; 
      }

      const displayName = getTranslatedName(d.data.name, d.data.type);
      const compNumAndType = getFormattedCompNumAndType(d.data.componentNumber, d.data.type);
      const model = d.data.model || '';
      const desc = getTranslatedDescription(d.data.description);
      
      const descLines = wrapDiagramText(desc, 28);
      const locLines = getDiagramLocationLines(d.data, t?.inputPanel?.floor, 30);

      let specText = '';
      if (d.data.amps) specText += `${d.data.amps}A`;
      if (d.data.voltage) specText += (specText ? ' | ' : '') + `${d.data.voltage}V`;
      if (d.data.kva) specText += (specText ? ' | ' : '') + `${d.data.kva}kVA`;

      const nameLen = getTextWidth(displayName, '13px', '600', 6.6);
      const typeLen = getTextWidth(compNumAndType, '13px', '600', 6.6);
      const specLen = getTextWidth(specText, '12.5px', '600', 6.2);
      const modelLen = getTextWidth(model, '11.5px', '500', 5.6);
      
      let maxDescLen = 0;
      descLines.forEach(l => { 
        maxDescLen = Math.max(maxDescLen, getTextWidth(l, '11.5px', '500', 5.6)); 
      });

      let maxLocLen = 0;
      locLines.forEach(l => { 
        maxLocLen = Math.max(maxLocLen, getTextWidth(l, '11px', '500', 5.4)); 
      });

      let badgeTotalWidth = 0;
      let badgeCount = 0;
      let hasTwoLineBadge = false;

      if (d.data.hasMeter) {
        const { line1, line2, isTwoLine } = getBadgeLines(d.data.meterModel, d.data.meterSerial, d.data.meterNumber);
        if (isTwoLine) {
          hasTwoLineBadge = true;
          const w1 = getTextWidth(line1, '8.5px', 'bold', 5.2);
          const w2 = getTextWidth(line2, '8px', '600', 4.8);
          badgeTotalWidth += 20 + Math.max(w1, w2) + 6;
        } else {
          const width = getTextWidth(line1 || '', '9px', 'bold', 5.4);
          badgeTotalWidth += 20 + (line1 ? width + 6 : 0);
        }
        badgeCount++;
      }
      if (d.data.hasGeneratorConnection) {
        const width = getTextWidth(d.data.generatorName || '', '9px', 'bold', 5.4);
        const totalW = 20 + (d.data.generatorName ? width + 6 : 0);
        badgeTotalWidth += totalW;
        badgeCount++;
      }
      
      if (d.data.isExcludedFromMeter) { badgeTotalWidth += 22; badgeCount++; }
      if (d.data.isAirConditioning) { badgeTotalWidth += 22; badgeCount++; }
      if (d.data.isAirBreaker) { badgeTotalWidth += 22; badgeCount++; }
      if (d.data.isReserved) { badgeTotalWidth += 22; badgeCount++; }
      if (d.data.isEssential) { badgeTotalWidth += 22; badgeCount++; }
      if (d.data.hasMultimeter) {
        const { line1, line2, isTwoLine } = getBadgeLines(d.data.multimeterModel, d.data.multimeterSerial);
        if (isTwoLine) {
          hasTwoLineBadge = true;
          const w1 = getTextWidth(line1, '8.5px', 'bold', 5.2);
          const w2 = getTextWidth(line2, '8px', '600', 4.8);
          badgeTotalWidth += 20 + Math.max(w1, w2) + 6;
        } else {
          const width = getTextWidth(line1 || '', '9px', 'bold', 5.4);
          badgeTotalWidth += 20 + (line1 ? width + 6 : 0);
        }
        badgeCount++;
      }
      if (d.data.isPublicBoard) { badgeTotalWidth += 22; badgeCount++; }

      if (badgeCount > 1) {
        badgeTotalWidth += (badgeCount - 1) * 5;
      }

      const contentWidth = Math.max(
        nameLen,
        typeLen,
        specLen,
        modelLen,
        maxDescLen,
        maxLocLen,
        badgeTotalWidth,
        80
      );
      // Snug, compact node width with reduced empty space on sides
      const nodeW = Math.max(contentWidth + 18, badgeTotalWidth + 16, 96);

      // Height calculation - tightly fitted to content with zero wasted gaps
      // Top icon center is at 25px
      let contentHeight = 25; 
      contentHeight += 32; // Distance from icon center to Comp Number + Type line
      contentHeight += 20; // Distance to Component Name line
      
      if (specText) contentHeight += 17;
      if (model) contentHeight += 16;
      if (descLines.length > 0) contentHeight += (descLines.length * 15) + 4;
      if (locLines.length > 0) contentHeight += (locLines.length * 14) + 4;
      
      if (badgeCount > 0) {
        contentHeight += (hasTwoLineBadge ? 28 : 18) + 16;
      } else {
        contentHeight += 12;
      }

      return { w: nodeW, h: contentHeight };
    };

    root.each((d: any) => {
      const size = getNodeSize(d);
      d.width = size.w;
      d.height = size.h;
    });

    let treeLayout: d3.TreeLayout<ElectricalNode>;

    if (orientation === 'horizontal') {
      const depthSpacing = 300;
      const siblingBase = 150;
      treeLayout = d3
        .tree<ElectricalNode>()
        .nodeSize([siblingBase, depthSpacing])
        .separation((a, b) => {
          const aH = (a as any).height || 100;
          const bH = (b as any).height || 100;
          const totalHeight = (aH + bH) / 2 + 32;
          return (totalHeight / siblingBase) * (a.parent === b.parent ? 1 : 1.25);
        });
      treeLayout(root);
    } else if (orientation === 'vertical') {
      const depthSpacing = 280;
      const siblingBase = 180;
      treeLayout = d3
        .tree<ElectricalNode>()
        .nodeSize([siblingBase, depthSpacing])
        .separation((a, b) => {
          const aW = (a as any).width || 120;
          const bW = (b as any).width || 120;
          const totalWidth = (aW + bW) / 2 + 32;
          return (totalWidth / siblingBase) * (a.parent === b.parent ? 1 : 1.25);
        });
      treeLayout(root);
    } else {
      // 90-degree Vertical Cascade (Indented step hierarchy where nodes are arranged sequentially one below the other)
      let currentY = 40;
      const nodeGapY = 32;
      const indentStep = 100;

      const layoutStepTree = (node: any, depth: number) => {
        if (node.data.id !== 'virtual-root') {
          node.x = (depth - 1) * indentStep;
          node.y = currentY;
          currentY += (node.height || 80) + nodeGapY;
        }

        if (node.children && node.children.length > 0) {
          node.children.forEach((child: any) => {
            layoutStepTree(child, depth + (node.data.id === 'virtual-root' ? 0 : 1));
          });
        }
      };

      layoutStepTree(root, 0);
    }

    const nodesToRender = root
      .descendants()
      .filter((d) => d.depth > 0) as unknown as ExtendedHierarchyNode[];

    const linksToRender: DiagramLink[] = root
      .links()
      .filter((d) => d.source.data.id !== 'virtual-root')
      .map((d) => ({
        source: d.source as unknown as ExtendedHierarchyNode,
        target: d.target as unknown as ExtendedHierarchyNode,
      }));

    const getRectBox = (d: ExtendedHierarchyNode) => {
      const w = d.width;
      const h = d.height;
      if (orientation === 'horizontal') {
        return { x: 0, y: -h / 2, w, h };
      } else if (orientation === 'vertical') {
        return { x: -w / 2, y: 0, w, h };
      } else {
        return { x: 0, y: 0, w, h };
      }
    };

    const linkGenerator = (source: ExtendedHierarchyNode, target: ExtendedHierarchyNode) => {
      const sXOffset = source.data.manualX || 0;
      const sYOffset = source.data.manualY || 0;
      const tXOffset = target.data.manualX || 0;
      const tYOffset = target.data.manualY || 0;
      const lineType = target.data.connectionStyle?.lineType || 'orthogonal';

      if (orientation === 'horizontal') {
        const srcX = source.y + source.width + sXOffset;
        const srcY = source.x + sYOffset;
        const tgtX = target.y + tXOffset;
        const tgtY = target.x + tYOffset;

        if (lineType === 'straight') {
            return `M${srcX},${srcY} L${tgtX},${tgtY}`;
        } else {
            return `M${srcX},${srcY} H${(srcX + tgtX) / 2} V${tgtY} H${tgtX}`;
        }
      } else if (orientation === 'vertical') {
        const srcX = source.x + sXOffset;
        const srcY = source.y + source.height + sYOffset;
        const tgtX = target.x + tXOffset;
        const tgtY = target.y + tYOffset;

        if (lineType === 'straight') {
            return `M${srcX},${srcY} L${tgtX},${tgtY}`;
        } else {
            return `M${srcX},${srcY} V${(srcY + tgtY) / 2} H${tgtX} V${tgtY}`;
        }
      } else {
        // 90-degree Vertical Cascade: Out from parent bottom trunk -> down vertically to target Y -> 90° right turn into target X
        const srcX = source.x + sXOffset + 24;
        const srcY = source.y + source.height + sYOffset;
        const tgtX = target.x + tXOffset;
        const tgtY = target.y + tYOffset + 24;

        if (lineType === 'straight') {
            return `M${srcX},${srcY} L${tgtX},${tgtY}`;
        } else {
            return `M${srcX},${srcY} V${tgtY} H${tgtX}`;
        }
      }
    };

    const extraLinksToRender: DiagramLink[] = [];
    const nodeLookup = new Map<string, ExtendedHierarchyNode>();
    nodesToRender.forEach((d) => nodeLookup.set(d.data.id, d));

    nodesToRender.forEach((d) => {
      if (d.data.extraConnections) {
        d.data.extraConnections.forEach((targetId) => {
          const targetNode = nodeLookup.get(targetId);
          if (targetNode) {
            extraLinksToRender.push({ source: targetNode, target: d });
          }
        });
      }
    });

    // Dedicated Annotations Layer (rendered above canvas background)
    const annotationsGroup = g.append('g').attr('class', 'annotations-layer');
    annotationsGroupRef.current = annotationsGroup.node();

    // Palm Rejection & Stylus/Touch Input Filter
    const isPalmOrRejectedTouch = (event: any): boolean => {
      const pType = event.pointerType; // 'pen', 'touch', 'mouse'
      
      // 1. Digital Pen / Stylus Input (Apple Pencil, S Pen, Surface Pen, Wacom, etc.)
      if (pType === 'pen') {
        lastPenTimestampRef.current = Date.now();
        hasStylusEverTouchedRef.current = true;
        if (onStylusDetected) onStylusDetected(true);
        return false; // Pen is always allowed!
      }

      // 2. Mouse / Trackpad Pointer
      if (pType === 'mouse') {
        return false; // Mouse is always allowed
      }

      // 3. Touch Input (Fingers / Palm Contact)
      if (pType === 'touch') {
        // Mode A: Stylus / Pen Only -> Complete Palm Rejection (all touches ignored for drawing)
        if (palmRejectionMode === 'pen-only') {
          return true; // Reject touch! Allows resting hand freely on screen
        }

        // Mode B: Smart Auto Palm Rejection
        if (palmRejectionMode === 'smart-palm') {
          // If stylus was active in the last 4 seconds, this touch is the resting palm!
          if (Date.now() - lastPenTimestampRef.current < 4000) {
            return true;
          }
          // If stylus has been used on this device, reject touch if used within 15 seconds
          if (hasStylusEverTouchedRef.current && Date.now() - lastPenTimestampRef.current < 15000) {
            return true;
          }
          // Contact geometry inspection (tablets emit width/height or radius for touch contact area)
          // Palm touches create broad contact rectangles (typically > 22px), fingertips are ~10-16px
          const w = event.width || 0;
          const h = event.height || 0;
          if (w > 22 || h > 22) {
            return true; // Reject broad palm contact!
          }
          return false; // Allowed single small fingertip
        }

        // Mode C: Touch & Stylus
        if (palmRejectionMode === 'touch-and-pen') {
          const w = event.width || 0;
          const h = event.height || 0;
          if (w > 38 || h > 38) return true; // Reject extreme full-palm contact
          return false;
        }
      }

      return false;
    };

    renderAnnotationsLayer();

    // Interactive Smart Partial Eraser Surface
    if (isAnnotating && annotationTool === 'eraser') {
      svg.style('cursor', 'crosshair');
      const eraserSurface = svg.append('rect')
        .attr('class', 'eraser-surface')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('fill', 'transparent')
        .style('pointer-events', 'all')
        .style('touch-action', 'none');

      // Visual circular cursor indicator for eraser
      const eraserCircle = g.append('circle')
        .attr('class', 'eraser-visual-cursor')
        .attr('r', 18)
        .attr('fill', 'rgba(239, 68, 68, 0.25)')
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '3,3')
        .style('pointer-events', 'none')
        .style('display', 'none');

      let isErasing = false;
      let activeEraserPointerId: number | null = null;
      let localAnnotations = [...(annotations || [])];

      const handleEraseAtEvent = (event: any) => {
        const coords = d3.pointer(event, g.node());
        eraserCircle
          .attr('cx', coords[0])
          .attr('cy', coords[1])
          .style('display', 'block');

        if (isErasing) {
          const { updatedAnnotations, didChange } = eraseAnnotationSegments(
            localAnnotations,
            { x: coords[0], y: coords[1] },
            18
          );
          if (didChange) {
            localAnnotations = updatedAnnotations;
            if (onUpdateAnnotations) {
              onUpdateAnnotations(updatedAnnotations);
            }
          }
        }
      };

      eraserSurface
        .on('pointermove', function(event: any) {
          if (isPalmOrRejectedTouch(event)) return;
          if (activeEraserPointerId !== null && event.pointerId !== undefined && event.pointerId !== activeEraserPointerId) {
            return;
          }
          handleEraseAtEvent(event);
        })
        .on('pointerleave', function() {
          eraserCircle.style('display', 'none');
        })
        .on('pointerdown', function(event: any) {
          if (isPalmOrRejectedTouch(event)) return;
          event.preventDefault();
          isErasing = true;
          activeEraserPointerId = event.pointerId !== undefined ? event.pointerId : null;

          const surfaceEl = this as Element;
          if (surfaceEl.setPointerCapture && event.pointerId !== undefined) {
            try { surfaceEl.setPointerCapture(event.pointerId); } catch (_) {}
          }
          handleEraseAtEvent(event);
        })
        .on('pointerup pointercancel', function(event: any) {
          if (activeEraserPointerId !== null && event.pointerId !== undefined && event.pointerId !== activeEraserPointerId) {
            return;
          }
          isErasing = false;
          activeEraserPointerId = null;

          const surfaceEl = this as Element;
          if (surfaceEl.releasePointerCapture && event.pointerId !== undefined) {
            try { surfaceEl.releasePointerCapture(event.pointerId); } catch (_) {}
          }
        });
    }

    // Interactive Drawing Surface when pen/highlighter is active
    if (isAnnotating && annotationTool !== 'eraser') {
      svg.style('cursor', 'crosshair');
      const drawSurface = svg.append('rect')
        .attr('class', 'draw-surface')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('fill', 'transparent')
        .style('pointer-events', 'all')
        .style('touch-action', 'none');

      let currentPath = '';
      let tempPathEl: any = null;
      const isHighlighter = annotationTool === 'highlighter';
      const effectiveW = annotationWidth || (isHighlighter ? 14 : 3);
      const effectiveOp = isHighlighter ? 0.35 : 0.9;

      drawSurface.on('pointerdown', function(event: any) {
        // Palm Rejection Check
        if (isPalmOrRejectedTouch(event)) {
          return; // Accidental palm contact ignored!
        }

        event.preventDefault();
        const surfaceEl = this as Element;
        activeDrawingPointerIdRef.current = event.pointerId !== undefined ? event.pointerId : null;

        if (surfaceEl.setPointerCapture && event.pointerId !== undefined) {
          try { surfaceEl.setPointerCapture(event.pointerId); } catch (_) {}
        }

        const coords = d3.pointer(event, g.node());
        currentPath = `M ${coords[0].toFixed(1)} ${coords[1].toFixed(1)}`;

        tempPathEl = annotationsGroup.append('path')
          .attr('class', 'temp-drawing')
          .attr('d', currentPath)
          .attr('stroke', annotationColor || '#ef4444')
          .attr('stroke-width', effectiveW)
          .attr('fill', 'none')
          .attr('stroke-linecap', 'round')
          .attr('stroke-linejoin', 'round')
          .attr('opacity', effectiveOp);

        drawSurface
          .on('pointermove', (moveEv: any) => {
            // Ignore movements from other pointers (such as resting palm while drawing)
            if (
              activeDrawingPointerIdRef.current !== null &&
              moveEv.pointerId !== undefined &&
              moveEv.pointerId !== activeDrawingPointerIdRef.current
            ) {
              return;
            }

            moveEv.preventDefault();
            const m = d3.pointer(moveEv, g.node());
            currentPath += ` L ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
            if (tempPathEl) tempPathEl.attr('d', currentPath);
          })
          .on('pointerup pointercancel', function(upEv: any) {
            if (
              activeDrawingPointerIdRef.current !== null &&
              upEv.pointerId !== undefined &&
              upEv.pointerId !== activeDrawingPointerIdRef.current
            ) {
              return;
            }

            const upSurface = this as Element;
            if (upSurface.releasePointerCapture && upEv.pointerId !== undefined) {
              try { upSurface.releasePointerCapture(upEv.pointerId); } catch (_) {}
            }
            activeDrawingPointerIdRef.current = null;
            drawSurface.on('pointermove', null).on('pointerup pointercancel', null);
            if (currentPath && onAnnotationAdd) {
              const finalPath = currentPath.includes('L')
                ? currentPath
                : `${currentPath} L ${(coords[0] + 0.1).toFixed(1)} ${(coords[1] + 0.1).toFixed(1)}`;
              onAnnotationAdd(finalPath, annotationColor || '#ef4444', effectiveW, isHighlighter ? 'highlighter' : 'pen');
            }
            if (tempPathEl) {
              tempPathEl.remove();
              tempPathEl = null;
            }
            currentPath = '';
          });
      });
    }

    const linksGroup = g.append('g').attr('class', 'links');
    const nodesGroup = g.append('g').attr('class', 'nodes');
    const labelsGroup = g.append('g').attr('class', 'labels');

    const drag = d3
      .drag<SVGGElement, ExtendedHierarchyNode>()
      .filter((event) => !isLayoutLocked && !isCleanView && !event.button) 
      .on('start', function (event, d) {
        if (isCleanView || isLayoutLocked) return; 
        const node = d as ExtendedHierarchyNode;
        const descendants = node.descendants() as unknown as ExtendedHierarchyNode[];
        
        descendants.forEach((desc: ExtendedHierarchyNode) => {
          desc.__initialManualX = desc.data.manualX || 0;
          desc.__initialManualY = desc.data.manualY || 0;
          desc.__totalDx = 0;
          desc.__totalDy = 0;
        });
        
        d3.select(this).raise();
      })
      .on('drag', function (event, d) {
        if (isCleanView || isLayoutLocked) return; 
        const node = d as ExtendedHierarchyNode;
        
        node.__totalDx = (node.__totalDx || 0) + event.dx;
        node.__totalDy = (node.__totalDy || 0) + event.dy;

        const descendants = node.descendants() as unknown as ExtendedHierarchyNode[];
        descendants.forEach((desc: ExtendedHierarchyNode) => {
          const rawX = (desc.__initialManualX || 0) + (node.__totalDx || 0);
          const rawY = (desc.__initialManualY || 0) + (node.__totalDy || 0);
          
          const snappedX = Math.round(rawX / SNAP_GRID_SIZE) * SNAP_GRID_SIZE;
          const snappedY = Math.round(rawY / SNAP_GRID_SIZE) * SNAP_GRID_SIZE;

          const el = g.select(`g.node[data-id="${desc.data.id}"]`);
          if (orientation === 'horizontal') {
            el.attr('transform', `translate(${desc.y + snappedX},${desc.x + snappedY})`);
          } else {
            el.attr('transform', `translate(${desc.x + snappedX},${desc.y + snappedY})`);
          }
          
          (desc.data as any)._tempX = snappedX;
          (desc.data as any)._tempY = snappedY;
        });
        
        linkPathSelection.attr('d', (lk) => {
           const sX = (lk.source.data as any)._tempX ?? (lk.source.data.manualX || 0);
           const sY = (lk.source.data as any)._tempY ?? (lk.source.data.manualY || 0);
           const tX = (lk.target.data as any)._tempX ?? (lk.target.data.manualX || 0);
           const tY = (lk.target.data as any)._tempY ?? (lk.target.data.manualY || 0);
           
           const lineType = lk.target.data.connectionStyle?.lineType || 'orthogonal';

           if (orientation === 'horizontal') {
             const srcX = lk.source.y + lk.source.width + sX;
             const srcY = lk.source.x + sY;
             const tgtX = lk.target.y + tX;
             const tgtY = lk.target.x + tY;
             if (lineType === 'straight') return `M${srcX},${srcY} L${tgtX},${tgtY}`;
             return `M${srcX},${srcY} H${(srcX + tgtX) / 2} V${tgtY} H${tgtX}`;
           } else if (orientation === 'vertical') {
             const srcX = lk.source.x + sX;
             const srcY = lk.source.y + lk.source.height + sY;
             const tgtX = lk.target.x + tX;
             const tgtY = lk.target.y + tY;
             if (lineType === 'straight') return `M${srcX},${srcY} L${tgtX},${tgtY}`;
             return `M${srcX},${srcY} V${(srcY + tgtY) / 2} H${tgtX} V${tgtY}`;
           } else {
             const srcX = lk.source.x + sX + 24;
             const srcY = lk.source.y + lk.source.height + sY;
             const tgtX = lk.target.x + tX;
             const tgtY = lk.target.y + tY + 24;
             if (lineType === 'straight') return `M${srcX},${srcY} L${tgtX},${tgtY}`;
             return `M${srcX},${srcY} V${tgtY} H${tgtX}`;
           }
        });
      })
      .on('end', function (event, d) {
        if (isCleanView || isLayoutLocked) return; 
        const node = d as ExtendedHierarchyNode;
        const descendants = node.descendants() as unknown as ExtendedHierarchyNode[];
        
        const finalUpdates: { id: string; x: number; y: number }[] = [];
        descendants.forEach((desc: ExtendedHierarchyNode) => {
          const rawX = (desc.__initialManualX || 0) + (node.__totalDx || 0);
          const rawY = (desc.__initialManualY || 0) + (node.__totalDy || 0);
          
          const snappedX = Math.round(rawX / SNAP_GRID_SIZE) * SNAP_GRID_SIZE;
          const snappedY = Math.round(rawY / SNAP_GRID_SIZE) * SNAP_GRID_SIZE;

          finalUpdates.push({ id: desc.data.id, x: snappedX, y: snappedY });
          
          delete (desc.data as any)._tempX;
          delete (desc.data as any)._tempY;
        });

        if (onNodeMove) {
          onNodeMove(finalUpdates);
        }
      });

    const renderLinks = (
      selection: d3.Selection<SVGPathElement, DiagramLink, SVGGElement, unknown>,
      className: string,
      isHitArea = false
    ) => {
      selection
        .attr('class', className)
        .attr('data-target-id', (d) => d.target.data.id)
        .attr('d', (d) => linkGenerator(d.source, d.target))
        .attr('fill', 'none')
        .each(function (d) {
          if (isHitArea) return;
          const style = d.target.data.connectionStyle || {};
          const stroke =
            style.strokeColor ||
            d.target.data.customColor ||
            COMPONENT_CONFIG[d.target.data.type]?.color ||
            linkColor;
          const isSelected = d.target.data.id === selectedLinkId;

          if (className === 'link-extra') {
            d3.select(this)
              .attr('stroke', isDark ? '#f59e0b' : '#d97706')
              .attr('stroke-width', 2.5)
              .attr('stroke-dasharray', '8,5')
              .attr('marker-end', 'url(#arrow-end-extra)')
              .attr('opacity', 0.8);
          } else {
            d3.select(this)
              .attr('stroke', stroke)
              .attr('stroke-width', isSelected ? 4 : 2.5)
              .attr(
                'stroke-dasharray',
                style.lineStyle === 'dashed'
                  ? '8,4'
                  : style.lineStyle === 'dotted'
                  ? '2,4'
                  : style.lineStyle === 'dash-dot'
                  ? '8,4,2,4'
                  : style.lineStyle === 'long-dash'
                  ? '16,4'
                  : 'none'
              )
              .attr(
                'marker-start',
                style.startMarker && style.startMarker !== 'none'
                  ? `url(#${style.startMarker}-start)`
                  : null
              )
              .attr(
                'marker-end',
                style.endMarker === 'none'
                  ? null
                  : style.endMarker
                  ? `url(#${style.endMarker}-end)`
                  : 'url(#arrow-end)'
              )
              .style(
                'filter',
                isSelected
                  ? 'drop-shadow(0 0 3px rgba(0, 0, 0, 0.3))'
                  : 'none'
              )
              .attr('opacity', () => {
                if (!searchMatches) return 0.8;
                const isMatch =
                  searchMatches.has(d.source.data.id) ||
                  searchMatches.has(d.target.data.id);
                return isMatch ? 1 : 0.1;
              });
          }
        });
    };

    const linkPathSelection = linksGroup
      .selectAll<SVGPathElement, DiagramLink>('path.link-visible')
      .data(linksToRender)
      .enter()
      .append('path')
      .call(renderLinks, 'link-visible');

    linksGroup
      .selectAll<SVGPathElement, DiagramLink>('path.link-extra')
      .data(extraLinksToRender)
      .enter()
      .append('path')
      .call(renderLinks, 'link-extra');

    linksGroup
      .selectAll<SVGPathElement, DiagramLink>('path.link-hit')
      .data(linksToRender)
      .enter()
      .append('path')
      .attr('class', 'link-hit')
      .attr('data-target-id', (d) => d.target.data.id)
      .attr('d', (d) => linkGenerator(d.source, d.target))
      .attr('fill', 'none')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 15)
      .style('cursor', 'pointer')
      .on('click', (e, d) => {
        if (isCleanView) return;
        e.stopPropagation();
        onLinkClick(d.source.data.id, d.target.data.id);
      });

    const renderIcon = (parent: d3.Selection<SVGGElement, unknown, null, undefined>, iconName: string, color: string, defaultTransform: string) => {
        const iconData = ICON_PATHS[iconName] || ICON_PATHS['help'];
        
        if (Array.isArray(iconData)) {
             const normScale = 24 / 512; 
             iconData.forEach((path: any) => {
                 parent.append('path')
                    .attr('d', path.d)
                    .attr('fill', path.fill || color)
                    .attr('transform', `${defaultTransform} scale(${normScale}) ${path.transform || ''}`);
             });
        } else {
            parent.append('path')
                .attr('d', iconData)
                .attr('transform', defaultTransform)
                .attr('fill', color);
        }
    };
    
    const renderActionButtons = (nodeG: d3.Selection<SVGGElement, unknown, null, undefined>, d: ExtendedHierarchyNode, isPermanent: boolean = false) => {
        nodeG.selectAll('.action-buttons').remove();
        if (isCleanView) return;

        const actionsG = nodeG.append('g')
            .attr('class', 'action-buttons')
            .attr('opacity', isPermanent ? 1 : 0);

        const box = getRectBox(d);
        const btnY = box.y - 20; 
        const centerX = box.x + box.w / 2;

        const deleteBtn = actionsG.append('g')
            .attr('transform', `translate(${centerX - 24}, ${btnY})`)
            .style('cursor', 'pointer')
            .on('click', (e) => {
                e.stopPropagation();
                onDeleteNode(d.data);
            });
        deleteBtn.append('circle').attr('r', 8).attr('fill', '#ef4444');
        deleteBtn.append('path').attr('d', 'M-2.5,-2.5 L2.5,2.5 M-2.5,2.5 L2.5,-2.5').attr('stroke', 'white').attr('stroke-width', 1.5);

        const dupBtn = actionsG.append('g')
            .attr('transform', `translate(${centerX}, ${btnY})`)
            .style('cursor', 'pointer')
            .on('click', (e) => {
                e.stopPropagation();
                onDuplicateChild(d.data);
            });
        dupBtn.append('circle').attr('r', 8).attr('fill', '#3b82f6');
        dupBtn.append('path').attr('d', 'M-3,3 L-3,-3 L3,-3 L3,3 Z M0,-3 L0,3 M-3,0 L3,0').attr('stroke', 'white').attr('stroke-width', 1.5).attr('fill', 'none');

        if (d.children && d.children.length > 0) {
             const collapseBtn = actionsG.append('g')
                .attr('transform', `translate(${centerX + 24}, ${btnY})`)
                .style('cursor', 'pointer')
                .on('click', (e) => {
                    e.stopPropagation();
                    onToggleCollapse(d.data);
                });
             collapseBtn.append('circle').attr('r', 8).attr('fill', '#f59e0b');
             collapseBtn.append('path').attr('d', 'M-4,0 L4,0').attr('stroke', 'white').attr('stroke-width', 1.5);
        }

        if (!isPermanent) {
            actionsG.transition().duration(200).attr('opacity', 1);
        }
    };

    const nodesSelection = nodesGroup
      .selectAll<SVGGElement, ExtendedHierarchyNode>('g.node')
      .data(nodesToRender)
      .enter()
      .append('g')
      .attr('class', (d) =>
        `node group ${
          d.data.id === selectedNodeId || multiSelection.has(d.data.id)
            ? 'selected'
            : ''
        }`
      )
      .attr('data-id', (d) => d.data.id)
      .attr('transform', (d) => {
        const offsetX = d.data.manualX || 0;
        const offsetY = d.data.manualY || 0;
        return orientation === 'horizontal'
          ? `translate(${d.y + offsetX},${d.x + offsetY})`
          : `translate(${d.x + offsetX},${d.y + offsetY})`;
      })
      .call(drag as any)
      .on('click', function (event, d: ExtendedHierarchyNode) {
        if (d.__isDragging) {
          event.stopPropagation();
          return;
        }
        if (event.defaultPrevented) return;
        event.stopPropagation();
        onNodeClick(d.data, event.shiftKey);
      })
      .on('mouseenter', function (event, d: ExtendedHierarchyNode) {
        const isSelected = d.data.id === selectedNodeId || multiSelection.has(d.data.id);
        const isSource = d.data.id === connectionSourceId;
        const el = d3.select(this as SVGGElement);
        
        if (!isLayoutLocked && !isCleanView) {
            el.style('cursor', 'move');
        } else {
            el.style('cursor', 'pointer');
        }
        
        const hoverFill = isDark ? '#334155' : '#e2e8f0';
        el.select<SVGRectElement | SVGCircleElement>('.node-bg')
          .transition()
          .duration(200)
          .attr('fill', hoverFill)
          .attr('stroke', isSource ? '#f59e0b' : isSelected ? '#3b82f6' : '#64748b');

        if (!isSelected && !isCleanView) {
            renderActionButtons(el, d, false);
        }
      })
      .on('mouseleave', function (event, d: ExtendedHierarchyNode) {
        const el = d3.select(this as SVGGElement);
        const isSelected = d.data.id === selectedNodeId || multiSelection.has(d.data.id);
        
        if (!isSelected) {
            el.selectAll('.action-buttons').transition().duration(200).attr('opacity', 0).remove();
        }
        
        const isSource = d.data.id === connectionSourceId;
            
        el.select<SVGRectElement | SVGCircleElement>('.node-bg')
          .transition()
          .duration(200)
          .attr('fill', (d2: ExtendedHierarchyNode) =>
             d2.data.customBgColor || (d2.data.type === ComponentType.SYSTEM_ROOT ? rootNodeBgColor : nodeBgColor)
          )
          .attr('stroke', isSource ? '#f59e0b' : isSelected ? '#3b82f6' : secondaryTextColor);
      })
      .style('cursor', () => isCleanView ? 'pointer' : isLayoutLocked ? 'pointer' : 'move')
      .style('filter', (d) => {
          if (activeFilters && activeFilters.size > 0) {
              const matches = checkNodeMatchesFilters(d.data, activeFilters);
              if (matches) return 'url(#filter-glow)';
          }
          return null;
      })
      .style('opacity', (d) => {
        if (activeFilters && activeFilters.size > 0) {
            const matches = checkNodeMatchesFilters(d.data, activeFilters);
            return matches ? 1 : 0.2;
        }

        if (!searchMatches) return 1;
        if (searchMatches.has(d.data.id)) return 1;
        if (d.parent && d.parent.data.id !== 'virtual-root' && searchMatches.has(d.parent.data.id)) return 1;
        if (d.children && d.children.some((c: any) => searchMatches.has(c.data.id))) return 1;
        return 0.2;
      });

    nodesSelection.each(function (d: any) {
      const nodeG = d3.select(this as SVGGElement);
      
      if (d.data.id === selectedNodeId) {
          renderActionButtons(nodeG, d, true);
      }

      const shape = d.data.shape || 'rectangle';
      const box = getRectBox(d);
      
      const fill = d.data.customBgColor || (d.data.type === ComponentType.SYSTEM_ROOT ? rootNodeBgColor : nodeBgColor);

      if (shape === 'circle') {
        nodeG.append('circle')
          .attr('class', 'node-bg')
          .attr('r', 40)
          .attr('cx', 0)
          .attr('cy', 0)
          .attr('fill', fill)
          .attr('stroke', (dAny: any) => {
            if (dAny.data.id === connectionSourceId) return '#f59e0b';
            if (dAny.data.id === selectedNodeId || multiSelection.has(dAny.data.id)) return '#3b82f6';
            return dAny.data.type === ComponentType.SYSTEM_ROOT ? '#64748b' : secondaryTextColor;
          })
          .attr('stroke-width', (dAny: any) =>
            dAny.data.id === selectedNodeId || multiSelection.has(dAny.data.id) ? 3 : 1.5
          );
      } else if (shape === 'square') {
        nodeG.append('rect')
          .attr('class', 'node-bg')
          .attr('width', 80)
          .attr('height', 80)
          .attr('x', -40)
          .attr('y', -40)
          .attr('rx', 4)
          .attr('fill', fill)
          .attr('stroke', (dAny: any) => {
            if (dAny.data.id === connectionSourceId) return '#f59e0b';
            if (dAny.data.id === selectedNodeId || multiSelection.has(dAny.data.id)) return '#3b82f6';
            return secondaryTextColor;
          })
          .attr('stroke-width', (dAny: any) =>
            dAny.data.id === selectedNodeId || multiSelection.has(dAny.data.id) ? 3 : 1.5
          );
      } else {
        nodeG.append('rect')
          .attr('class', 'node-bg')
          .attr('width', box.w)
          .attr('height', box.h)
          .attr('x', box.x)
          .attr('y', box.y)
          .attr('rx', 12)
          .attr('fill', fill)
          .attr('stroke', (dAny: any) => {
            if (dAny.data.id === connectionSourceId) return '#f59e0b';
            if (dAny.data.id === selectedNodeId || multiSelection.has(dAny.data.id)) return '#3b82f6';
            return dAny.data.type === ComponentType.SYSTEM_ROOT ? '#64748b' : secondaryTextColor;
          })
          .attr('stroke-width', (dAny: any) =>
            dAny.data.id === selectedNodeId || multiSelection.has(dAny.data.id) || dAny.data.id === connectionSourceId ? 3 : 1.5
          );

        nodeG.append('path')
          .attr('d', (dAny: any) => {
            const r = 12;
            const box2 = getRectBox(dAny);
            return `M${box2.x},${box2.y + 6} v${-6 + r} a${r},${r} 0 0 1 ${r},${-r} h${
              box2.w - 2 * r
            } a${r},${r} 0 0 1 ${r},${r} v${6 - r}`;
          })
          .attr('fill', (dAny: ExtendedHierarchyNode) =>
            dAny.data.customColor || COMPONENT_CONFIG[dAny.data.type]?.color || '#94a3b8'
          );
      }
    });

    const contentG = nodesSelection.append('g')
      .style('font-family', MULTILINGUAL_FONT_FAMILY)
      .attr('transform', (d) => {
        const shape = d.data.shape || 'rectangle';
        const box = getRectBox(d);
        if (shape === 'circle' || shape === 'square') {
          return `translate(0, 0)`;
        }
        if (orientation === 'horizontal')
          return `translate(${d.width / 2}, ${box.y + 25})`;
        else if (orientation === 'vertical')
          return `translate(0, ${box.y + 25})`;
        else
          return `translate(${d.width / 2}, ${box.y + 25})`;
      });

    contentG.each(function (d) {
      const el = d3.select(this as SVGGElement);
      const iconColor = d.data.customColor || COMPONENT_CONFIG[d.data.type]?.color || '#94a3b8';

      if (d.data.customImage) {
        el.append('image')
          .attr('xlink:href', d.data.customImage)
          .attr('x', -20)
          .attr('y', -20)
          .attr('width', 40)
          .attr('height', 40)
          .style('clip-path', 'circle(20px at center)');
      } else {
        const shape = d.data.shape || 'rectangle';
        if (shape === 'rectangle') {
          el.append('circle')
            .attr('r', 16)
            .attr('cx', 0)
            .attr('cy', 0)
            .attr('fill', isDark ? '#1e293b' : '#ffffff')
            .attr('stroke', iconColor)
            .attr('stroke-width', 1.5);
        }
        
        const iconName = COMPONENT_CONFIG[d.data.type]?.icon;
        const defaultTransform = 'translate(-9, -9) scale(0.75)';
        renderIcon(el, iconName, iconColor, defaultTransform);
      }
    });

    contentG.each(function (d) {
      const el = d3.select(this as SVGGElement);
      const shape = d.data.shape || 'rectangle';

      if (shape === 'circle' || shape === 'square') {
        if (d.data.componentNumber) {
          el.append('text')
            .attr('x', 0)
            .attr('y', 30)
            .attr('text-anchor', 'middle')
            .style('font-family', MULTILINGUAL_FONT_FAMILY)
            .style('font-size', '12px')
            .style('font-weight', '600')
            .style('fill', () => d.data.customColor || COMPONENT_CONFIG[d.data.type]?.color || '#94a3b8')
            .text(() => getFormattedCompNumAndType(d.data.componentNumber, d.data.type));

          el.append('text')
            .attr('x', 0)
            .attr('y', 46)
            .attr('text-anchor', 'middle')
            .style('font-family', MULTILINGUAL_FONT_FAMILY)
            .style('font-size', '12.5px')
            .style('font-weight', '600')
            .style('fill', textColor)
            .text(() => getTranslatedName(d.data.name, d.data.type));
        } else {
          el.append('text')
            .attr('x', 0)
            .attr('y', 30)
            .attr('text-anchor', 'middle')
            .style('font-family', MULTILINGUAL_FONT_FAMILY)
            .style('font-size', '12.5px')
            .style('font-weight', '600')
            .style('fill', textColor)
            .text(() => getTranslatedName(d.data.name, d.data.type));
        }
      } else {
        let yOffset = 32;

        // Component Number & Type Name
        const compNumAndType = getFormattedCompNumAndType(d.data.componentNumber, d.data.type);

        el.append('text')
          .attr('x', 0)
          .attr('y', yOffset)
          .attr('text-anchor', 'middle')
          .style('font-family', MULTILINGUAL_FONT_FAMILY)
          .style('font-size', '13px')
          .style('font-weight', '600')
          .style('letter-spacing', '0.01em')
          .style('fill', () => d.data.customColor || COMPONENT_CONFIG[d.data.type]?.color || '#94a3b8')
          .text(compNumAndType);

        // Name (matches the same clean font, weight, and styling as the node information)
        yOffset += 18;
        el.append('text')
          .attr('x', 0)
          .attr('y', yOffset)
          .attr('text-anchor', 'middle')
          .style('font-family', MULTILINGUAL_FONT_FAMILY)
          .style('font-size', '13px')
          .style('font-weight', '600')
          .style('fill', textColor)
          .text(() => getTranslatedName(d.data.name, d.data.type));

        // Electrical specs (Amperage, Voltage, kVA) - Enlarged Information Text
        const specs: string[] = [];
        if (d.data.amps) specs.push(`${d.data.amps}A`);
        if (d.data.voltage) specs.push(`${d.data.voltage}V`);
        if (d.data.kva) specs.push(`${d.data.kva}kVA`);

        if (specs.length > 0) {
          yOffset += 17;
          el.append('text')
            .attr('x', 0)
            .attr('y', yOffset)
            .attr('text-anchor', 'middle')
            .style('font-size', '12.5px')
            .style('font-weight', '600')
            .style('fill', secondaryTextColor)
            .text(specs.join(' | '));
        }

        // Model - Enlarged Information Text
        if (d.data.model) {
          yOffset += 16;
          el.append('text')
            .attr('x', 0)
            .attr('y', yOffset)
            .attr('text-anchor', 'middle')
            .style('font-size', '11.5px')
            .style('font-weight', '500')
            .style('font-style', 'italic')
            .style('fill', secondaryTextColor)
            .text(d.data.model);
        }
        
        // Description (cleanly wrapped into multiple lines) - Enlarged Information Text
        const desc = getTranslatedDescription(d.data.description);
        if (desc) {
          const descLines = wrapDiagramText(desc, 28);
          if (descLines.length > 0) {
            yOffset += 4;
            descLines.forEach((line) => {
              yOffset += 15;
              el.append('text')
                .attr('x', 0)
                .attr('y', yOffset)
                .attr('text-anchor', 'middle')
                .style('font-size', '11.5px')
                .style('font-weight', '500')
                .style('fill', secondaryTextColor)
                .text(line);
            });
          }
        }

        // Location Info (Building, Floor, Office, Place) - Enlarged Information Text
        const locLines = getDiagramLocationLines(d.data, t?.inputPanel?.floor, 30);
        if (locLines.length > 0) {
          yOffset += 4;
          locLines.forEach((line) => {
            yOffset += 14;
            el.append('text')
              .attr('x', 0)
              .attr('y', yOffset)
              .attr('text-anchor', 'middle')
              .style('font-size', '11px')
              .style('font-weight', '500')
              .style('fill', isDark ? '#94a3b8' : '#64748b')
              .text(line);
          });
        }
      }
    });

    nodesSelection
      .filter((d) => !!(d.data.isCollapsed && d._children && d._children.length > 0))
      .append('circle')
      .attr('r', 8)
      .attr('cx', (d) => {
        const shape = d.data.shape || 'rectangle';
        return shape === 'rectangle'
          ? orientation === 'horizontal'
            ? d.width
            : orientation === 'vertical'
            ? 0
            : 24
          : 35;
      })
      .attr('cy', (d) => {
        const shape = d.data.shape || 'rectangle';
        return shape === 'rectangle'
          ? orientation === 'horizontal'
            ? 0
            : d.height
          : 35;
      })
      .attr('fill', dotColor)
      .attr('stroke', secondaryTextColor)
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .style('pointer-events', 'all')
      .on('click', function(e, d) {
          e.stopPropagation();
          onToggleCollapse(d.data);
      });

    nodesSelection
      .filter((d) => !!(d.data.isCollapsed && d._children && d._children.length > 0))
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('x', (d) => {
        const shape = d.data.shape || 'rectangle';
        return shape === 'rectangle'
          ? orientation === 'horizontal'
            ? d.width
            : orientation === 'vertical'
            ? 0
            : 24
          : 35;
      })
      .attr('y', (d) => {
        const shape = d.data.shape || 'rectangle';
        return shape === 'rectangle'
          ? orientation === 'horizontal'
            ? 0
            : d.height
          : 35;
      })
      .attr('fill', secondaryTextColor)
      .style('font-size', '12px')
      .style('font-weight', 'bold')
      .style('pointer-events', 'none')
      .text('+');

    const renderBadge = (
        gNode: d3.Selection<SVGGElement, unknown, null, undefined>, 
        line1: string, 
        line2: string,
        iconName: string, 
        color: string, 
        bgColorLight: string, 
        bgColorDark: string, 
        d: ExtendedHierarchyNode,
        badgeX: number,
        maxNodeBadgeHeight: number = 18,
        customTransform?: string
    ) => {
        const group = gNode.append('g');
        const isTwoLine = Boolean(line1 && line2);
        const badgeHeight = isTwoLine ? 28 : 18;
        
        let totalWidth = 20;

        if (isTwoLine) {
          const t1 = group.append('text')
            .attr('x', 20)
            .attr('y', 8)
            .attr('dominant-baseline', 'central')
            .style('font-size', '8.5px')
            .style('font-weight', 'bold')
            .style('fill', color)
            .style('direction', 'ltr')
            .text(line1);

          const t2 = group.append('text')
            .attr('x', 20)
            .attr('y', 19)
            .attr('dominant-baseline', 'central')
            .style('font-size', '8px')
            .style('font-weight', '600')
            .style('fill', color)
            .style('direction', 'ltr')
            .text(line2);

          const len1 = t1.node()?.getComputedTextLength() || 0;
          const len2 = t2.node()?.getComputedTextLength() || 0;
          totalWidth = 20 + Math.max(len1, len2) + 6;
        } else {
          const singleText = line1 || line2 || '';
          const t1 = group.append('text')
            .attr('x', 20)
            .attr('y', 9)
            .attr('dominant-baseline', 'central')
            .style('font-size', '9px')
            .style('font-weight', 'bold')
            .style('fill', color)
            .style('direction', 'ltr')
            .text(singleText);

          const textLen = t1.node()?.getComputedTextLength() || 0;
          totalWidth = 20 + (singleText ? textLen + 6 : 0);
        }

        group.insert('rect', 'text')
          .attr('height', badgeHeight)
          .attr('width', totalWidth)
          .attr('rx', isTwoLine ? 6 : 9)
          .attr('fill', isDark ? bgColorDark : bgColorLight)
          .attr('stroke', color)
          .attr('stroke-width', 0.5);

        const defaultTrans = customTransform || (isTwoLine ? 'translate(3, 8) scale(0.5)' : 'translate(3, 3) scale(0.5)');
        renderIcon(group, iconName, color, defaultTrans);
        
        if (d.data.shape && d.data.shape !== 'rectangle') {
             group.attr('transform', `translate(${badgeX}, -35)`);
        } else {
             const box = getRectBox(d);
             const y = box.y + box.h - maxNodeBadgeHeight - 8 + (maxNodeBadgeHeight - badgeHeight) / 2;
             group.attr('transform', `translate(${badgeX}, ${y})`);
        }
        return totalWidth;
    };

    nodesSelection.each(function(d: any) {
        const gNode = d3.select(this as SVGGElement);
        let totalBadgesWidth = 0;
        let badgeCount = 0;
        let hasTwoLineBadge = false;

        if (d.data.hasMeter) {
            const { line1, line2, isTwoLine } = getBadgeLines(d.data.meterModel, d.data.meterSerial, d.data.meterNumber);
            if (isTwoLine) {
                hasTwoLineBadge = true;
                tempText.text(line1);
                const w1 = tempText.node()?.getComputedTextLength() || 0;
                tempText.text(line2);
                const w2 = tempText.node()?.getComputedTextLength() || 0;
                totalBadgesWidth += 20 + Math.max(w1, w2) + 6;
            } else {
                tempText.text(line1 || '');
                const textLen = tempText.node()?.getComputedTextLength() || 0;
                totalBadgesWidth += 20 + (line1 ? textLen + 6 : 0);
            }
            badgeCount++;
        }
        if (d.data.hasGeneratorConnection) {
            tempText.text(d.data.generatorName || '');
            const textLen = tempText.node()?.getComputedTextLength() || 0;
            totalBadgesWidth += 20 + (d.data.generatorName ? textLen + 6 : 0);
            badgeCount++;
        }
        if (d.data.isExcludedFromMeter) { totalBadgesWidth += 22; badgeCount++; }
        if (d.data.isAirConditioning) { totalBadgesWidth += 22; badgeCount++; }
        if (d.data.isAirBreaker) { totalBadgesWidth += 22; badgeCount++; }
        if (d.data.isReserved) { totalBadgesWidth += 22; badgeCount++; }
        if (d.data.isEssential) { totalBadgesWidth += 22; badgeCount++; }
        if (d.data.hasMultimeter) {
            const { line1, line2, isTwoLine } = getBadgeLines(d.data.multimeterModel, d.data.multimeterSerial);
            if (isTwoLine) {
                hasTwoLineBadge = true;
                tempText.text(line1);
                const w1 = tempText.node()?.getComputedTextLength() || 0;
                tempText.text(line2);
                const w2 = tempText.node()?.getComputedTextLength() || 0;
                totalBadgesWidth += 20 + Math.max(w1, w2) + 6;
            } else {
                tempText.text(line1 || '');
                const textLen = tempText.node()?.getComputedTextLength() || 0;
                totalBadgesWidth += 20 + (line1 ? textLen + 6 : 0);
            }
            badgeCount++;
        }
        if (d.data.isPublicBoard) { totalBadgesWidth += 22; badgeCount++; }

        if (badgeCount > 1) {
            totalBadgesWidth += (badgeCount - 1) * 5;
        }

        const box = getRectBox(d);
        const startX = box.x + Math.max(8, (box.w - totalBadgesWidth) / 2);
        let currentXOffset = 0;
        const maxNodeBadgeHeight = hasTwoLineBadge ? 28 : 18;

        if (d.data.hasMeter) {
            const { line1, line2 } = getBadgeLines(d.data.meterModel, d.data.meterSerial, d.data.meterNumber);
            const w = renderBadge(gNode, line1, line2, 'speed', '#3b82f6', '#dbeafe', '#1e3a8a', d, startX + currentXOffset, maxNodeBadgeHeight);
            currentXOffset += w + 5;
        }
        if (d.data.hasGeneratorConnection) {
            const w = renderBadge(gNode, d.data.generatorName || '', '', 'letter_g', '#ef4444', '#fee2e2', '#7f1d1d', d, startX + currentXOffset, maxNodeBadgeHeight);
            currentXOffset += w + 5;
        }
        if (d.data.isExcludedFromMeter) {
             const w = renderBadge(gNode, '', '', 'power_off', '#64748b', '#f1f5f9', '#334155', d, startX + currentXOffset, maxNodeBadgeHeight);
            currentXOffset += w + 5;
        }
        if (d.data.isAirConditioning) {
             const w = renderBadge(gNode, '', '', 'ac_unit', '#06b6d4', '#cffafe', '#155e75', d, startX + currentXOffset, maxNodeBadgeHeight);
            currentXOffset += w + 5;
        }
        if (d.data.isAirBreaker) {
             const w = renderBadge(gNode, '', '', 'air_breaker', '#0284c7', '#e0f2fe', '#0369a1', d, startX + currentXOffset, maxNodeBadgeHeight);
            currentXOffset += w + 5;
        }
        if (d.data.isReserved) {
             const w = renderBadge(gNode, '', '', 'lock', '#eab308', '#fef9c3', '#713f12', d, startX + currentXOffset, maxNodeBadgeHeight);
            currentXOffset += w + 5;
        }
        if (d.data.isEssential) {
             const w = renderBadge(gNode, '', '', 'star', '#ef4444', '#fee2e2', '#7f1d1d', d, startX + currentXOffset, maxNodeBadgeHeight);
            currentXOffset += w + 5;
        }
        if (d.data.hasMultimeter) {
             const { line1, line2 } = getBadgeLines(d.data.multimeterModel, d.data.multimeterSerial);
             const w = renderBadge(gNode, line1, line2, 'multimeter', '#10b981', '#d1fae5', '#064e3b', d, startX + currentXOffset, maxNodeBadgeHeight);
            currentXOffset += w + 5;
        }
        if (d.data.isPublicBoard) {
             const w = renderBadge(gNode, '', '', 'public_board', '#14b8a6', '#ccfbf1', '#134e4a', d, startX + currentXOffset, maxNodeBadgeHeight);
            currentXOffset += w + 5;
        }
    });

    linksToRender.forEach((d: any) => {
        const cableText = d.target.data.connectionStyle?.cableSize;
        if (cableText) {
            const stroke = d.target.data.connectionStyle?.strokeColor || d.target.data.customColor || COMPONENT_CONFIG[d.target.data.type]?.color || linkColor;
            const tXOffset = d.target.data.manualX || 0;
            const tYOffset = d.target.data.manualY || 0;
            
            const tgtX = orientation === 'horizontal' ? d.target.y + tXOffset : d.target.x + tXOffset;
            const tgtY = orientation === 'horizontal' ? d.target.x + tYOffset : d.target.y + tYOffset;

            const labelG = labelsGroup.append('g');
            let xPos = tgtX;
            let yPos = tgtY;
            let rotation = 0;
            let textAnchor = 'end';

            if (orientation === 'horizontal') {
                 xPos = tgtX - 25; 
                 yPos = tgtY - 8;
                 textAnchor = 'end'; 
            } else if (orientation === 'vertical') {
                 xPos = tgtX - 5; 
                 yPos = tgtY - 35;
                 rotation = -90;
                 textAnchor = 'start'; 
            } else {
                 xPos = tgtX - 15; 
                 yPos = tgtY + 16;
                 rotation = 0;
                 textAnchor = 'end'; 
            }

            labelG.attr('transform', `translate(${xPos}, ${yPos}) rotate(${rotation})`);

            const txt = labelG.append('text')
               .attr('text-anchor', textAnchor)
               .style('font-size', '10px')
               .style('font-weight', 'bold')
               .style('fill', '#ffffff')
               .style('direction', 'ltr') 
               .text(cableText);

            const bbox = txt.node()?.getBBox();
            if (bbox) {
                 labelG.insert('rect', 'text')
                    .attr('x', bbox.x - 4)
                    .attr('y', bbox.y - 2)
                    .attr('width', bbox.width + 8)
                    .attr('height', bbox.height + 4)
                    .attr('rx', 4)
                    .attr('fill', stroke)
                    .style('opacity', 0.9);
            }
        }
    });

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    
    if (nodesToRender.length > 0) {
        nodesToRender.forEach(d => {
            const w = d.width;
            const h = d.height;
            const offX = d.data.manualX || 0;
            const offY = d.data.manualY || 0;
            
            let x1, x2, y1, y2;
            
            if (orientation === 'horizontal') {
                const cx = d.y + offX;
                const cy = d.x + offY;
                x1 = cx;
                x2 = cx + w;
                y1 = cy - h / 2;
                y2 = cy + h / 2;
            } else if (orientation === 'vertical') {
                const cx = d.x + offX;
                const cy = d.y + offY;
                x1 = cx - w / 2;
                x2 = cx + w / 2;
                y1 = cy;
                y2 = cy + h;
            } else {
                const cx = d.x + offX;
                const cy = d.y + offY;
                x1 = cx;
                x2 = cx + w;
                y1 = cy;
                y2 = cy + h;
            }
            if (x1 < minX) minX = x1;
            if (x2 > maxX) maxX = x2;
            if (y1 < minY) minY = y1;
            if (y2 > maxY) maxY = y2;
        });
    } else {
        minX = 0;
        maxX = width;
        minY = 0;
        maxY = height;
    }
    
    const types = Object.values(ComponentType);
    const badgeItems = [
      { label: t.legend.meter, icon: 'speed', color: '#3b82f6' },
      { label: t.legend.generator, icon: 'letter_g', color: '#ef4444' },
      { label: t.legend.noMeter, icon: 'power_off', color: '#64748b' },
      { label: t.legend.ac, icon: 'ac_unit', color: '#06b6d4' },
      { label: t.legend.airBreaker || 'Air Breaker (ACB)', icon: 'air_breaker', color: '#0284c7' },
      { label: t.legend.reserved, icon: 'lock', color: '#eab308' },
      { label: t.legend.essential, icon: 'star', color: '#ef4444' },
      { label: t.legend.multimeter || 'Multimeter', icon: 'multimeter', color: '#10b981' },
      { label: t.legend.publicBoard || 'Public Board', icon: 'public_board', color: '#14b8a6' }
    ];

    const totalLegendItems = types.length + badgeItems.length + 1; 
    const legendW = 200;
    const legendH = 50 + totalLegendItems * 25;

    let legX = maxX + 50;
    let legY = minY;

    if (isPrintMode && activeProject && activeProject.printMetadata) {
        const blockW = 500;
        const blockH = 100;
        const safeY = maxY + 60; 
        legX = Math.max(minX, maxX - legendW);
        legY = safeY;
        const titleX = Math.max(minX, maxX - blockW);
        const titleY = legY + legendH + 20;

        const titleBlockG = g.append('g')
            .attr('transform', `translate(${titleX}, ${titleY})`)
            .attr('class', 'print-title-block')
            .style('cursor', 'pointer');

        titleBlockG.append('rect')
            .attr('width', blockW)
            .attr('height', blockH)
            .attr('fill', 'white')
            .attr('stroke', 'black')
            .attr('stroke-width', 2)
            .style('pointer-events', 'all')
            .on('click', (event) => {
                if(event.defaultPrevented) return;
                event.stopPropagation();
                if(onEditPrintSettings) onEditPrintSettings();
            });

        titleBlockG.append('line').attr('x1', 0).attr('y1', 33).attr('x2', blockW).attr('y2', 33).attr('stroke', 'black').attr('stroke-width', 1);
        titleBlockG.append('line').attr('x1', 0).attr('y1', 66).attr('x2', blockW).attr('y2', 66).attr('stroke', 'black').attr('stroke-width', 1);

        const dividerX = isRTL ? 150 : 350;
        titleBlockG.append('line').attr('x1', dividerX).attr('y1', 0).attr('x2', dividerX).attr('y2', 100).attr('stroke', 'black').attr('stroke-width', 1);

        const pm = activeProject.printMetadata || { organization: '', engineer: '', date: '', revision: '', approvedBy: '' };

        const renderField = (label: string, value: string, x: number, y: number, w: number, fieldKey: string) => {
            const cell = titleBlockG.append('g').on('click', (e) => {
                if(e.defaultPrevented) return;
                e.stopPropagation();
                if(onEditPrintSettings) onEditPrintSettings(fieldKey);
            });
            cell.append('rect').attr('x', x - w/2).attr('y', y - 15).attr('width', w).attr('height', 30).attr('fill', 'transparent').style('pointer-events', 'all');
            cell.append('text').attr('x', x).attr('y', y - 8).attr('text-anchor', 'middle').style('font-size', '8px').style('fill', '#666').style('pointer-events', 'none').text(label || '');
            cell.append('text').attr('x', x).attr('y', y + 8).attr('text-anchor', 'middle').style('font-size', '12px').style('font-weight', 'bold').style('fill', 'black').style('pointer-events', 'none').text(value || '-');
        };

        const wideCenter = isRTL ? (150 + blockW) / 2 : 350 / 2;
        const narrowCenter = isRTL ? 150 / 2 : (350 + blockW) / 2;

        const projLabel = t.printLayout?.project || t.printSettings?.project || t.projects || 'Project';
        const orgLabel = t.printLayout?.org || t.printSettings?.organization || 'Organization';
        const engLabel = t.printLayout?.engineer || t.printSettings?.engineer || 'Engineer';
        const dateLabel = t.printLayout?.date || t.printSettings?.date || 'Date';
        const revLabel = t.printLayout?.rev || t.printSettings?.revision || 'Revision';
        const appLabel = t.printLayout?.approved || t.printSettings?.approvedBy || 'Approved';

        renderField(projLabel, activeProject.name || '', wideCenter, 16, 300, 'projectName');
        renderField(orgLabel, pm.organization || '', wideCenter, 50, 300, 'organization');
        renderField(engLabel, pm.engineer || '', wideCenter, 84, 300, 'engineer');

        renderField(dateLabel, pm.date || '', narrowCenter, 16, 140, 'date');
        renderField(revLabel, pm.revision || '', narrowCenter, 50, 140, 'revision');
        renderField(appLabel, pm.approvedBy || '', narrowCenter, 84, 140, 'approvedBy');
    }

    const legendG = g
      .append('g')
      .attr('class', 'legend-group')
      .attr('transform', `translate(${legX}, ${legY})`);

    legendG.append('rect').attr('width', legendW).attr('height', legendH).attr('rx', 8).attr('fill', isDark ? '#1e293b' : '#ffffff').attr('stroke', secondaryTextColor).attr('stroke-width', 1).attr('opacity', 0.95);
    legendG.append('text').attr('x', legendW / 2).attr('y', 25).attr('text-anchor', 'middle').attr('font-weight', 'bold').attr('fill', textColor).attr('font-size', '12px').text(t.legend.title);

    types.forEach((type, i) => {
      const y = 50 + i * 25;
      const config = COMPONENT_CONFIG[type];
      let iconX = isRTL ? legendW - 25 : 25;
      let textX = isRTL ? legendW / 2 : 45;
      legendG.append('circle').attr('cx', iconX).attr('cy', y).attr('r', 8).attr('fill', isDark ? '#0f172a' : '#f8fafc').attr('stroke', config.color).attr('stroke-width', 1.5);
      const itemG = legendG.append('g').attr('transform', `translate(${iconX - 6}, ${y - 6})`);
      renderIcon(itemG, config.icon, config.color, 'scale(0.5)');
      legendG.append('text').attr('x', textX).attr('y', y).attr('dominant-baseline', 'middle').attr('fill', textColor).attr('font-size', '11px').attr('text-anchor', isRTL ? 'middle' : 'start').text(t.componentTypes[type]);
    });

    const sepY = 50 + types.length * 25 + 10;
    legendG.append('line').attr('x1', 20).attr('y1', sepY).attr('x2', legendW - 20).attr('y2', sepY).attr('stroke', secondaryTextColor).attr('stroke-width', 1).attr('opacity', 0.5);

    badgeItems.forEach((item, i) => {
        const y = sepY + 20 + i * 25;
        let iconX = isRTL ? legendW - 25 : 25;
        let textX = isRTL ? legendW / 2 : 45;
        legendG.append('rect').attr('x', iconX - 10).attr('y', y - 9).attr('width', 20).attr('height', 18).attr('rx', 9).attr('fill', isDark ? '#1e293b' : '#f1f5f9').attr('stroke', item.color).attr('stroke-width', 0.5);
        const itemG = legendG.append('g').attr('transform', `translate(${iconX - 6}, ${y - 6})`);
        renderIcon(itemG, item.icon, item.color, 'scale(0.5)');
        legendG.append('text').attr('x', textX).attr('y', y).attr('dominant-baseline', 'middle').attr('fill', textColor).attr('font-size', '11px').attr('text-anchor', isRTL ? 'middle' : 'start').text(item.label);
    });

    // Auto-fit diagram content to screen ONLY on initial mount or when orientation explicitly changes
    if (!hasInitialFitRef.current || prevOrientationRef.current !== orientation) {
      prevOrientationRef.current = orientation;
      requestAnimationFrame(() => {
        if (!svgRef.current || !zoomBehaviorRef.current) return;
        const svgEl = svgRef.current;
        const liveG = svgEl.querySelector('g');
        if (!liveG) return;
        try {
          const bbox = liveG.getBBox();
          if (bbox && bbox.width > 10 && bbox.height > 10) {
            const clientW = svgEl.clientWidth || dimensions.width || 800;
            const clientH = svgEl.clientHeight || dimensions.height || 600;
            const pad = 60;
            const scale = Math.max(0.15, Math.min(1.2, Math.min((clientW - pad * 2) / bbox.width, (clientH - pad * 2) / bbox.height)));
            const tx = (clientW - bbox.width * scale) / 2 - bbox.x * scale;
            const ty = (clientH - bbox.height * scale) / 2 - bbox.y * scale;
            const fitTransform = d3.zoomIdentity.translate(tx, ty).scale(scale);
            transformRef.current = fitTransform;
            d3.select(svgEl).call(zoomBehaviorRef.current.transform, fitTransform);
            hasInitialFitRef.current = true;
          }
        } catch (_) {}
      });
    }

  }, [
    data, dimensions, onNodeClick, onLinkClick, selectedNodeId, selectedLinkId, orientation, searchMatches,
    isConnectMode, connectionSourceId, t, language, theme, onBackgroundClick, multiSelection, isPrintMode,
    activeProject, onEditPrintSettings, onAddRoot, onAddGenerator, onDuplicateChild, onDeleteNode,
    onToggleCollapse, onGroupNode, onNodeMove, onDisconnectLink, isCleanView, activeFilters,
    isAnnotating, annotationColor, annotationWidth, annotationTool, isLayoutLocked, onDeleteAnnotation, onAnnotationAdd
  ]);

  const handleZoomIn = useCallback(() => {
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(250)
        .call(zoomBehaviorRef.current.scaleBy, 1.3);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(250)
        .call(zoomBehaviorRef.current.scaleBy, 0.77);
    }
  }, []);

  const handleResetZoom = useCallback(() => {
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(300)
        .call(zoomBehaviorRef.current.transform, d3.zoomIdentity.translate(150, 100).scale(1));
    }
  }, []);

  const handleFitDiagram = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current || !data || data.length === 0) return;
    const svgEl = svgRef.current;
    const liveG = svgEl.querySelector('g');
    if (!liveG) return;

    try {
      const bbox = liveG.getBBox();
      if (!bbox || bbox.width <= 0 || bbox.height <= 0) return;

      const clientW = svgEl.clientWidth || dimensions.width || 800;
      const clientH = svgEl.clientHeight || dimensions.height || 600;
      const pad = 60;

      const scale = Math.max(0.15, Math.min(1.4, Math.min((clientW - pad * 2) / bbox.width, (clientH - pad * 2) / bbox.height)));
      const tx = (clientW - bbox.width * scale) / 2 - bbox.x * scale;
      const ty = (clientH - bbox.height * scale) / 2 - bbox.y * scale;

      d3.select(svgEl)
        .transition()
        .duration(350)
        .call(zoomBehaviorRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    } catch (_) {}
  }, [data, dimensions]);

  return (
    <div ref={wrapperRef} className={`w-full h-full relative overflow-hidden ${isDark ? 'bg-slate-900' : 'bg-white'}`} style={{ touchAction: 'none' }}>
      <svg id="diagram-svg" ref={svgRef} width="100%" height="100%" className="block select-none" style={{ touchAction: 'none' }} />
      {showCanvasZoomControls !== false && (
        <CanvasZoomControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitDiagram={handleFitDiagram}
          onResetZoom={handleResetZoom}
          isLayoutLocked={isLayoutLocked}
          onToggleLayoutLocked={onToggleLayoutLocked}
          isAnnotating={isAnnotating}
          onToggleAnnotating={onToggleAnnotating}
          t={t}
          isRTL={isRTL}
        />
      )}
    </div>
  );
};
