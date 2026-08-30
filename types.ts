
export type DiagramOrientation = 'horizontal' | 'vertical' | 'orthogonal_vertical';

export enum ComponentType {
  SYSTEM_ROOT = 'SYSTEM_ROOT',
  TRANSFORMER = 'TRANSFORMER',
  METER = 'METER',
  DISTRIBUTION_BOARD = 'DISTRIBUTION_BOARD',
  BREAKER = 'BREAKER',
  SWITCH = 'SWITCH',
  LOAD = 'LOAD',
  GENERATOR = 'GENERATOR',
  UPS = 'UPS',
  BUSBAR = 'BUSBAR'
}

export interface ConnectionStyle {
  strokeColor?: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted' | 'dash-dot' | 'long-dash';
  lineType?: 'straight' | 'orthogonal'; // New: Choose between straight or 90-degree lines
  startMarker?: 'none' | 'arrow' | 'circle' | 'diamond';
  endMarker?: 'none' | 'arrow' | 'circle' | 'diamond';
  cableSize?: string; // Cable size text (e.g., "4x25mm")
}

export type NodeShape = 'rectangle' | 'circle' | 'square';

export interface ElectricalNode {
  id: string;
  name: string;
  componentNumber?: string;
  type: ComponentType;
  model?: string;
  amps?: number;
  voltage?: number; // Volts
  kva?: number; // Kilovolt-Amperes
  description?: string;
  
  // Location Info
  place?: string;
  building?: string;
  floor?: string;
  office?: string;

  // Appearance
  customColor?: string; // Stroke/Icon Color
  customBgColor?: string; // Background Fill Color
  shape?: NodeShape; // Visual shape: rectangle, circle, square
  customImage?: string; // Base64 string for custom icon

  // Meter Property
  hasMeter?: boolean;
  meterNumber?: string;
  meterModel?: string; // Meter Model
  meterSerial?: string; // Meter Serial Number
  isExcludedFromMeter?: boolean; // New: Not Connected to Meter
  
  // Generator Connection Property
  hasGeneratorConnection?: boolean;
  generatorName?: string;

  // Specific Attributes
  isAirConditioning?: boolean; // New: A/C Breaker
  isAirBreaker?: boolean; // Air Circuit Breaker (ACB / מפסק אוויר)
  isReserved?: boolean; // New: Reserved Breaker
  isEssential?: boolean; // New: Essential vs Non-Essential Component (Emergency load)
  hasMultimeter?: boolean; // New: Multimeter installed on the board
  multimeterModel?: string; // New: Multimeter Model
  multimeterSerial?: string; // New: Multimeter Serial Number
  isPublicBoard?: boolean; // New: Public board classification

  // Calculated Property (Recursive Load)
  calculatedLoad?: {
    amps: number;
    kva: number;
  };

  // Positioning (Offset from tree layout)
  manualX?: number;
  manualY?: number;

  children: ElectricalNode[];
  extraConnections?: string[]; // IDs of additional upstream parents (visual connections)
  connectionStyle?: ConnectionStyle; // Style of the link coming INTO this node
  isCollapsed?: boolean; // View state: Hide children
}

export interface NewNodeData {
  name: string;
  componentNumber?: string;
  type: ComponentType;
  model?: string;
  amps?: number;
  voltage?: number;
  kva?: number;
  description?: string;
  
  // Location Info
  place?: string;
  building?: string;
  floor?: string;
  office?: string;

  customColor?: string;
  customBgColor?: string;
  shape?: NodeShape;
  customImage?: string;
  hasMeter?: boolean;
  meterNumber?: string;
  meterModel?: string;
  meterSerial?: string;
  isExcludedFromMeter?: boolean;
  hasGeneratorConnection?: boolean;
  generatorName?: string;
  isAirConditioning?: boolean;
  isAirBreaker?: boolean;
  isReserved?: boolean;
  isEssential?: boolean;
  hasMultimeter?: boolean;
  multimeterModel?: string;
  multimeterSerial?: string;
  isPublicBoard?: boolean;
}

export interface AnnotationItem {
  id: string;
  path: string;
  color: string;
  width?: number;
  tool?: 'pen' | 'highlighter';
  createdAt?: string;
}

export type PalmRejectionMode = 'pen-only' | 'smart-palm' | 'touch-and-pen';

export interface Page {
  id: string;
  name: string;
  items: ElectricalNode[]; // Changed from rootNode to items array to support multiple disconnected trees
  annotations?: AnnotationItem[]; // Saved annotations for this page
}

export interface PrintMetadata {
  engineer: string;
  approvedBy: string;
  date: string;
  revision: string;
  organization: string;
}

export interface ProjectShareConfig {
  enabled: boolean; // whether link access is active or disabled
  shareToken?: string; // unique link token; revoking changes this token
  revokedAt?: string;
  expiresAt?: string; // optional ISO expiration date
  password?: string; // optional access passcode/PIN
  disabledReason?: string;
}

export interface Project {
  id: string;
  name: string;
  pages: Page[];
  printMetadata?: PrintMetadata;
  shareConfig?: ProjectShareConfig;
  lastUpdated?: string; // ISO timestamp of last modification
}

export interface AnalysisResult {
  status: 'safe' | 'warning' | 'danger';
  summary: string;
  issues: string[];
  recommendations: string[];
}

export interface VersionSnapshot {
  id: string;
  timestamp: string; // ISO string
  formattedTime: string;
  formattedDate: string;
  projects: Project[];
  activeProjectId?: string;
  activePageId?: string;
  activeProjectName: string;
  projectCount: number;
  pageCount: number;
  nodeCount: number;
  source: 'auto' | 'manual' | 'import';
  label?: string;
}

export type Language = 'en' | 'he' | 'ar';
export type Theme = 'light' | 'dark';

