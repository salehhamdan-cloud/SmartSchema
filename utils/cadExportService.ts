import Drawing from 'dxf-writer';
import { ComponentType, ElectricalNode, Page, Project } from '../types';

export interface CadExportOptions {
  clone: SVGSVGElement;
  minX: number;
  minY: number;
  width: number;
  height: number;
  activeProject?: Project | null;
  activePage?: Page | null;
  fileName: string;
}

/**
 * Converts non-ASCII characters to standard AutoCAD Unicode escape sequence \U+XXXX.
 * This guarantees that Hebrew, Arabic, Greek electrical symbols (Ω, µ, Ø, ², etc.)
 * are rendered natively and accurately in AutoCAD, DWG TrueView, and all CAD tools.
 */
function toAutoCADText(val: string): string {
  if (!val) return '';
  const cleaned = val.replace(/[\r\n\t]+/g, ' ').trim();
  return cleaned.replace(/[^\x20-\x7E]/g, (char) => {
    const code = char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
    return `\\U+${code}`;
  });
}

/**
 * Parses SVG path data (d attribute) into an array of continuous 2D polyline points.
 * Supports M, L, H, V, C (cubic bezier sampling), and Z.
 */
function parseSvgPathToPolylines(d: string): Array<Array<[number, number]>> {
  const polylines: Array<Array<[number, number]>> = [];
  let currentPolyline: Array<[number, number]> = [];
  let curX = 0;
  let curY = 0;

  const tokens = d.match(/([a-df-z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)/gi) || [];
  let i = 0;
  let cmd = '';

  while (i < tokens.length) {
    const token = tokens[i];
    if (/^[a-df-z]$/i.test(token)) {
      cmd = token;
      i++;
    }

    const isRel = cmd === cmd.toLowerCase();
    const type = cmd.toUpperCase();

    if (type === 'M') {
      if (currentPolyline.length > 1) {
        polylines.push(currentPolyline);
      }
      currentPolyline = [];
      const x = parseFloat(tokens[i++]);
      const y = parseFloat(tokens[i++]);
      curX = isRel ? curX + x : x;
      curY = isRel ? curY + y : y;
      currentPolyline.push([curX, curY]);
      cmd = isRel ? 'l' : 'L';
    } else if (type === 'L') {
      const x = parseFloat(tokens[i++]);
      const y = parseFloat(tokens[i++]);
      curX = isRel ? curX + x : x;
      curY = isRel ? curY + y : y;
      currentPolyline.push([curX, curY]);
    } else if (type === 'H') {
      const x = parseFloat(tokens[i++]);
      curX = isRel ? curX + x : x;
      currentPolyline.push([curX, curY]);
    } else if (type === 'V') {
      const y = parseFloat(tokens[i++]);
      curY = isRel ? curY + y : y;
      currentPolyline.push([curX, curY]);
    } else if (type === 'C') {
      const x1 = isRel ? curX + parseFloat(tokens[i++]) : parseFloat(tokens[i++]);
      const y1 = isRel ? curY + parseFloat(tokens[i++]) : parseFloat(tokens[i++]);
      const x2 = isRel ? curX + parseFloat(tokens[i++]) : parseFloat(tokens[i++]);
      const y2 = isRel ? curY + parseFloat(tokens[i++]) : parseFloat(tokens[i++]);
      const x = isRel ? curX + parseFloat(tokens[i++]) : parseFloat(tokens[i++]);
      const y = isRel ? curY + parseFloat(tokens[i++]) : parseFloat(tokens[i++]);

      const steps = 8;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const u = 1 - t;
        const bx = u * u * u * curX + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x;
        const by = u * u * u * curY + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y;
        currentPolyline.push([bx, by]);
      }
      curX = x;
      curY = y;
    } else if (type === 'Z') {
      if (currentPolyline.length > 0) {
        currentPolyline.push([...currentPolyline[0]]);
        polylines.push(currentPolyline);
        currentPolyline = [];
      }
    } else {
      i++;
    }
  }

  if (currentPolyline.length > 1) {
    polylines.push(currentPolyline);
  }

  return polylines;
}

/**
 * Exports the electrical diagram to a universal AutoCAD DXF (.dxf) file.
 * Compatible with AutoCAD, DWG TrueView, SolidWorks, Revit, LibreCAD, QCad, and all CAD programs.
 * Formats vector lines, component blocks, feeder cables, electrical annotations, and title block into CAD layers.
 */
