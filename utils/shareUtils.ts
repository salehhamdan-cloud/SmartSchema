import LZString from 'lz-string';
import { Project, ElectricalNode, ComponentType } from '../types';

/**
 * Strips empty strings, undefineds, falsy defaults, and non-essential runtime fields
 * to compress project data to the absolute minimum size for URLs and QR codes.
 */
export function compactNodeForSharing(node: ElectricalNode): any {
  const result: any = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  if (node.componentNumber?.trim()) result.componentNumber = node.componentNumber.trim();
  if (node.model?.trim()) result.model = node.model.trim();
  if (node.amps !== undefined && node.amps !== null && node.amps > 0) result.amps = node.amps;
  if (node.voltage !== undefined && node.voltage !== null && node.voltage > 0) result.voltage = node.voltage;
  if (node.kva !== undefined && node.kva !== null && node.kva > 0) result.kva = node.kva;
  if (node.description?.trim()) result.description = node.description.trim();

  // Location fields
  if (node.place?.trim()) result.place = node.place.trim();
  if (node.building?.trim()) result.building = node.building.trim();
  if (node.floor?.trim()) result.floor = node.floor.trim();
  if (node.office?.trim()) result.office = node.office.trim();

  // Visual appearance
  if (node.customColor) result.customColor = node.customColor;
  if (node.customBgColor) result.customBgColor = node.customBgColor;
  if (node.shape && node.shape !== 'rectangle') result.shape = node.shape;

  // Meter attributes
  if (node.hasMeter) {
    result.hasMeter = true;
    if (node.meterNumber?.trim()) result.meterNumber = node.meterNumber.trim();
    if (node.meterModel?.trim()) result.meterModel = node.meterModel.trim();
    if (node.meterSerial?.trim()) result.meterSerial = node.meterSerial.trim();
  }
  if (node.isExcludedFromMeter) result.isExcludedFromMeter = true;

  // Generator attributes
  if (node.hasGeneratorConnection) {
    result.hasGeneratorConnection = true;
    if (node.generatorName?.trim()) result.generatorName = node.generatorName.trim();
  }

  // Flags (only stored if true)
  if (node.isAirConditioning) result.isAirConditioning = true;
  if (node.isReserved) result.isReserved = true;
  if (node.isEssential) result.isEssential = true;
  if (node.hasMultimeter) {
    result.hasMultimeter = true;
    if (node.multimeterModel?.trim()) result.multimeterModel = node.multimeterModel.trim();
    if (node.multimeterSerial?.trim()) result.multimeterSerial = node.multimeterSerial.trim();
  }
  if (node.isPublicBoard) result.isPublicBoard = true;
  if (node.hasTransferSwitch) {
    result.hasTransferSwitch = true;
    if (node.secondBreakerName?.trim()) result.secondBreakerName = node.secondBreakerName.trim();
    if (node.secondBreakerNumber?.trim()) result.secondBreakerNumber = node.secondBreakerNumber.trim();
    if (node.secondBreakerAmps !== undefined) result.secondBreakerAmps = node.secondBreakerAmps;
  }

  // Manual positioning offsets
  if (node.manualX) result.manualX = node.manualX;
  if (node.manualY) result.manualY = node.manualY;

  // Multi-parent connections
  if (node.extraConnections && node.extraConnections.length > 0) {
    result.extraConnections = node.extraConnections;
  }

  // Connection styling
  if (node.connectionStyle) {
    const cs = node.connectionStyle;
    const styleObj: any = {};
    if (cs.strokeColor) styleObj.strokeColor = cs.strokeColor;
    if (cs.lineStyle && cs.lineStyle !== 'solid') styleObj.lineStyle = cs.lineStyle;
    if (cs.lineType && cs.lineType !== 'straight') styleObj.lineType = cs.lineType;
    if (cs.startMarker && cs.startMarker !== 'none') styleObj.startMarker = cs.startMarker;
    if (cs.endMarker && cs.endMarker !== 'none') styleObj.endMarker = cs.endMarker;
    if (cs.cableSize?.trim()) styleObj.cableSize = cs.cableSize.trim();
    if (Object.keys(styleObj).length > 0) {
      result.connectionStyle = styleObj;
    }
  }

  if (node.isCollapsed) result.isCollapsed = true;

  // Recursive children
  if (node.children && node.children.length > 0) {
    result.children = node.children.map(compactNodeForSharing);
  } else {
    result.children = [];
  }

  return result;
}

/**
 * Compacts a full Project object for minimal serialization footprint.
 */
export function compactProjectForSharing(project: Project): any {
  return {
    id: project.id,
    name: project.name,
    shareConfig: project.shareConfig ? {
      enabled: project.shareConfig.enabled !== false,
      shareToken: project.shareConfig.shareToken,
      expiresAt: project.shareConfig.expiresAt,
      password: project.shareConfig.password,
      revokedAt: project.shareConfig.revokedAt,
    } : undefined,
    pages: project.pages.map(page => ({
      id: page.id,
      name: page.name,
      items: page.items.map(compactNodeForSharing)
    }))
  };
}

/**
 * Generates the clean view sharing URL and compressed payload.
 */
export function generateShareUrl(dataToExport: Project | Project[]): {
  viewOnlyUrl: string;
  compressedData: string;
  sizeKb: string;
} {
  let compactData: any;
  if (Array.isArray(dataToExport)) {
    compactData = dataToExport.map(compactProjectForSharing);
  } else {
    compactData = compactProjectForSharing(dataToExport);
  }

  const jsonString = JSON.stringify(compactData);
  const compressed = LZString.compressToEncodedURIComponent(jsonString);

  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const viewOnlyUrl = `${baseUrl}#view=1&clean=1&data=${compressed}`;
  const sizeKb = (new Blob([viewOnlyUrl]).size / 1024).toFixed(1);

  return {
    viewOnlyUrl,
    compressedData: compressed,
    sizeKb
  };
}