export async function exportDiagramToCad(options: CadExportOptions): Promise<void> {
  const { clone, minX, minY, width, height, activeProject, activePage, fileName } = options;

  const d = new Drawing();
  d.setUnits('Millimeters');

  // Define Standard AutoCAD Color Index (ACI) Electrical Layers
  // ACI Colors: 1=Red, 2=Yellow, 3=Green, 4=Cyan, 5=Blue, 6=Magenta, 7=White
  d.addLayer('E-BORDER-FRAME', Drawing.ACI.WHITE, 'CONTINUOUS');
  d.addLayer('E-TITLE-BLOCK', Drawing.ACI.WHITE, 'CONTINUOUS');
  d.addLayer('E-TITLE-TEXT', Drawing.ACI.CYAN, 'CONTINUOUS');
  d.addLayer('E-BUSBAR-MAINS', Drawing.ACI.RED, 'CONTINUOUS');
  d.addLayer('E-PANELS-SUB', Drawing.ACI.CYAN, 'CONTINUOUS');
  d.addLayer('E-GENERATOR-SOURCES', Drawing.ACI.GREEN, 'CONTINUOUS');
  d.addLayer('E-CONSUMER-LOADS', Drawing.ACI.YELLOW, 'CONTINUOUS');
  d.addLayer('E-WIRES-FEEDERS', Drawing.ACI.CYAN, 'CONTINUOUS');
  d.addLayer('E-NODE-TEXT', Drawing.ACI.WHITE, 'CONTINUOUS');
  d.addLayer('E-SPECS-TEXT', Drawing.ACI.YELLOW, 'CONTINUOUS');
  d.addLayer('E-LEGEND', Drawing.ACI.WHITE, 'CONTINUOUS');
  d.addLayer('E-ANNOTATIONS', Drawing.ACI.MAGENTA, 'CONTINUOUS');

  const maxY = minY + height;

  // Coordinate mapping: Converts SVG coordinates (Y pointing down) to CAD ModelSpace (Y pointing up)
  const toCadX = (x: number) => Math.round((x - minX) * 10) / 10;
  const toCadY = (y: number) => Math.round((maxY - y) * 10) / 10;

  // 1. Draw Outer Sheet Border Frame
  d.setActiveLayer('E-BORDER-FRAME');
  const borderPad = 15;
  const frameX1 = borderPad;
  const frameY1 = borderPad;
  const frameX2 = width - borderPad;
  const frameY2 = height - borderPad;
  d.drawRect(frameX1, frameY1, frameX2, frameY2);
  d.drawRect(frameX1 + 4, frameY1 + 4, frameX2 - 4, frameY2 - 4);

  // 2. Export Feeder Links & Electrical Bus Connections
  d.setActiveLayer('E-WIRES-FEEDERS');
  clone.querySelectorAll('g.links path.link-visible, g.links path.link-extra, g.links path').forEach((pathEl) => {
    const dAttr = pathEl.getAttribute('d');
    if (!dAttr) return;

    const polylines = parseSvgPathToPolylines(dAttr);
    polylines.forEach((poly) => {
      if (poly.length < 2) return;
      const cadPts: Array<[number, number]> = poly.map(([px, py]) => [toCadX(px), toCadY(py)]);
      if (cadPts.length === 2) {
        d.drawLine(cadPts[0][0], cadPts[0][1], cadPts[1][0], cadPts[1][1]);
      } else {
        d.drawPolyline(cadPts);
      }
    });
  });

  // 3. Export Nodes (Switchboards, Panels, Generators, Transformers, Loads)
  clone.querySelectorAll('g.node').forEach((nodeEl) => {
    const transform = nodeEl.getAttribute('transform') || '';
    const match = /translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/.exec(transform);
    const tx = match ? (parseFloat(match[1]) || 0) : 0;
    const ty = match ? (parseFloat(match[2]) || 0) : 0;

    // Detect node layer based on classes, attributes or data
    const nodeClass = (nodeEl.getAttribute('class') || '') + ' ' + (nodeEl.innerHTML || '');
    let nodeLayer = 'E-PANELS-SUB';
    if (/SYSTEM_ROOT|root|transformer|main-switchboard/i.test(nodeClass)) {
      nodeLayer = 'E-BUSBAR-MAINS';
    } else if (/generator|solar|ups|source/i.test(nodeClass)) {
      nodeLayer = 'E-GENERATOR-SOURCES';
    } else if (/load|motor|socket|lighting|hvac|ev_charger/i.test(nodeClass)) {
      nodeLayer = 'E-CONSUMER-LOADS';
    }

    d.setActiveLayer(nodeLayer);

    const bg = nodeEl.querySelector('.node-bg, rect, circle') as SVGGraphicsElement;
    if (bg) {
      const tagName = bg.tagName.toLowerCase();
      if (tagName === 'circle') {
        const r = parseFloat(bg.getAttribute('r') || '40');
        const cx = tx + parseFloat(bg.getAttribute('cx') || '0');
        const cy = ty + parseFloat(bg.getAttribute('cy') || '0');
        d.drawCircle(toCadX(cx), toCadY(cy), r);
      } else {
        const rw = parseFloat(bg.getAttribute('width') || '160');
        const rh = parseFloat(bg.getAttribute('height') || '90');
        const rx = tx + parseFloat(bg.getAttribute('x') || '-80');
        const ry = ty + parseFloat(bg.getAttribute('y') || '-45');
        const cadX1 = toCadX(rx);
        const cadY1 = toCadY(ry + rh);
        const cadX2 = toCadX(rx + rw);
        const cadY2 = toCadY(ry);
        d.drawRect(cadX1, cadY1, cadX2, cadY2);
      }
    } else {
      // Default fallback component box
      const cadX1 = toCadX(tx - 80);
      const cadY1 = toCadY(ty + 45);
      const cadX2 = toCadX(tx + 80);
      const cadY2 = toCadY(ty - 45);
      d.drawRect(cadX1, cadY1, cadX2, cadY2);
    }

    // Export Node Texts
    nodeEl.querySelectorAll('text').forEach((txtEl) => {
      const rawText = txtEl.textContent?.trim();
      if (!rawText) return;

      const lx = tx + parseFloat(txtEl.getAttribute('x') || '0');
      const ly = ty + parseFloat(txtEl.getAttribute('y') || '0');
      const fontSize = parseFloat(txtEl.getAttribute('font-size') || '10');
      const isTitle = txtEl.classList.contains('node-title') || fontSize >= 12;

      d.setActiveLayer(isTitle ? 'E-NODE-TEXT' : 'E-SPECS-TEXT');
      const cadText = toAutoCADText(rawText);
      const anchor = txtEl.getAttribute('text-anchor') || 'start';
      const hAlign: 'left' | 'center' | 'right' = anchor === 'middle' ? 'center' : (anchor === 'end' ? 'right' : 'left');
      const textHeight = Math.max(isTitle ? 10 : 7, Math.round(fontSize * 0.8));

      d.drawText(toCadX(lx), toCadY(ly), textHeight, 0, cadText, hAlign, 'middle');
    });
  });

  // 4. Export Cable Badges and Labels
  d.setActiveLayer('E-SPECS-TEXT');
  clone.querySelectorAll('.labels g').forEach((lblG) => {
    const transform = lblG.getAttribute('transform') || '';
    const match = /translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/.exec(transform);
    const tx = match ? (parseFloat(match[1]) || 0) : 0;
    const ty = match ? (parseFloat(match[2]) || 0) : 0;

    const textEl = lblG.querySelector('text');
    if (textEl) {
      const text = textEl.textContent?.trim();
      if (text) {
        const cadText = toAutoCADText(text);
        d.drawText(toCadX(tx), toCadY(ty), 7, 0, cadText, 'center', 'middle');
      }
    }
  });

  // 5. Export Print Title Block (Project metadata, Editor, Organization, Dates, Revision)
  const printBlock = clone.querySelector('g.print-title-block');
  if (printBlock) {
    const transform = printBlock.getAttribute('transform') || '';
    const match = /translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/.exec(transform);
    const bx = match ? (parseFloat(match[1]) || 0) : 0;
    const by = match ? (parseFloat(match[2]) || 0) : 0;

    d.setActiveLayer('E-TITLE-BLOCK');
    printBlock.querySelectorAll('rect').forEach((rect) => {
      const rw = parseFloat(rect.getAttribute('width') || '0');
      const rh = parseFloat(rect.getAttribute('height') || '0');
      if (rw <= 0 || rh <= 0) return;
      const rx = bx + parseFloat(rect.getAttribute('x') || '0');
      const ry = by + parseFloat(rect.getAttribute('y') || '0');
      d.drawRect(toCadX(rx), toCadY(ry + rh), toCadX(rx + rw), toCadY(ry));
    });

    printBlock.querySelectorAll('line').forEach((line) => {
      const x1 = bx + parseFloat(line.getAttribute('x1') || '0');
      const y1 = by + parseFloat(line.getAttribute('y1') || '0');
      const x2 = bx + parseFloat(line.getAttribute('x2') || '0');
      const y2 = by + parseFloat(line.getAttribute('y2') || '0');
      d.drawLine(toCadX(x1), toCadY(y1), toCadX(x2), toCadY(y2));
    });

    d.setActiveLayer('E-TITLE-TEXT');
    printBlock.querySelectorAll('text').forEach((txtEl) => {
      const rawText = txtEl.textContent?.trim();
      if (!rawText) return;
      const tx = bx + parseFloat(txtEl.getAttribute('x') || '0');
      const ty = by + parseFloat(txtEl.getAttribute('y') || '0');
      const fontSize = parseFloat(txtEl.getAttribute('font-size') || '9');
      const anchor = txtEl.getAttribute('text-anchor') || 'start';
      const hAlign: 'left' | 'center' | 'right' = anchor === 'middle' ? 'center' : (anchor === 'end' ? 'right' : 'left');
      const cadText = toAutoCADText(rawText);
      const textHeight = Math.max(6, Math.round(fontSize * 0.85));

      d.drawText(toCadX(tx), toCadY(ty), textHeight, 0, cadText, hAlign, 'middle');
    });
  }

  // 6. Export Legend Group
  const legendGroup = clone.querySelector('g.legend-group');
  if (legendGroup) {
    const transform = legendGroup.getAttribute('transform') || '';
    const match = /translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/.exec(transform);
    const lx = match ? (parseFloat(match[1]) || 0) : 0;
    const ly = match ? (parseFloat(match[2]) || 0) : 0;

    d.setActiveLayer('E-LEGEND');
    legendGroup.querySelectorAll('rect').forEach((rect) => {
      const rw = parseFloat(rect.getAttribute('width') || '0');
      const rh = parseFloat(rect.getAttribute('height') || '0');
      if (rw <= 0 || rh <= 0) return;
      const rx = lx + parseFloat(rect.getAttribute('x') || '0');
      const ry = ly + parseFloat(rect.getAttribute('y') || '0');
      d.drawRect(toCadX(rx), toCadY(ry + rh), toCadX(rx + rw), toCadY(ry));
    });

    legendGroup.querySelectorAll('text').forEach((txtEl) => {
      const rawText = txtEl.textContent?.trim();
      if (!rawText) return;
      const tx = lx + parseFloat(txtEl.getAttribute('x') || '0');
      const ty = ly + parseFloat(txtEl.getAttribute('y') || '0');
      const fontSize = parseFloat(txtEl.getAttribute('font-size') || '9');
      const cadText = toAutoCADText(rawText);
      d.drawText(toCadX(tx), toCadY(ty), Math.max(6, Math.round(fontSize * 0.8)), 0, cadText, 'left', 'middle');
    });
  }

  // 7. Export Annotations (Sketches, Clouds, Freehand Lines)
  d.setActiveLayer('E-ANNOTATIONS');
  clone.querySelectorAll('g.annotations-layer path, path.annotation-path').forEach((pathEl) => {
    const dAttr = pathEl.getAttribute('d');
    if (!dAttr) return;
    const polylines = parseSvgPathToPolylines(dAttr);
    polylines.forEach((poly) => {
      if (poly.length < 2) return;
      const cadPts: Array<[number, number]> = poly.map(([px, py]) => [toCadX(px), toCadY(py)]);
      if (cadPts.length === 2) {
        d.drawLine(cadPts[0][0], cadPts[0][1], cadPts[1][0], cadPts[1][1]);
      } else {
        d.drawPolyline(cadPts);
      }
    });
  });

  // 8. Generate DXF Content String & Trigger File Download
  const dxfContent = d.toDxfString();
  const blob = new Blob([dxfContent], { type: 'application/dxf;charset=utf-8' });
  const downloadUrl = URL.createObjectURL(blob);

  const safeFileName = fileName.endsWith('.dxf') ? fileName : `${fileName}.dxf`;
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = safeFileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => {
    try {
      URL.revokeObjectURL(downloadUrl);
    } catch (_) {}
  }, 3000);
}
