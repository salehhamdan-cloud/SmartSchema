
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Diagram } from './components/Diagram';
import { InputPanel } from './components/InputPanel';
import { PrintSettingsPanel } from './components/PrintSettingsPanel';
import { AnalysisModal } from './components/AnalysisModal';
import { ConfirmationModal } from './components/ConfirmationModal';
import { ExportModal } from './components/ExportModal';
import { AboutModal } from './components/AboutModal';
import { ShareModal } from './components/ShareModal';
import { TopologyModal } from './components/TopologyModal';
import { BuildingFloorsModal } from './components/BuildingFloorsModal';
import { VersionHistoryModal } from './components/VersionHistoryModal';
import { AccessBlockedView } from './components/AccessBlockedView';
import { ReadOnlyInspector } from './components/ReadOnlyInspector';
import { CleanViewHeader } from './components/CleanViewHeader';
import { LegendIcon } from './components/LegendIcon';
import { AppLockScreen } from './components/AppLockScreen';
import { SecurityModal } from './components/SecurityModal';
import { FolderSyncModal } from './components/FolderSyncModal';
import { AnnotationToolbar } from './components/AnnotationToolbar';
import {
  FolderSyncSettings,
  getStoredFolderSettings,
  saveStoredFolderSettings,
  getDirectoryHandleFromDB,
  saveDirectoryHandleToDB,
  removeDirectoryHandleFromDB,
  verifyFolderPermission,
  scanProjectsInDirectory,
  writeProjectsToFolder,
  isFileSystemAccessSupported,
  isInsideIframe
} from './utils/folderStorageService';
import { ElectricalNode, NewNodeData, AnalysisResult, Project, Page, ComponentType, ConnectionStyle, PrintMetadata, DiagramOrientation, VersionSnapshot, AnnotationItem, PalmRejectionMode } from './types';
import { DEFAULT_PROJECT, DEFAULT_CONNECTION_STYLE, DEFAULT_PRINT_METADATA, COMPONENT_CONFIG } from './constants';
import { analyzeCircuit } from './services/geminiService';
import { translations } from './translations';
import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import * as XLSX from 'xlsx';
import LZString from 'lz-string';

type Language = 'en' | 'he' | 'ar';
type Theme = 'light' | 'dark';

// --- Helper Functions ---

const getRandomHexColor = (): string => {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
};

const generateId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

const findNodeInTree = (node: ElectricalNode, id: string): ElectricalNode | null => {
    if (node.id === id) return node;
    for (const child of node.children) {
        const found = findNodeInTree(child, id);
        if (found) return found;
    }
    return null;
};

const findNode = (roots: ElectricalNode[], id: string): ElectricalNode | null => {
  for (const root of roots) {
      if (root.id === id) return root;
      const found = findNodeInTree(root, id);
      if (found) return found;
  }
  return null;
};

const addNodeToTree = (currentNode: ElectricalNode, parentId: string, newNode: ElectricalNode): ElectricalNode => {
  if (currentNode.id === parentId) {
    return { ...currentNode, children: [...currentNode.children, newNode] };
  }
  return { ...currentNode, children: currentNode.children.map(child => addNodeToTree(child, parentId, newNode)) };
};

const editNodeInTree = (currentNode: ElectricalNode, nodeId: string, updatedData: Partial<ElectricalNode>): ElectricalNode => {
  if (currentNode.id === nodeId) {
    return { ...currentNode, ...updatedData };
  }
  return { ...currentNode, children: currentNode.children.map(child => editNodeInTree(child, nodeId, updatedData)) };
};

const addExtraConnectionToTree = (currentNode: ElectricalNode, nodeId: string, targetId: string): ElectricalNode => {
  if (currentNode.id === nodeId) {
      const currentExtras = currentNode.extraConnections || [];
      if (currentExtras.includes(targetId)) return currentNode;
      return { ...currentNode, extraConnections: [...currentExtras, targetId] };
  }
  return { ...currentNode, children: currentNode.children.map(child => addExtraConnectionToTree(child, nodeId, targetId)) };
};

const removeExtraConnectionFromTree = (currentNode: ElectricalNode, targetIdToRemove: string): ElectricalNode => {
    let newNode = { ...currentNode };
    if (newNode.extraConnections && newNode.extraConnections.includes(targetIdToRemove)) {
        newNode.extraConnections = newNode.extraConnections.filter(id => id !== targetIdToRemove);
    }
    newNode.children = newNode.children.map(child => removeExtraConnectionFromTree(child, targetIdToRemove));
    return newNode;
};

const deleteNodeInTree = (currentNode: ElectricalNode, nodeIdToDelete: string): ElectricalNode => {
   const isDirectChild = currentNode.children.some(child => child.id === nodeIdToDelete);
   if (isDirectChild) {
       return {
           ...currentNode,
           children: currentNode.children.filter(child => child.id !== nodeIdToDelete)
       };
   }
   return {
       ...currentNode,
       children: currentNode.children.map(child => deleteNodeInTree(child, nodeIdToDelete))
   };
};

const cloneNodeTree = (node: ElectricalNode): ElectricalNode => {
    const newId = generateId(String(node.type));
    return {
        ...node,
        id: newId,
        children: node.children.map(child => cloneNodeTree(child)),
        extraConnections: [] 
    };
};

const findNodeParent = (roots: ElectricalNode[], childId: string): ElectricalNode | null => {
  const findInNode = (n: ElectricalNode): ElectricalNode | null => {
    if (n.children.some(c => c.id === childId)) return n;
    for (const c of n.children) {
      const p = findInNode(c);
      if (p) return p;
    }
    return null;
  };
  for (const root of roots) {
    const found = findInNode(root);
    if (found) return found;
  }
  return null;
};

const getAllDescendantIds = (node: ElectricalNode): Set<string> => {
  const set = new Set<string>([node.id]);
  const traverse = (n: ElectricalNode) => {
    for (const c of n.children) {
      set.add(c.id);
      traverse(c);
    }
  };
  traverse(node);
  return set;
};

const getFlatNodeList = (nodes: ElectricalNode[]): ElectricalNode[] => {
  const result: ElectricalNode[] = [];
  const traverse = (n: ElectricalNode) => {
    result.push(n);
    for (const c of n.children) {
      traverse(c);
    }
  };
  nodes.forEach(traverse);
  return result;
};

const reparentNodeInPage = (
  page: Page, 
  nodeId: string, 
  newParentId: string | null
): Page => {
  const nodeToMove = findNode(page.items, nodeId);
  if (!nodeToMove) return page;

  // If reparenting to self or descendant, prevent it
  if (newParentId) {
    if (newParentId === nodeId) return page;
    const isDescendant = findNodeInTree(nodeToMove, newParentId);
    if (isDescendant) return page;
  }

  // 1. Remove node from previous location (its children subtree is kept intact on nodeToMove)
  const wasRoot = page.items.some(item => item.id === nodeId);
  let newItems: ElectricalNode[];
  if (wasRoot) {
    newItems = page.items.filter(item => item.id !== nodeId);
  } else {
    newItems = page.items.map(root => deleteNodeInTree(root, nodeId));
  }

  // 2. Attach node to new location
  if (!newParentId || newParentId === '__root__') {
    newItems.push({
      ...nodeToMove,
      manualX: 0,
      manualY: 0
    });
  } else {
    const targetParent = findNode(newItems, newParentId);
    let connectionColor = nodeToMove.connectionStyle?.strokeColor;
    if (targetParent && targetParent.children.length > 0 && targetParent.children[0].connectionStyle?.strokeColor) {
      connectionColor = targetParent.children[0].connectionStyle.strokeColor;
    }
    const updatedMovedNode: ElectricalNode = {
      ...nodeToMove,
      manualX: 0,
      manualY: 0,
      connectionStyle: {
        ...DEFAULT_CONNECTION_STYLE,
        ...nodeToMove.connectionStyle,
        strokeColor: connectionColor || getRandomHexColor()
      }
    };
    newItems = newItems.map(root => addNodeToTree(root, newParentId, updatedMovedNode));
  }

  return {
    ...page,
    items: newItems
  };
};

export default function App() {
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const savedData = localStorage.getItem('smartschema_data') || localStorage.getItem('voltgraph_data');
      let loadedProjects = savedData ? JSON.parse(savedData) : [DEFAULT_PROJECT];
      
      loadedProjects = loadedProjects.map((p: any) => ({
          ...p,
          lastUpdated: p.lastUpdated || new Date().toISOString(),
          pages: p.pages.map((page: any) => {
              if (page.rootNode && !page.items) {
                  return { ...page, items: [page.rootNode], rootNode: undefined };
              }
              return page;
          })
      }));
      
      return loadedProjects;
    } catch (e: any) {
      console.error("Failed to load data from local storage", e);
      return [DEFAULT_PROJECT];
    }
  });

  const [history, setHistory] = useState<Project[][]>([]);
  const [future, setFuture] = useState<Project[][]>([]);

  const [activeProjectId, setActiveProjectId] = useState<string>(projects[0].id);
  const [activePageId, setActivePageId] = useState<string>(projects[0].pages[0].id);
  
  const [selectedNode, setSelectedNode] = useState<ElectricalNode | null>(null);
  const [multiSelection, setMultiSelection] = useState<Set<string>>(new Set<string>());
  const [selectionMode, setSelectionMode] = useState<'node' | 'link'>('node');
  const [clipboard, setClipboard] = useState<ElectricalNode | null>(null);
  const [selectedLinkParentId, setSelectedLinkParentId] = useState<string | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [orientation, setOrientation] = useState<DiagramOrientation>('horizontal');
  const [showProjectSidebar, setShowProjectSidebar] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showTopologyModal, setShowTopologyModal] = useState(false);
  const [showBuildingFloorsModal, setShowBuildingFloorsModal] = useState(false);
  const [showVersionHistoryModal, setShowVersionHistoryModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [showFolderSyncModal, setShowFolderSyncModal] = useState(false);

  // Folder Auto-Save & Auto-Load State
  const [folderSettings, setFolderSettings] = useState<FolderSyncSettings>(() => getStoredFolderSettings());
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [folderSyncStatus, setFolderSyncStatus] = useState<'idle' | 'synced' | 'saving' | 'error' | 'permission_required'>('idle');

  // Permanent password protection: always prompts for master password on every visit/computer/tab load
  const [isAppUnlocked, setIsAppUnlocked] = useState<boolean>(false);

  const handleUnlock = () => {
    setIsAppUnlocked(true);
  };

  const handleLogOut = () => {
    setIsAppUnlocked(false);
    setShowSecurityModal(false);
  };
  const [versionHistory, setVersionHistory] = useState<VersionSnapshot[]>(() => {
    try {
      const saved = localStorage.getItem('smartschema_version_history') || localStorage.getItem('voltgraph_version_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, 10);
        }
      }
    } catch (e) {
      console.error("Failed to load version history from local storage", e);
    }
    return [];
  });
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [printSettingsFocus, setPrintSettingsFocus] = useState<string | undefined>(undefined);
  const [isCleanView, setIsCleanView] = useState(false);
  const [isLayoutLocked, setIsLayoutLocked] = useState(true);
  
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [showNavFilterDropdown, setShowNavFilterDropdown] = useState(false);
  const navFilterRef = useRef<HTMLDivElement>(null);

  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('smartschema_recent_searches') || localStorage.getItem('voltgraph_recent_searches');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, 5);
        }
      }
    } catch (_) {}
    return [];
  });
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [annotationColor, setAnnotationColor] = useState('#ef4444');
  const [annotationWidth, setAnnotationWidth] = useState(3);
  const [annotationTool, setAnnotationTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [palmRejectionMode, setPalmRejectionMode] = useState<PalmRejectionMode>('smart-palm');
  const [isStylusActive, setIsStylusActive] = useState(false);
  
  const [language, setLanguage] = useState<Language>('en');
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('smartschema_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    return 'light';
  });

  useEffect(() => {
    try {
      localStorage.setItem('smartschema_theme', theme);
    } catch {}
    if (theme === 'light') {
      document.documentElement.classList.add('theme-light');
      document.documentElement.classList.remove('theme-dark', 'dark');
      document.body.classList.add('theme-light');
      document.body.classList.remove('theme-dark', 'dark');
    } else {
      document.documentElement.classList.add('theme-dark', 'dark');
      document.documentElement.classList.remove('theme-light');
      document.body.classList.add('theme-dark', 'dark');
      document.body.classList.remove('theme-light');
    }
  }, [theme]);

  const [showAddIndependentMenu, setShowAddIndependentMenu] = useState(false);
  const addIndependentMenuRef = useRef<HTMLDivElement>(null);

  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  const t = translations[language] as any;
  const isRTL = language === 'he' || language === 'ar';
  const isDark = theme === 'dark';

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [showSaveToast, setShowSaveToast] = useState(false);

  const formatProjectTimestamp = useCallback((isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return '';
      const now = new Date();
      const diffMs = Math.max(0, now.getTime() - date.getTime());
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      const ts = t.projectTimestamps;
      if (diffMins < 1) return ts?.justNow || "Just now";
      if (diffMins < 60) return `${diffMins} ${ts?.minsAgo || "m ago"}`;
      if (diffHours < 24) return `${diffHours} ${ts?.hoursAgo || "h ago"}`;
      if (diffDays < 7) return `${diffDays} ${ts?.daysAgo || "d ago"}`;

      return date.toLocaleDateString(language === 'he' ? 'he-IL' : language === 'ar' ? 'ar-EG' : 'en-US', {
        month: 'short',
        day: 'numeric'
      });
    } catch (_) {
      return '';
    }
  }, [t, language]);

  const [isConnectMode, setIsConnectMode] = useState(false);
  const [connectionSource, setConnectionSource] = useState<ElectricalNode | null>(null);

  const [isReadOnly, setIsReadOnly] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareAccessStatus, setShareAccessStatus] = useState<'granted' | 'disabled' | 'revoked' | 'expired' | 'locked'>('granted');
  const [shareRequiredPasscode, setShareRequiredPasscode] = useState<string | undefined>(undefined);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpdateProject = useCallback((updatedProject: Project) => {
    const stamped = {
      ...updatedProject,
      lastUpdated: new Date().toISOString()
    };
    setProjects(prev => {
      const next = prev.map(p => p.id === updatedProject.id ? stamped : p);
      try {
        localStorage.setItem('smartschema_data', JSON.stringify(next));
      } catch (_) {}
      return next;
    });
  }, []);

  // Load shared project from URL Hash / Search parameters (GitHub Pages compatible)
  useEffect(() => {
    const parseUrlData = () => {
      try {
        const hash = window.location.hash || '';
        const search = window.location.search || '';
        const fullUrl = window.location.href || '';

        let dataParam = '';
        let viewModeRequested = false;

        // 1. Check Search Query Parameters (?view=1&clean=1&data=...)
        if (search) {
          const searchParams = new URLSearchParams(search.substring(1));
          if (searchParams.has('data')) dataParam = searchParams.get('data') || '';
          if (
            searchParams.get('view') === '1' ||
            searchParams.get('clean') === '1' ||
            searchParams.get('readonly') === 'true' ||
            searchParams.get('viewOnly') === 'true'
          ) {
            viewModeRequested = true;
          }
        }

        // 2. Check Hash Fragment (#view=1&clean=1&data=... or #data=...)
        if (hash) {
          const hashString = hash.startsWith('#') ? hash.substring(1) : hash;
          if (hashString.includes('=')) {
            const hashParams = new URLSearchParams(hashString);
            if (hashParams.has('data')) dataParam = hashParams.get('data') || '';
            if (
              hashParams.get('view') === '1' ||
              hashParams.get('clean') === '1' ||
              hashParams.get('readonly') === 'true' ||
              hashParams.get('viewOnly') === 'true' ||
              hashString.includes('view=1') ||
              hashString.includes('clean=1') ||
              hashString.startsWith('view')
            ) {
              viewModeRequested = true;
            }
          } else if (hashString === 'view' || hashString === 'clean' || hashString === 'readonly') {
            viewModeRequested = true;
          }
        }

        // Fallback regex scan for data parameter in case of unconventional encoding
        if (!dataParam) {
          const match = fullUrl.match(/[?&#]data=([^&#]+)/);
          if (match && match[1]) {
            dataParam = match[1];
          }
        }

        if (viewModeRequested) {
          setIsCleanView(true);
        }

        if (!dataParam) return;

        let decompressed: string | null = null;
        try {
          decompressed = LZString.decompressFromEncodedURIComponent(dataParam);
        } catch (_) {}

        if (!decompressed) {
          try {
            decompressed = LZString.decompressFromEncodedURIComponent(decodeURIComponent(dataParam));
          } catch (_) {}
        }
        if (!decompressed) {
          try {
            decompressed = LZString.decompressFromBase64(dataParam);
          } catch (_) {}
        }
        if (!decompressed) {
          try {
            decompressed = LZString.decompress(dataParam);
          } catch (_) {}
        }
        if (!decompressed) {
          try {
            decompressed = decodeURIComponent(dataParam);
          } catch (_) {}
        }

        if (decompressed) {
          const parsed = JSON.parse(decompressed);
          let loadedProjects: Project[] = [];
          if (Array.isArray(parsed)) {
            loadedProjects = parsed;
          } else if (parsed && parsed.pages) {
            loadedProjects = [parsed];
          }

          if (loadedProjects.length > 0) {
            const primary = loadedProjects[0];
            if (primary.shareConfig) {
              if (primary.shareConfig.enabled === false || primary.shareConfig.revokedAt) {
                setShareAccessStatus('disabled');
                return;
              } else if (primary.shareConfig.expiresAt && new Date(primary.shareConfig.expiresAt).getTime() < Date.now()) {
                setShareAccessStatus('expired');
                return;
              } else if (primary.shareConfig.password) {
                setShareRequiredPasscode(primary.shareConfig.password);
                setShareAccessStatus('locked');
              } else {
                setShareAccessStatus('granted');
              }
            } else {
              setShareAccessStatus('granted');
            }

            // Ensure backwards compatible structure
            loadedProjects = loadedProjects.map((p: any) => ({
              ...p,
              pages: (p.pages || []).map((page: any) => {
                if (page.rootNode && !page.items) {
                  return { ...page, items: [page.rootNode], rootNode: undefined };
                }
                return page;
              })
            }));

            setProjects(loadedProjects);
            setActiveProjectId(loadedProjects[0].id);
            setActivePageId(loadedProjects[0].pages[0]?.id || '');
            setIsReadOnly(true);
            setIsCleanView(true);
          }
        }
      } catch (err) {
        console.error("Error reading shared project from URL:", err);
      }
    };

    parseUrlData();
    window.addEventListener('hashchange', parseUrlData);
    return () => window.removeEventListener('hashchange', parseUrlData);
  }, []);

  // Handle outside clicks for dropdown menus (Filter, Tools, Settings, Add Independent)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (navFilterRef.current && !navFilterRef.current.contains(target)) {
        setShowNavFilterDropdown(false);
      }
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(target)) {
        setShowToolsMenu(false);
      }
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(target)) {
        setShowSettingsMenu(false);
      }
      if (addIndependentMenuRef.current && !addIndependentMenuRef.current.contains(target)) {
        setShowAddIndependentMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const cycleOrientation = () => {
    setOrientation(prev => {
      if (prev === 'horizontal') return 'vertical';
      if (prev === 'vertical') return 'orthogonal_vertical';
      return 'horizontal';
    });
  };

  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0];
  const activePage = activeProject.pages.find(p => p.id === activePageId) || activeProject.pages[0];

  const requestConfirmation = (title: string, message: string, action: () => void) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        action();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const updatePage = useCallback((updater: (page: Page) => Page) => {
      const nowIso = new Date().toISOString();
      setProjects(prevProjects => {
          return prevProjects.map(p => {
              if (p.id !== activeProjectId) return p;
              return {
                  ...p,
                  lastUpdated: nowIso,
                  pages: p.pages.map(page => {
                      if (page.id !== activePageId) return page;
                      return updater(page);
                  })
              };
          });
      });
  }, [activeProjectId, activePageId]);

  // Refs for annotations
  const annotationsRef = useRef<AnnotationItem[]>([]);
  annotationsRef.current = annotations;

  // Sync annotations only when activePage or project switches
  useEffect(() => {
    if (activePage) {
      setAnnotations(activePage.annotations || []);
    }
  }, [activePageId, activeProjectId]);

  const handleAnnotationAdd = useCallback((path: string, color: string, width: number = 3, tool: 'pen' | 'highlighter' = 'pen') => {
    const newAnnotation: AnnotationItem = {
      id: generateId('ant'),
      path,
      color,
      width,
      tool,
      createdAt: new Date().toISOString()
    };
    setAnnotations(prev => [...prev, newAnnotation]);
  }, []);

  const handleUpdateAnnotations = useCallback((updatedAnnotations: AnnotationItem[]) => {
    setAnnotations(updatedAnnotations);
  }, []);

  const handleDeleteAnnotation = useCallback((id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
  }, []);

  const handleUndoAnnotation = useCallback(() => {
    setAnnotations(prev => (prev.length === 0 ? prev : prev.slice(0, -1)));
  }, []);

  const handleClearAnnotations = useCallback(() => {
    setAnnotations([]);
  }, []);

  const handleSaveAnnotations = useCallback(() => {
    updatePage(page => ({
      ...page,
      annotations: annotationsRef.current
    }));
    setSaveStatus('saved');
    setShowSaveToast(true);
    setTimeout(() => setShowSaveToast(false), 2200);
  }, [updatePage]);
  
  const toggleFilter = (filterKey: string) => {
      setActiveFilters(prev => {
          const newSet = new Set(prev);
          if (newSet.has(filterKey)) {
              newSet.delete(filterKey);
          } else {
              newSet.add(filterKey);
          }
          return newSet;
      });
  };

  const saveToHistory = useCallback(() => {
    setHistory(prev => [...prev, JSON.parse(JSON.stringify(projects))]);
    setFuture([]);
  }, [projects]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];
    const newHistory = history.slice(0, -1);
    setFuture(prev => [JSON.parse(JSON.stringify(projects)), ...prev]);
    setProjects(previousState);
    setHistory(newHistory);
  }, [history, projects]);

  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    const nextState = future[0];
    const newFuture = future.slice(1);
    setHistory(prev => [...prev, JSON.parse(JSON.stringify(projects))]);
    setProjects(nextState);
    setFuture(newFuture);
  }, [future, projects]);

  const handleUpdatePrintMetadata = useCallback((metadata: PrintMetadata) => {
      const nowIso = new Date().toISOString();
      setProjects(prev => prev.map(p => {
          if (p.id !== activeProjectId) return p;
          return { ...p, printMetadata: metadata, lastUpdated: nowIso };
      }));
  }, [activeProjectId]);

  const handleUpdateProjectName = useCallback((name: string) => {
      const nowIso = new Date().toISOString();
      setProjects(prev => prev.map(p => {
          if (p.id !== activeProjectId) return p;
          return { ...p, name, lastUpdated: nowIso };
      }));
  }, [activeProjectId]);

  const handleCopy = useCallback(() => {
      if (selectedNode) {
          const freshNode = findNode(activePage.items, selectedNode.id);
          if (freshNode) {
              try {
                  const copy = JSON.parse(JSON.stringify(freshNode));
                  setClipboard(copy);
              } catch (e: any) {
                  console.error("Copy failed:", e);
              }
          }
      }
  }, [selectedNode, activePage.items]);

  const handlePaste = useCallback(() => {
      if (!clipboard) return;
      saveToHistory();
      
      const nodeToClone = clipboard as ElectricalNode;
      const newNode = cloneNodeTree(nodeToClone);
      newNode.name = `${newNode.name} (Copy)`;

      updatePage((page) => {
          if (selectedNode) {
              const parentNode = selectedNode as ElectricalNode;
              const items = page.items.map(root => addNodeToTree(root, parentNode.id, newNode));
              return { ...page, items };
          } else {
              return { ...page, items: [...page.items, newNode] };
          }
      });
  }, [clipboard, selectedNode, saveToHistory, updatePage]); 

  const executeBulkDelete = (idsToDelete: Set<string>) => {
      if (idsToDelete.size === 0) return;
      saveToHistory();

      updatePage((page) => {
          let newItems = page.items.filter(item => !idsToDelete.has(item.id));
          const filterChildren = (node: ElectricalNode): ElectricalNode => ({
              ...node,
              children: node.children
                  .filter(c => !idsToDelete.has(c.id))
                  .map(filterChildren)
          });
          newItems = newItems.map(filterChildren);
          const cleanConnections = (node: ElectricalNode): ElectricalNode => ({
              ...node,
              extraConnections: node.extraConnections?.filter(id => !idsToDelete.has(id)),
              children: node.children.map(cleanConnections)
          });
          newItems = newItems.map(cleanConnections);
          return { ...page, items: newItems };
      });

      setMultiSelection(new Set<string>());
      setSelectedNode(null);
      setIsConnectMode(false);
      setConnectionSource(null);
  };

  const executeDeleteNode = (node: ElectricalNode) => {
      saveToHistory(); 
      updatePage((page) => {
          let newItems;
          if (page.items.some(n => n.id === node.id)) {
              newItems = page.items.filter(n => n.id !== node.id);
          } else {
              newItems = page.items.map(root => deleteNodeInTree(root, node.id));
          }
          newItems = newItems.map(root => removeExtraConnectionFromTree(root, node.id));
          return { ...page, items: newItems };
      });
      if (selectedNode?.id === node.id) {
        setSelectedNode(null);
        setSelectionMode('node');
      }
      setIsConnectMode(false);
      setConnectionSource(null);
  };

  const handleDeleteNodeClick = useCallback((node?: ElectricalNode) => {
      const nodeToDelete = node || selectedNode;
      if (!nodeToDelete) return;
      requestConfirmation(`${t.dialogs.deleteNodeTitle}`, `${t.dialogs.deleteNode}`, () => executeDeleteNode(nodeToDelete));
  }, [selectedNode, t, executeDeleteNode]);

  const handleDisconnectLink = () => {
      if (!selectedNode || !selectedLinkParentId) return;
      const childId = selectedNode.id;
      const parentId = selectedLinkParentId;
      
      saveToHistory();
      
      updatePage((page) => {
          const child = findNode(page.items, childId);
          if (child && child.extraConnections?.includes(parentId)) {
              const removeExtra = (n: ElectricalNode): ElectricalNode => {
                  if (n.id === childId) {
                      return { ...n, extraConnections: n.extraConnections?.filter(id => id !== parentId) };
                  }
                  return { ...n, children: n.children.map(removeExtra) };
              };
              return { ...page, items: page.items.map(removeExtra) };
          }

          const freshChild = findNode(page.items, childId);
          if (!freshChild) return page;

          const newItemsWithRemoval = page.items.map(root => {
             const remove = (n: ElectricalNode): ElectricalNode => {
                 if (n.id === parentId) {
                     return { ...n, children: n.children.filter(c => c.id !== childId) };
                 }
                 return { ...n, children: n.children.map(remove) };
             };
             return remove(root);
          });

          return { ...page, items: [...newItemsWithRemoval, freshChild] };
      });

      setSelectedNode(null);
      setSelectedLinkParentId(null);
      setSelectionMode('node');
  };

  const handleLinkClick = (sourceId: string, targetId: string) => {
      const targetNode = findNode(activePage.items, targetId);
      if (targetNode) {
          setSelectedNode(targetNode);
          setSelectedLinkParentId(sourceId); 
          setSelectionMode('link');
          setMultiSelection(new Set<string>());
      }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (!isInput) {
          if (isCtrl && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            e.shiftKey ? handleRedo() : handleUndo();
          }
          if (isCtrl && e.key.toLowerCase() === 'y') {
              e.preventDefault();
              handleRedo();
          }
          
          if (e.key === 'Delete' || e.key === 'Backspace') {
             if (multiSelection.size > 0) {
                 if(window.confirm(`${t.dialogs.deleteNode}`)) { 
                     executeBulkDelete(multiSelection);
                 }
             } else if (selectedNode) {
                 if(window.confirm(`${t.dialogs.deleteNode}`)) {
                    executeDeleteNode(selectedNode);
                 }
             }
          }

          if (isCtrl && e.key.toLowerCase() === 'c') {
              e.preventDefault();
              handleCopy();
          }
          
          if (isCtrl && e.key.toLowerCase() === 'v') {
              e.preventDefault();
              handlePaste();
          }

          if (e.key === 'Escape') {
              e.preventDefault();
              if (isCleanView) {
                  setIsCleanView(false);
              } else {
                  setSelectionMode('node');
                  setSelectedNode(null);
                  setMultiSelection(new Set<string>());
                  setIsConnectMode(false);
                  setConnectionSource(null);
              }
          }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
      selectedNode, 
      multiSelection, 
      clipboard, 
      handleUndo, 
      handleRedo, 
      handleCopy, 
      handlePaste, 
      t, 
      isCleanView
  ]); 

  const countTotalNodesInProjects = useCallback((projectList: Project[]): number => {
    let count = 0;
    const scan = (node: ElectricalNode) => {
      count++;
      if (node.children) node.children.forEach(scan);
    };
    projectList.forEach(p => {
      p.pages.forEach(pg => {
        pg.items.forEach(scan);
      });
    });
    return count;
  }, []);

  const createSnapshotObject = useCallback((
    projectList: Project[],
    sourceType: 'auto' | 'manual' | 'import' = 'auto',
    customLabel?: string
  ): VersionSnapshot => {
    const now = new Date();
    const currentProj = projectList.find(p => p.id === activeProjectId) || projectList[0];
    const totalNodes = countTotalNodesInProjects(projectList);
    const totalPages = projectList.reduce((acc, p) => acc + p.pages.length, 0);

    return {
      id: `snap_${now.getTime()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: now.toISOString(),
      formattedTime: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      formattedDate: now.toLocaleDateString(language === 'he' ? 'he-IL' : language === 'ar' ? 'ar-EG' : 'en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      projects: JSON.parse(JSON.stringify(projectList)),
      activeProjectId: currentProj?.id,
      activePageId: currentProj?.pages[0]?.id,
      activeProjectName: currentProj?.name || 'Untitled Project',
      projectCount: projectList.length,
      pageCount: totalPages,
      nodeCount: totalNodes,
      source: sourceType,
      label: customLabel
    };
  }, [activeProjectId, language, countTotalNodesInProjects]);

  const handleCreateManualSnapshot = useCallback((customLabel?: string) => {
    const newSnapshot = createSnapshotObject(projects, 'manual', customLabel);
    setVersionHistory(prev => {
      const updated = [newSnapshot, ...prev].slice(0, 10);
      try {
        localStorage.setItem('smartschema_version_history', JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });
    setShowSaveToast(true);
    setTimeout(() => setShowSaveToast(false), 2000);
  }, [projects, createSnapshotObject]);

  const handleRevertSnapshot = useCallback((snapshot: VersionSnapshot) => {
    // 1. Save current project to undo history first so user can Undo if desired
    saveToHistory();

    // 2. Clone projects from the snapshot
    const restoredProjects: Project[] = JSON.parse(JSON.stringify(snapshot.projects));
    setProjects(restoredProjects);

    // 3. Match and restore active project & active page
    const targetProject = restoredProjects.find(p => p.id === snapshot.activeProjectId) || restoredProjects[0];
    if (targetProject) {
      setActiveProjectId(targetProject.id);
      const targetPage = targetProject.pages.find(pg => pg.id === snapshot.activePageId) || targetProject.pages[0];
      if (targetPage) {
        setActivePageId(targetPage.id);
      }
    }

    setSelectedNode(null);
    setMultiSelection(new Set());
    setSelectionMode('node');

    // 4. Force persist the restored state immediately
    try {
      localStorage.setItem('smartschema_data', JSON.stringify(restoredProjects));
    } catch (_) {}

    const nowFormatted = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLastSavedTime(nowFormatted);
    setSaveStatus('saved');
  }, [saveToHistory]);

  const handleDeleteSnapshot = useCallback((snapshotId: string) => {
    setVersionHistory(prev => {
      const updated = prev.filter(s => s.id !== snapshotId);
      try {
        localStorage.setItem('smartschema_version_history', JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });
  }, []);

  const handleClearVersionHistory = useCallback(() => {
    setVersionHistory([]);
    try {
      localStorage.removeItem('smartschema_version_history');
    } catch (_) {}
  }, []);

  // Update folder settings in state and persist to storage
  const handleUpdateFolderSettings = useCallback((newSettings: Partial<FolderSyncSettings>) => {
    setFolderSettings(prev => {
      const updated = { ...prev, ...newSettings };
      saveStoredFolderSettings(updated);
      return updated;
    });
  }, []);

  // Startup Effect: Restore DirectoryHandle from IndexedDB & perform Auto-Load if enabled
  useEffect(() => {
    let isMounted = true;
    async function initFolderSync() {
      try {
        const handle = await getDirectoryHandleFromDB();
        if (handle && isMounted) {
          setDirectoryHandle(handle);
          setFolderSettings(prev => {
            const updated = { ...prev, folderName: handle.name };
            saveStoredFolderSettings(updated);
            return updated;
          });

          // Check if auto-load on start is enabled
          const currentSettings = getStoredFolderSettings();
          if (currentSettings.autoLoadOnStart) {
            const hasPerm = await verifyFolderPermission(handle, false);
            if (hasPerm) {
              const scanRes = await scanProjectsInDirectory(handle);
              if (scanRes.success && scanRes.projectsFound.length > 0 && isMounted) {
                const autoLoaded: Project[] = [];
                scanRes.projectsFound.forEach(dp => {
                  dp.projects.forEach(p => {
                    if (!autoLoaded.some(ep => ep.id === p.id)) {
                      autoLoaded.push(p);
                    }
                  });
                });
                if (autoLoaded.length > 0) {
                  setProjects(prev => {
                    const merged = [...prev];
                    autoLoaded.forEach(lp => {
                      const idx = merged.findIndex(m => m.id === lp.id);
                      if (idx >= 0) {
                        merged[idx] = lp;
                      } else {
                        merged.push(lp);
                      }
                    });
                    return merged;
                  });
                  setFolderSyncStatus('synced');
                }
              }
            } else {
              setFolderSyncStatus('permission_required');
            }
          }
        }
      } catch (err) {
        console.error("Failed to restore folder handle on startup", err);
      }
    }
    initFolderSync();
    return () => { isMounted = false; };
  }, []);

  // Choose / Select Directory via native browser File System Access API
  const handleSelectFolderDirectory = useCallback(async () => {
    if (!isFileSystemAccessSupported()) {
      throw new Error("File System Access API is not supported in this browser. You can use standard folder import.");
    }
    if (isInsideIframe()) {
      throw new Error("Cross-origin preview iframe detected. Direct disk auto-save requires opening the app in a standalone tab, or using the folder loader below.");
    }
    try {
      // @ts-ignore
      const handle: FileSystemDirectoryHandle = await window.showDirectoryPicker({
        id: 'smartschema_folder_sync',
        mode: 'readwrite',
        startIn: 'documents'
      });
      if (!handle) return;

      await saveDirectoryHandleToDB(handle);
      setDirectoryHandle(handle);
      handleUpdateFolderSettings({ enabled: true, folderName: handle.name, lastSyncStatus: 'synced' });
      setFolderSyncStatus('saving');

      // Immediate write of current projects to newly selected folder
      const writeRes = await writeProjectsToFolder(handle, projects, { saveWorkspaceBundle: true, saveIndividualProjects: true });
      if (writeRes.success) {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setFolderSyncStatus('synced');
        handleUpdateFolderSettings({ lastSavedTime: timeStr, lastSyncStatus: 'synced' });
      } else {
        setFolderSyncStatus('error');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (err.message && (err.message.includes('Cross origin') || err.message.includes('sub frames'))) {
        throw new Error("Browser security restricts direct disk access inside preview iframes. Click 'Open in Dedicated Tab' to auto-save directly to your folder.");
      }
      throw err;
    }
  }, [handleUpdateFolderSettings, projects]);

  // Disconnect connected folder
  const handleDisconnectFolder = useCallback(async () => {
    await removeDirectoryHandleFromDB();
    setDirectoryHandle(null);
    handleUpdateFolderSettings({ enabled: false, folderName: '', lastSyncStatus: 'idle' });
    setFolderSyncStatus('idle');
  }, [handleUpdateFolderSettings]);

  // Save current projects now to folder
  const handleManualSaveToFolder = useCallback(async (): Promise<boolean> => {
    if (!directoryHandle) return false;
    setFolderSyncStatus('saving');
    const writeRes = await writeProjectsToFolder(directoryHandle, projects, { saveWorkspaceBundle: true, saveIndividualProjects: true });
    if (writeRes.success) {
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setFolderSyncStatus('synced');
      handleUpdateFolderSettings({ lastSavedTime: timeStr, lastSyncStatus: 'synced' });
      return true;
    } else {
      setFolderSyncStatus('error');
      return false;
    }
  }, [directoryHandle, projects, handleUpdateFolderSettings]);

  // Load / Merge projects from folder into workspace
  const handleLoadProjectsFromFolder = useCallback((projectsToLoad: Project[], mode: 'merge' | 'replace') => {
    if (!projectsToLoad || projectsToLoad.length === 0) return;

    if (mode === 'replace') {
      setProjects(projectsToLoad);
      setActiveProjectId(projectsToLoad[0].id);
      setActivePageId(projectsToLoad[0].pages[0]?.id || '');
    } else {
      setProjects(prev => {
        const merged = [...prev];
        projectsToLoad.forEach(lp => {
          const idx = merged.findIndex(m => m.id === lp.id);
          if (idx >= 0) {
            merged[idx] = lp;
          } else {
            merged.push(lp);
          }
        });
        return merged;
      });
      // Switch active if current active project doesn't exist
      if (!projects.some(p => p.id === activeProjectId)) {
        setActiveProjectId(projectsToLoad[0].id);
        setActivePageId(projectsToLoad[0].pages[0]?.id || '');
      }
    }
  }, [projects, activeProjectId]);

  // Main Auto-Save Effect (Local Storage + Local Folder)
  useEffect(() => {
    if (isReadOnly || isAnnotating) {
      if (isReadOnly) setSaveStatus('saved');
      return;
    }
    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        const serialized = JSON.stringify(projects);
        localStorage.setItem('smartschema_data', serialized);
        setSaveStatus('saved');
        const nowFormatted = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastSavedTime(nowFormatted);

        // Auto-Save directly to connected local folder if enabled
        if (folderSettings.enabled && directoryHandle) {
          try {
            setFolderSyncStatus('saving');
            const writeResult = await writeProjectsToFolder(directoryHandle, projects, {
              saveWorkspaceBundle: true,
              saveIndividualProjects: true
            });
            if (writeResult.success) {
              setFolderSyncStatus('synced');
              handleUpdateFolderSettings({ lastSavedTime: nowFormatted, lastSyncStatus: 'synced' });
            } else {
              setFolderSyncStatus('error');
            }
          } catch (folderErr) {
            console.error("Folder auto-save error:", folderErr);
            setFolderSyncStatus('error');
          }
        }

        // Maintain Version History Array (limited to the last 10 saves)
        setVersionHistory(prev => {
          if (prev.length > 0) {
            try {
              const latestJson = JSON.stringify(prev[0].projects);
              if (latestJson === serialized) {
                return prev;
              }
            } catch (_) {}
          }

          const newSnapshot = createSnapshotObject(projects, 'auto');
          const updated = [newSnapshot, ...prev].slice(0, 10);
          try {
            localStorage.setItem('smartschema_version_history', JSON.stringify(updated));
          } catch (_) {}
          return updated;
        });
      } catch (e: any) {
        setSaveStatus('unsaved');
      }
    }, 1000); 
    return () => {
      clearTimeout(timer);
    };
  }, [projects, isReadOnly, isAnnotating, createSnapshotObject, folderSettings.enabled, directoryHandle, handleUpdateFolderSettings]);

  useEffect(() => {
      document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
      document.documentElement.lang = language;
  }, [isRTL, language]);

  const getRandomHexColor = () => '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');

  const handleBackgroundClick = () => {
    setSelectedNode(null);
    setSelectionMode('node');
    setMultiSelection(new Set<string>());
    setIsConnectMode(false);
    setConnectionSource(null);
    setShowAddIndependentMenu(false);
  };

  const handleConnectNodes = (inputChildId: string, inputParentId: string) => {
      if (inputChildId === inputParentId) return;
      let childId = inputChildId;
      let parentId = inputParentId;
      const childNode = findNode(activePage.items, childId);
      const parentNode = findNode(activePage.items, parentId);
      if (!childNode || !parentNode) return;
      const isChildSourceType = childNode.type === ComponentType.GENERATOR || childNode.type === ComponentType.SYSTEM_ROOT;
      const isParentSourceType = parentNode.type === ComponentType.GENERATOR || parentNode.type === ComponentType.SYSTEM_ROOT;
      const isChildRoot = activePage.items.some(root => root.id === childId);
      if (isChildRoot && isChildSourceType && !isParentSourceType) {
          const temp = childId;
          childId = parentId;
          parentId = temp;
      }
      const targetChildNode = findNode(activePage.items, childId);
      if (!targetChildNode) return;
      const isTargetChildRoot = activePage.items.some(root => root.id === childId);
      saveToHistory();
      updatePage((page) => {
          if (isTargetChildRoot) {
              let items = [...page.items];
              let movedNodeData = targetChildNode;
              items = items.filter(item => item.id !== childId);
              const newParent = findNode(items, parentId);
              const connectionColor = (newParent && newParent.children.length > 0)
                  ? newParent.children[0].connectionStyle?.strokeColor
                  : getRandomHexColor();
              const updatedNode = {
                  ...movedNodeData,
                  connectionStyle: { ...movedNodeData.connectionStyle, strokeColor: connectionColor }
              };
              items = items.map(root => addNodeToTree(root, parentId, updatedNode));
              return { ...page, items };
          } 
          else {
              if (targetChildNode.extraConnections?.includes(parentId)) return page;
              if (targetChildNode.children.some(c => c.id === parentId)) {
                  alert(`${t.dialogs.cycle}`);
                  return page;
              }
              const items = page.items.map(root => addExtraConnectionToTree(root, childId, parentId));
              return { ...page, items };
          }
      });
  };

  const handleNodeClick = (node: ElectricalNode, isShiftKey: boolean) => {
    if (isCleanView) return;

    if (isConnectMode) {
        if (!connectionSource) {
            setConnectionSource(node); 
        } else {
            if (connectionSource && node.id === connectionSource.id) {
                setConnectionSource(null);
                return;
            }
            if (connectionSource) {
                handleConnectNodes(connectionSource.id, node.id);
            }
            setConnectionSource(null);
            setIsConnectMode(false);
        }
    } else {
        if (isShiftKey) {
            setMultiSelection(prev => {
                const newSet = new Set<string>(prev);
                if (newSet.has(node.id)) newSet.delete(node.id);
                else newSet.add(node.id);
                if (newSet.size === 1) {
                    const id = Array.from(newSet)[0];
                    if (typeof id === 'string') {
                        const singleNode = findNode(activePage.items, id);
                        if(singleNode) setSelectedNode(singleNode);
                    }
                } else {
                    setSelectedNode(null);
                }
                return newSet;
            });
        } else {
            setSelectedNode(node);
            setMultiSelection(new Set<string>([node.id]));
            setSelectionMode('node');
        }
    }
  };

  const handleDetachNode = (nodeId: string) => {
      if(confirm(`${t.dialogs.detach}`)) {
          saveToHistory();
          updatePage((page) => {
             const node = findNode(page.items, nodeId);
             if (!node) return page;
             let items = page.items.map(root => deleteNodeInTree(root, nodeId));
             items.push(node);
             return { ...page, items };
          });
      }
  };

  const handleStartConnection = (nodeId: string) => {
      const node = findNode(activePage.items, nodeId);
      if (node) {
          setConnectionSource(node);
          setIsConnectMode(true);
      }
  };

  const handleNavigateToNode = (nodeId: string) => {
      const node = findNode(activePage.items, nodeId);
      if (node) {
          setSelectedNode(node);
          setMultiSelection(new Set<string>([node.id]));
          setSelectionMode('node');
      }
  };

  const handleAddIndependentNode = (type: ComponentType) => {
      saveToHistory();
      setShowAddIndependentMenu(false);
      let name = t.componentTypes[type] as string;
      let desc = 'Independent Node';
      switch(type) {
          case ComponentType.SYSTEM_ROOT: desc = t.defaultDesc.grid; break;
          case ComponentType.GENERATOR: desc = t.defaultDesc.gen; break;
          case ComponentType.TRANSFORMER: desc = t.defaultDesc.trans; break;
          case ComponentType.BUSBAR: desc = t.defaultDesc.busbar || 'Main Busbar Trunking'; break;
          case ComponentType.LOAD: desc = t.defaultDesc.load; break;
          case ComponentType.UPS: desc = t.defaultDesc.ups; break;
      }
      const newNode: ElectricalNode = {
        id: generateId(String(type).toLowerCase()),
        name: name,
        type: type,
        description: desc,
        children: [],
        extraConnections: [],
        isCollapsed: false,
        connectionStyle: DEFAULT_CONNECTION_STYLE,
        manualX: 0,
        manualY: 0,
        place: '',
        building: '',
        floor: ''
      };
      updatePage((page) => ({
          ...page,
          items: [...page.items, newNode]
      }));
  };

  const handleAddNode = (data: NewNodeData) => {
    if (!selectedNode) return;
    saveToHistory();
    updatePage((page) => {
        const currentParentNode = findNode(page.items, selectedNode.id) || selectedNode;
        let connectionColor = getRandomHexColor();
        if (currentParentNode.children && currentParentNode.children.length > 0) {
            const siblingStyle = currentParentNode.children[0].connectionStyle;
            if (siblingStyle && siblingStyle.strokeColor) {
                connectionColor = siblingStyle.strokeColor;
            }
        }
        const newNode: ElectricalNode = {
            id: generateId(String(data.type)),
            name: data.name || String(data.type),
            type: data.type,
            componentNumber: data.componentNumber,
            model: data.model,
            amps: data.amps,
            voltage: data.voltage,
            kva: data.kva,
            description: data.description,
            place: data.place,
            building: data.building,
            floor: data.floor,
            office: data.office,
            customColor: data.customColor,
            customBgColor: data.customBgColor,
            shape: data.shape,
            customImage: data.customImage,
            hasMeter: data.hasMeter,
            meterNumber: data.meterNumber || data.meterSerial,
            meterModel: data.meterModel,
            meterSerial: data.meterSerial || data.meterNumber,
            isExcludedFromMeter: data.isExcludedFromMeter,
            hasGeneratorConnection: data.hasGeneratorConnection,
            generatorName: data.generatorName,
            isAirConditioning: data.isAirConditioning,
            isAirBreaker: data.isAirBreaker,
            isReserved: data.isReserved,
            isEssential: data.isEssential,
            hasMultimeter: data.hasMultimeter,
            multimeterModel: data.multimeterModel,
            multimeterSerial: data.multimeterSerial,
            isPublicBoard: data.isPublicBoard,
            hasTransferSwitch: data.hasTransferSwitch,
            secondBreakerName: data.secondBreakerName,
            secondBreakerNumber: data.secondBreakerNumber,
            secondBreakerAmps: data.secondBreakerAmps,
            children: [],
            extraConnections: [],
            connectionStyle: { ...DEFAULT_CONNECTION_STYLE, strokeColor: connectionColor },
            isCollapsed: false
        };
        const items = page.items.map(root => addNodeToTree(root, selectedNode.id, newNode));
        return { ...page, items };
    });
  };

  const handleAddDuplicatedChild = (node: ElectricalNode) => {
      saveToHistory();
       let connectionColor = getRandomHexColor();
       const findParent = (n: ElectricalNode, childId: string): ElectricalNode | null => {
           if (n.children.some(c => c.id === childId)) return n;
           for (const c of n.children) {
               const p = findParent(c, childId);
               if (p) return p;
           }
           return null;
       };
       let parent = null;
       for(const root of activePage.items) {
           parent = findParent(root, node.id);
           if(parent) break;
       }
       if (parent && parent.children.length > 0) {
            const siblingStyle = parent.children[0].connectionStyle;
            if(siblingStyle?.strokeColor) connectionColor = siblingStyle.strokeColor;
       }
      updatePage((page) => {
          const newNode: ElectricalNode = {
              ...node,
              id: generateId(String(node.type)),
              name: `${node.name} Copy`,
              children: [], 
              extraConnections: [],
              connectionStyle: { ...DEFAULT_CONNECTION_STYLE, strokeColor: connectionColor },
              isCollapsed: false
          };
          const items = page.items.map(root => addNodeToTree(root, node.id, newNode));
          return { ...page, items };
      });
  };

  const handleEditNode = (data: NewNodeData, newParentId?: string | null) => {
    if (!selectedNode) return;
    saveToHistory();
    updatePage((page) => {
        let items = page.items.map(root => editNodeInTree(root, selectedNode.id, {
            name: data.name || selectedNode.name,
            componentNumber: data.componentNumber,
            type: data.type,
            model: data.model,
            amps: data.amps,
            voltage: data.voltage,
            kva: data.kva,
            description: data.description,
            place: data.place,
            building: data.building,
            floor: data.floor,
            office: data.office,
            customColor: data.customColor,
            customBgColor: data.customBgColor,
            hasMeter: data.hasMeter,
            meterNumber: data.meterNumber || data.meterSerial,
            meterModel: data.meterModel,
            meterSerial: data.meterSerial || data.meterNumber,
            hasGeneratorConnection: data.hasGeneratorConnection,
            generatorName: data.generatorName,
            isExcludedFromMeter: data.isExcludedFromMeter,
            isAirConditioning: data.isAirConditioning,
            isAirBreaker: data.isAirBreaker,
            isReserved: data.isReserved,
            isEssential: data.isEssential,
            hasMultimeter: data.hasMultimeter,
            multimeterModel: data.multimeterModel,
            multimeterSerial: data.multimeterSerial,
            isPublicBoard: data.isPublicBoard,
            hasTransferSwitch: data.hasTransferSwitch,
            secondBreakerName: data.secondBreakerName,
            secondBreakerNumber: data.secondBreakerNumber,
            secondBreakerAmps: data.secondBreakerAmps,
            shape: data.shape,
            customImage: data.customImage
        }));

        let updatedPage: Page = { ...page, items };

        // If newParentId is provided and changed from current parent, reparent the entire subtree
        if (newParentId !== undefined) {
            const currentParent = findNodeParent(page.items, selectedNode.id);
            const currentParentId = currentParent ? currentParent.id : '__root__';
            const targetParentId = (!newParentId || newParentId === '__root__') ? '__root__' : newParentId;
            
            if (targetParentId !== currentParentId) {
                updatedPage = reparentNodeInPage(updatedPage, selectedNode.id, targetParentId === '__root__' ? null : targetParentId);
            }
        }

        const newNode = findNode(updatedPage.items, selectedNode.id);
        if (newNode) setSelectedNode(newNode);
        return updatedPage;
    });
  };

  const handleReparentNode = (nodeId: string, newParentId: string | null) => {
    saveToHistory();
    updatePage((page) => {
      const updatedPage = reparentNodeInPage(page, nodeId, newParentId);
      const newNode = findNode(updatedPage.items, nodeId);
      if (newNode && selectedNode?.id === nodeId) {
        setSelectedNode(newNode);
      }
      return updatedPage;
    });
  };

  const handleBulkEdit = (updates: Partial<NewNodeData>) => {
      saveToHistory();
      updatePage((page) => {
          let items = page.items;
          multiSelection.forEach(id => {
              items = items.map(root => editNodeInTree(root, id, updates));
          });
          return { ...page, items };
      });
  };

  const updateNodeConnectionStyle = (newStyle: ConnectionStyle) => {
      if (!selectedNode) return;
      saveToHistory();
      updatePage((page) => {
          const items = page.items.map(root => editNodeInTree(root, selectedNode.id, {
              connectionStyle: newStyle
          }));
          return { ...page, items };
      });
  };

  const handleNodeMove = (updates: {id: string, x: number, y: number}[]) => {
      saveToHistory();
      const updateMap = new Map(updates.map(u => [u.id, u]));
      updatePage((page) => {
          const updateTree = (node: ElectricalNode): ElectricalNode => {
              const update = updateMap.get(node.id);
              let newNode = node;
              if (update) {
                  newNode = { ...node, manualX: update.x, manualY: update.y };
              }
              return {
                  ...newNode,
                  children: newNode.children.map(updateTree)
              };
          };
          return { ...page, items: page.items.map(updateTree) };
      });
  };

  const handleToggleCollapse = (node: ElectricalNode) => {
      saveToHistory();
      updatePage((page) => {
         const items = page.items.map(root => editNodeInTree(root, node.id, {
             isCollapsed: !node.isCollapsed
         }));
         return { ...page, items };
      });
  };

  const handleGroupNode = (nodeToGroup: ElectricalNode) => {
      if (nodeToGroup.type === ComponentType.SYSTEM_ROOT) return;
      saveToHistory();
      updatePage((page) => {
          const newGroupId = `GROUP-${Date.now()}`;
          const groupNode: ElectricalNode = {
              id: newGroupId,
              name: 'New Group',
              type: ComponentType.DISTRIBUTION_BOARD,
              description: 'Grouped Components',
              children: [nodeToGroup],
              extraConnections: [],
              connectionStyle: nodeToGroup.connectionStyle,
              isCollapsed: false,
              place: nodeToGroup.place,
              building: nodeToGroup.building,
              floor: nodeToGroup.floor
          };
          const replaceNodeInTree = (current: ElectricalNode, targetId: string, replacement: ElectricalNode): ElectricalNode => {
            if (current.children.some(c => c.id === targetId)) {
                return { ...current, children: current.children.map(c => c.id === targetId ? replacement : c) };
            }
            return { ...current, children: current.children.map(c => replaceNodeInTree(c, targetId, replacement)) };
          };
          const items = page.items.map(root => replaceNodeInTree(root, nodeToGroup.id, groupNode));
          return { ...page, items };
      });
  };

  const handleAnalyze = async () => {
    if (activePage.items.length === 0) {
        alert("Diagram not found.");
        return;
    }
    setShowAnalysis(true);
    setIsAnalyzing(true);
    setAnalysisResult(null);
    try {
      const result = await analyzeCircuit(activePage.items);
      setAnalysisResult(result);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getFullSVGString = (): { clone: SVGSVGElement; svgString: string; width: number; height: number; minX: number; minY: number } | null => {
      const svgElement = document.getElementById('diagram-svg') as unknown as SVGSVGElement;
      if (!svgElement) return null;

      const liveGroup = svgElement.querySelector('g') as SVGGElement;
      if (!liveGroup) return null;

      // 1. Calculate exhaustive bounding box across all diagram nodes, branches, links, labels, print block, and legend
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      // Check native getBBox first if available
      try {
          const liveBbox = liveGroup.getBBox();
          if (liveBbox && isFinite(liveBbox.x) && isFinite(liveBbox.y) && liveBbox.width > 10 && liveBbox.height > 10) {
              minX = liveBbox.x;
              minY = liveBbox.y;
              maxX = liveBbox.x + liveBbox.width;
              maxY = liveBbox.y + liveBbox.height;
          }
      } catch (_) {}

      // (A) Check all nodes in the diagram to expand bounding box
      liveGroup.querySelectorAll('g.node').forEach((nodeEl) => {
          try {
              const transform = (nodeEl as SVGGElement).getAttribute('transform') || '';
              const match = /translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/.exec(transform);
              if (!match) return;
              const tx = parseFloat(match[1]) || 0;
              const ty = parseFloat(match[2]) || 0;

              const bg = nodeEl.querySelector('.node-bg, rect, circle') as SVGGraphicsElement;
              if (bg) {
                  if (bg.tagName.toLowerCase() === 'circle') {
                      const r = parseFloat(bg.getAttribute('r') || '40');
                      const cx = parseFloat(bg.getAttribute('cx') || '0');
                      const cy = parseFloat(bg.getAttribute('cy') || '0');
                      minX = Math.min(minX, tx + cx - r);
                      maxX = Math.max(maxX, tx + cx + r);
                      minY = Math.min(minY, ty + cy - r);
                      maxY = Math.max(maxY, ty + cy + r);
                  } else {
                      const rx = parseFloat(bg.getAttribute('x') || '-80');
                      const ry = parseFloat(bg.getAttribute('y') || '-45');
                      const rw = parseFloat(bg.getAttribute('width') || '160');
                      const rh = parseFloat(bg.getAttribute('height') || '90');
                      minX = Math.min(minX, tx + rx);
                      maxX = Math.max(maxX, tx + rx + rw);
                      minY = Math.min(minY, ty + ry);
                      maxY = Math.max(maxY, ty + ry + rh);
                  }
              } else {
                  minX = Math.min(minX, tx - 80);
                  maxX = Math.max(maxX, tx + 80);
                  minY = Math.min(minY, ty - 45);
                  maxY = Math.max(maxY, ty + 45);
              }
          } catch (e) {}
      });

      // (B) Check legend group
      const legendGroup = liveGroup.querySelector('g.legend-group');
      if (legendGroup) {
          try {
              const transform = legendGroup.getAttribute('transform') || '';
              const match = /translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/.exec(transform);
              if (match) {
                  const lx = parseFloat(match[1]) || 0;
                  const ly = parseFloat(match[2]) || 0;
                  const rect = legendGroup.querySelector('rect');
                  const lw = rect ? parseFloat(rect.getAttribute('width') || '200') : 200;
                  const lh = rect ? parseFloat(rect.getAttribute('height') || '400') : 400;
                  minX = Math.min(minX, lx);
                  maxX = Math.max(maxX, lx + lw);
                  minY = Math.min(minY, ly);
                  maxY = Math.max(maxY, ly + lh);
              }
          } catch (e) {}
      }

      // (C) Check print title block
      const printBlock = liveGroup.querySelector('g.print-title-block');
      if (printBlock) {
          try {
              const transform = printBlock.getAttribute('transform') || '';
              const match = /translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/.exec(transform);
              if (match) {
                  const px = parseFloat(match[1]) || 0;
                  const py = parseFloat(match[2]) || 0;
                  minX = Math.min(minX, px);
                  maxX = Math.max(maxX, px + 500);
                  minY = Math.min(minY, py);
                  maxY = Math.max(maxY, py + 100);
              }
          } catch (e) {}
      }

      // (D) Check cable label badges
      liveGroup.querySelectorAll('.labels g').forEach((lblG) => {
          try {
              const transform = lblG.getAttribute('transform') || '';
              const match = /translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/.exec(transform);
              if (match) {
                  const lx = parseFloat(match[1]) || 0;
                  const ly = parseFloat(match[2]) || 0;
                  minX = Math.min(minX, lx - 40);
                  maxX = Math.max(maxX, lx + 40);
                  minY = Math.min(minY, ly - 40);
                  maxY = Math.max(maxY, ly + 40);
              }
          } catch (e) {}
      });

      // (E) Check links and annotation paths
      liveGroup.querySelectorAll('g.annotations-layer path, path.temp-drawing, g.links path').forEach((pathEl) => {
          try {
              const dAttr = pathEl.getAttribute('d');
              if (dAttr) {
                  const coordMatches = dAttr.matchAll(/([-\d.]+)[,\s]+([-\d.]+)/g);
                  for (const cm of coordMatches) {
                      const px = parseFloat(cm[1]);
                      const py = parseFloat(cm[2]);
                      if (isFinite(px) && isFinite(py)) {
                          minX = Math.min(minX, px);
                          maxX = Math.max(maxX, px);
                          minY = Math.min(minY, py);
                          maxY = Math.max(maxY, py);
                      }
                  }
              }
          } catch (e) {}
      });

      if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY) || maxX <= minX || maxY <= minY) {
          minX = 0;
          minY = 0;
          maxX = 1000;
          maxY = 700;
      }

      // Add generous margin around the schematic so no labels, shadows or badges touch the edge
      const padding = 80;
      const width = Math.max(Math.ceil(maxX - minX + padding * 2), 600);
      const height = Math.max(Math.ceil(maxY - minY + padding * 2), 400);
      const finalMinX = Math.floor(minX - padding);
      const finalMinY = Math.floor(minY - padding);

      // 2. Clone the SVG to manipulate it
      const clone = svgElement.cloneNode(true) as SVGSVGElement;
      const cloneGroup = clone.querySelector('g');
      if (!cloneGroup) return null;

      // 3. Clear user view transformations (zoom/pan) so coordinates match local coordinate space
      cloneGroup.setAttribute('transform', 'translate(0,0) scale(1)');

      // 4. Remove temporary/UI elements that shouldn't be in the export
      clone.querySelectorAll('.action-buttons, .temp-drawing, .print-layout-edit-btn, .link-hit, .eraser-surface, .eraser-visual-cursor, .draw-surface').forEach(el => el.remove());
      clone.querySelectorAll('text').forEach(el => {
          if (el.style.visibility === 'hidden' || el.getAttribute('visibility') === 'hidden') {
              el.remove();
          }
      });

      // 4b. Configure Hebrew & Arabic typography and text direction for standalone SVG & Canvas rendering
      const rtlRegex = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
      const multilingualFontFamily = "'Cairo', 'Heebo', 'Rubik', 'Noto Sans Arabic', 'Noto Sans Hebrew', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Segoe UI Arabic', 'Tahoma', Arial, sans-serif";
      
      clone.querySelectorAll('text, tspan').forEach(el => {
          const text = el.textContent || '';
          if (rtlRegex.test(text)) {
              el.setAttribute('direction', 'rtl');
              el.setAttribute('unicode-bidi', 'isolate');
              (el as SVGElement).style.direction = 'rtl';
              (el as SVGElement).style.unicodeBidi = 'isolate';
          }
          (el as SVGElement).style.fontFamily = multilingualFontFamily;

          // Preserve text centering and vertical alignment on component badges
          if (el.classList.contains('badge-text') || el.closest('.component-badge')) {
              el.setAttribute('text-anchor', 'middle');
              el.setAttribute('dominant-baseline', 'central');
              (el as SVGElement).style.textAnchor = 'middle';
              (el as SVGElement).style.dominantBaseline = 'central';
          }
      });

      // Strip style attribute from SVG clone to remove any patterns or touch-action that break canvas rasterization
      clone.removeAttribute('style');
      clone.style.backgroundColor = isDark ? '#0f172a' : '#ffffff';

      // 5. Finalize SVG attributes
      clone.setAttribute('width', width.toString());
      clone.setAttribute('height', height.toString());
      clone.setAttribute('viewBox', `${finalMinX} ${finalMinY} ${width} ${height}`);
      clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

      // 6. Embed solid background rectangle behind all content
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('x', finalMinX.toString());
      bgRect.setAttribute('y', finalMinY.toString());
      bgRect.setAttribute('width', width.toString());
      bgRect.setAttribute('height', height.toString());
      bgRect.setAttribute('fill', isDark ? '#0f172a' : '#ffffff');
      cloneGroup.insertBefore(bgRect, cloneGroup.firstChild);

      // 7. Embed self-contained styles with Unicode Hebrew and Arabic font family stack and webfont imports
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.textContent = `
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&family=Heebo:wght@400;500;600;700&family=Rubik:wght@400;500;600;700&display=swap');
          text { 
              font-family: 'Cairo', 'Heebo', 'Rubik', 'Noto Sans Arabic', 'Noto Sans Hebrew', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Segoe UI Arabic', 'Tahoma', Arial, sans-serif;
              text-rendering: geometricPrecision;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
          }
          text[direction="rtl"] {
              direction: rtl;
              unicode-bidi: isolate;
          }
          text.badge-text, .component-badge text {
              text-anchor: middle !important;
              dominant-baseline: central !important;
          }
          .node text { pointer-events: none; }
          .node-bg { transition: none !important; shape-rendering: geometricPrecision; }
          path { shape-rendering: geometricPrecision; }
          line { shape-rendering: geometricPrecision; }
          circle { shape-rendering: geometricPrecision; }
          rect { shape-rendering: geometricPrecision; }
      `;
      clone.insertBefore(style, clone.firstChild);

      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(clone);

      // Fix missing namespaces for standalone viewer compatibility
      if(!svgString.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)){
          svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      if(!svgString.match(/^<svg[^>]+xmlns\:xlink="http\:\/\/www\.w3\.org\/1999\/xlink"/)){
          svgString = svgString.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
      }

      return { clone, svgString, width, height, minX: finalMinX, minY: finalMinY };
  };

  const svgToCanvas = async (svgElement: SVGSVGElement, finalMinX: number, finalMinY: number, width: number, height: number, customScale?: number): Promise<HTMLCanvasElement> => {
      if (document.fonts && document.fonts.ready) {
          try {
              await document.fonts.ready;
          } catch (_) {}
      }
      return new Promise((resolve, reject) => {
          const maxDim = Math.max(width, height);
          let scale = customScale || 3.0;
          
          if (maxDim * scale > 6144) {
              scale = 6144 / maxDim;
          }
          scale = Math.max(1.5, Math.min(4.0, scale));

          const canvasWidth = Math.max(100, Math.round(width * scale));
          const canvasHeight = Math.max(100, Math.round(height * scale));

          const exportSvg = svgElement.cloneNode(true) as SVGSVGElement;
          exportSvg.removeAttribute('style');
          exportSvg.style.backgroundColor = isDark ? '#0f172a' : '#ffffff';
          exportSvg.setAttribute('width', canvasWidth.toString());
          exportSvg.setAttribute('height', canvasHeight.toString());
          exportSvg.setAttribute('viewBox', `${finalMinX} ${finalMinY} ${width} ${height}`);
          exportSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          exportSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

          const serializer = new XMLSerializer();
          let svgString = serializer.serializeToString(exportSvg);

          if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
              svgString = svgString.replace(/<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
          }
          if (!svgString.includes('xmlns:xlink="http://www.w3.org/1999/xlink"')) {
              svgString = svgString.replace(/<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
          }

          const canvas = document.createElement('canvas');
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;
          const ctx = canvas.getContext('2d', { alpha: false });
          if (!ctx) {
              reject(new Error('Canvas 2D context unavailable'));
              return;
          }

          const dataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
          const img = new Image();

          let resolved = false;
          const renderToCanvas = () => {
              if (resolved) return;
              resolved = true;
              try {
                  ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  ctx.imageSmoothingEnabled = true;
                  ctx.imageSmoothingQuality = 'high';
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  resolve(canvas);
              } catch (drawErr) {
                  reject(drawErr);
              }
          };

          img.onload = async () => {
              if ('decode' in img) {
                  try {
                      await img.decode();
                  } catch (_) {}
              }
              renderToCanvas();
          };

          img.onerror = () => {
              try {
                  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                  const blobUrl = URL.createObjectURL(blob);
                  const fallbackImg = new Image();
                  fallbackImg.onload = async () => {
                      try {
                          if ('decode' in fallbackImg) {
                              try { await fallbackImg.decode(); } catch (_) {}
                          }
                          ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
                          ctx.fillRect(0, 0, canvas.width, canvas.height);
                          ctx.drawImage(fallbackImg, 0, 0, canvas.width, canvas.height);
                          URL.revokeObjectURL(blobUrl);
                          resolve(canvas);
                      } catch (err) {
                          URL.revokeObjectURL(blobUrl);
                          reject(err);
                      }
                  };
                  fallbackImg.onerror = () => {
                      URL.revokeObjectURL(blobUrl);
                      reject(new Error('Failed to render SVG diagram to canvas image'));
                  };
                  fallbackImg.src = blobUrl;
              } catch (blobErr) {
                  reject(new Error('Failed to render SVG diagram to canvas image'));
              }
          };

          img.src = dataUri;
      });
  };

  const triggerDownload = (href: string, name: string) => {
      const downloadLink = document.createElement("a");
      downloadLink.href = href;
      downloadLink.download = name;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
  };

  const handleBackupAll = () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projects, null, 2));
      const date = new Date().toISOString().slice(0, 10);
      triggerDownload(dataStr, `SmartSchema_FullBackup_${date}.json`);
  };

  const handleDownloadProject = (project: Project) => {
      const safeName = project.name.trim().replace(/[^\w\u0590-\u05FF\u0600-\u06FF\s-]/g, '_');
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project, null, 2));
      triggerDownload(dataStr, `${safeName}_ProjectBackup.json`);
  };

  const handleExport = async (format: 'svg' | 'png' | 'json' | 'excel' | 'pdf' | 'raster-pdf') => {
      const safeProjectName = activeProject.name.trim().replace(/[^\w\u0590-\u05FF\u0600-\u06FF\s-]/g, '_');
      const safePageName = activePage.name.trim().replace(/[^\w\u0590-\u05FF\u0600-\u06FF\s-]/g, '_');
      const baseFileName = `${safeProjectName} - ${safePageName}`;
      
      if (format === 'json') {
          const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeProject, null, 2));
          triggerDownload(dataStr, `${baseFileName}.json`);
          setShowExportModal(false);
          return;
      }
      
      if (format === 'excel') {
          interface HierarchyItem {
              node: ElectricalNode;
              parent: ElectricalNode | null;
              depth: number;
              path: string[];
              branchIndex: number;
          }

          const flattenedTree: HierarchyItem[] = [];
          const parentsMap = new Map<string, ElectricalNode>();

          const traverse = (node: ElectricalNode, parent: ElectricalNode | null, depth: number, currentPath: string[], branchIdx: number) => {
              const fullPath = [...currentPath, node.name];
              flattenedTree.push({
                  node,
                  parent,
                  depth,
                  path: fullPath,
                  branchIndex: branchIdx
              });

              if (node.children && node.children.length > 0) {
                  parentsMap.set(node.id, node);
                  node.children.forEach((child, idx) => {
                      traverse(child, node, depth + 1, fullPath, idx + 1);
                  });
              }
          };

          activePage.items.forEach((root, rIdx) => {
              traverse(root, null, 0, [], rIdx + 1);
          });

          // 1. Sheet 1: Main Inventory with rich Father-to-Son linkages & Tree visualization
          const sheet1Data: any[] = [];
          
          flattenedTree.forEach(item => {
              const { node, parent, depth, path } = item;
              
              const matchesFilter = 
                  activeFilters.size === 0 ||
                  (activeFilters.has('meter') && node.hasMeter) || 
                  (activeFilters.has('generator') && node.hasGeneratorConnection) ||
                  (activeFilters.has('no-meter') && node.isExcludedFromMeter) ||
                  (activeFilters.has('ac') && node.isAirConditioning) ||
                  (activeFilters.has('reserved') && node.isReserved) ||
                  (activeFilters.has('essential') && node.isEssential) ||
                  (activeFilters.has('non-essential') && node.isEssential === false) ||
                  (activeFilters.has('multimeter') && node.hasMultimeter) ||
                  (activeFilters.has('publicBoard') && node.isPublicBoard) ||
                  (activeFilters.has('transferSwitch') && node.hasTransferSwitch) ||
                  (activeFilters.has(node.type));

              if (!matchesFilter) return;

              const parentName = parent ? parent.name : (t.csvHeaders.rootSource || 'Utility Grid (Root)');
              const parentType = parent ? (t.componentTypes[parent.type] || parent.type) : (t.csvHeaders.na || 'N/A');
              const parentNum = parent ? (parent.componentNumber || '') : '';
              const feederCable = node.connectionStyle?.cableSize || '-';
              
              let treeDisplay = '';
              if (depth === 0) {
                  treeDisplay = `⚡ [${t.csvHeaders.rootSource || 'Root'}] ${node.name}`;
              } else {
                  const isLeaf = !node.children || node.children.length === 0;
                  const branchIcon = isLeaf ? '🔌 ' : '📂 ';
                  treeDisplay = `${'   '.repeat(depth)}└── ${branchIcon}${node.name}`;
              }

              const specialFlags: string[] = [];
              if (node.isAirConditioning) specialFlags.push(t.legend.ac || 'A/C Breaker');
              if (node.isReserved) specialFlags.push(t.legend.reserved || 'Reserved');
              if (node.isExcludedFromMeter) specialFlags.push(t.legend.noMeter || 'No Meter');
              if (node.hasMultimeter) {
                  const mmDetails = [node.multimeterModel, node.multimeterSerial].filter(Boolean).join(' / ');
                  specialFlags.push(mmDetails ? `${t.legend.multimeter || 'Multimeter'} (${mmDetails})` : (t.legend.multimeter || 'Multimeter'));
              }
              if (node.isPublicBoard) specialFlags.push(t.legend.publicBoard || 'Public Board');
              if (node.hasTransferSwitch) {
                  const atsDetails = [
                    node.secondBreakerName,
                    node.secondBreakerNumber ? `#${node.secondBreakerNumber}` : '',
                    node.secondBreakerAmps !== undefined ? `${node.secondBreakerAmps}A` : ''
                  ].filter(Boolean).join(' • ');
                  specialFlags.push(atsDetails ? `${t.legend.transferSwitch || 'ATS'} (${atsDetails})` : (t.legend.transferSwitch || 'ATS'));
              }

              const row: Record<string, any> = {
                  [t.csvHeaders.hierarchyTree]: treeDisplay,
                  [t.csvHeaders.fatherName]: parentName,
                  [t.csvHeaders.fatherType]: parentType,
                  [t.csvHeaders.sonName]: node.name,
                  [t.csvHeaders.sonType]: t.componentTypes[node.type] || node.type,
                  [t.csvHeaders.branchNum]: item.branchIndex > 0 ? `#${item.branchIndex}` : '-',
                  [t.csvHeaders.feederCable]: feederCable,
                  [t.csvHeaders.level]: `${t.csvHeaders.level} ${depth}`,
                  [t.csvHeaders.amps]: node.amps !== undefined && node.amps !== null ? node.amps : '',
                  [t.csvHeaders.voltage]: node.voltage !== undefined && node.voltage !== null ? node.voltage : '',
                  [t.csvHeaders.kva]: node.kva !== undefined && node.kva !== null ? node.kva : '',
                  [t.csvHeaders.calcAmps]: node.calculatedLoad ? Number(node.calculatedLoad.amps.toFixed(1)) : '',
                  [t.csvHeaders.calcKva]: node.calculatedLoad ? Number(node.calculatedLoad.kva.toFixed(1)) : '',
                  [t.csvHeaders.directSonsCount]: node.children ? node.children.length : 0,
                  [t.csvHeaders.directSonsList]: node.children && node.children.length > 0 ? node.children.map(c => c.name).join(', ') : '-',
                  [t.csvHeaders.upstreamLineage]: path.join(' ➔ '),
                  [t.csvHeaders.isEssential]: node.isEssential ? (t.csvHeaders.essential || t.csvHeaders.yes) : (t.csvHeaders.nonEssential || t.csvHeaders.no),
                  [t.csvHeaders.hasMeter]: node.hasMeter ? t.csvHeaders.yes : t.csvHeaders.no,
                  [t.csvHeaders.meterNum]: node.meterSerial || node.meterNumber || '',
                  [t.csvHeaders.meterModel || 'Meter Model']: node.meterModel || '',
                  [t.csvHeaders.meterSerial || 'Meter Serial #']: node.meterSerial || node.meterNumber || '',
                  [t.csvHeaders.hasMultimeter || 'Has Multimeter']: node.hasMultimeter ? t.csvHeaders.yes : t.csvHeaders.no,
                  [t.csvHeaders.multimeterModel || 'Multimeter Model']: node.multimeterModel || '',
                  [t.csvHeaders.multimeterSerial || 'Multimeter Serial #']: node.multimeterSerial || '',
                  [t.csvHeaders.hasTransferSwitch || 'Transfer Switch (ATS)']: node.hasTransferSwitch ? t.csvHeaders.yes : t.csvHeaders.no,
                  [t.csvHeaders.secondBreakerName || 'Second Breaker Name']: node.secondBreakerName || '',
                  [t.csvHeaders.secondBreakerNumber || 'Second Breaker #']: node.secondBreakerNumber || '',
                  [t.csvHeaders.secondBreakerAmps || 'Second Breaker Current (A)']: node.secondBreakerAmps !== undefined && node.secondBreakerAmps !== null ? node.secondBreakerAmps : '',
                  [t.csvHeaders.generatorBackup]: node.hasGeneratorConnection ? (node.generatorName || t.csvHeaders.yes) : t.csvHeaders.no,
                  [t.csvHeaders.specialFeatures]: specialFlags.length > 0 ? specialFlags.join(', ') : '-',
                  [t.csvHeaders.model]: node.model || '',
                  [t.csvHeaders.sonNum]: node.componentNumber || '',
                  [t.csvHeaders.fatherNum]: parentNum,
                  [t.csvHeaders.building]: node.building || '',
                  [t.csvHeaders.floor]: node.floor || '',
                  [t.csvHeaders.office]: node.office || '',
                  [t.csvHeaders.place]: node.place || '',
                  [t.csvHeaders.description]: node.description || ''
              };

              sheet1Data.push(row);
          });

          // 2. Sheet 2: Sections Divided by Father (Feeders & Branch Outlets)
          const sheet2AOA: any[][] = [];
          
          sheet2AOA.push([
              `${t.csvHeaders.dividedByFatherSheet.toUpperCase()} - ${activeProject.name} (${activePage.name})`
          ]);
          sheet2AOA.push([]);

          // Include roots as top-level suppliers and all parents
          const parentNodesToDisplay: ElectricalNode[] = [];
          activePage.items.forEach(root => {
              if (!parentNodesToDisplay.some(p => p.id === root.id)) {
                  parentNodesToDisplay.push(root);
              }
          });
          parentsMap.forEach(parent => {
              if (!parentNodesToDisplay.some(p => p.id === parent.id)) {
                  parentNodesToDisplay.push(parent);
              }
          });

          parentNodesToDisplay.forEach((father, fIdx) => {
              const fatherLocation = [father.building, father.floor, father.office, father.place].filter(Boolean).join(' / ');
              const fatherTypeLabel = t.componentTypes[father.type] || father.type;
              
              // Section Header Banner for this Father Node
              sheet2AOA.push([
                  `🔷 ${t.csvHeaders.fatherName}: ${father.name} | ${t.csvHeaders.fatherType}: ${fatherTypeLabel} | ${t.csvHeaders.amps}: ${father.amps || '-'}A | ${t.csvHeaders.directSonsCount}: ${father.children.length} | ${t.csvHeaders.place}: ${fatherLocation || '-'}`
              ]);

              // Table Column Headers for its Connected Sons
              sheet2AOA.push([
                  t.csvHeaders.branchNum,
                  t.csvHeaders.sonName,
                  t.csvHeaders.sonType,
                  t.csvHeaders.feederCable,
                  t.csvHeaders.amps,
                  t.csvHeaders.voltage,
                  t.csvHeaders.kva,
                  t.csvHeaders.directSonsCount,
                  t.csvHeaders.directSonsList,
                  t.csvHeaders.isEssential,
                  t.csvHeaders.generatorBackup,
                  t.csvHeaders.place,
                  t.csvHeaders.description
              ]);

              if (father.children.length === 0) {
                  sheet2AOA.push([
                      '-',
                      t.inputPanel.noConnections || 'No downstream connections',
                      '-', '-', '-', '-', '-', '0', '-', '-', '-', '-', '-'
                  ]);
              } else {
                  father.children.forEach((son, sIdx) => {
                      const sonLocation = [son.building, son.floor, son.office, son.place].filter(Boolean).join(' / ');
                      sheet2AOA.push([
                          `#${sIdx + 1}`,
                          son.name,
                          t.componentTypes[son.type] || son.type,
                          son.connectionStyle?.cableSize || '-',
                          son.amps !== undefined && son.amps !== null ? son.amps : '',
                          son.voltage !== undefined && son.voltage !== null ? son.voltage : '',
                          son.kva !== undefined && son.kva !== null ? son.kva : '',
                          son.children ? son.children.length : 0,
                          son.children && son.children.length > 0 ? son.children.map(c => c.name).join(', ') : '-',
                          son.isEssential ? (t.csvHeaders.essential || t.csvHeaders.yes) : (t.csvHeaders.nonEssential || t.csvHeaders.no),
                          son.hasGeneratorConnection ? (son.generatorName || t.csvHeaders.yes) : t.csvHeaders.no,
                          sonLocation || '',
                          son.description || ''
                      ]);
                  });
              }

              // Empty spacer line between father sections
              sheet2AOA.push([]);
          });

          // 3. Sheet 3: Direct Father-Son Link Matrix
          const sheet3Data: any[] = [];
          flattenedTree.forEach(item => {
              if (item.parent) {
                  sheet3Data.push({
                      [t.csvHeaders.fatherName]: item.parent.name,
                      [t.csvHeaders.fatherType]: t.componentTypes[item.parent.type] || item.parent.type,
                      [t.csvHeaders.feederCable]: item.node.connectionStyle?.cableSize || '-',
                      [t.csvHeaders.sonName]: item.node.name,
                      [t.csvHeaders.sonType]: t.componentTypes[item.node.type] || item.node.type,
                      [t.csvHeaders.branchNum]: `#${item.branchIndex}`,
                      [t.csvHeaders.level]: `${t.csvHeaders.level} ${item.depth}`,
                      [t.csvHeaders.amps]: item.node.amps !== undefined && item.node.amps !== null ? item.node.amps : '',
                      [t.csvHeaders.voltage]: item.node.voltage !== undefined && item.node.voltage !== null ? item.node.voltage : '',
                      [t.csvHeaders.kva]: item.node.kva !== undefined && item.node.kva !== null ? item.node.kva : '',
                      [t.csvHeaders.directSonsCount]: item.node.children ? item.node.children.length : 0,
                      [t.csvHeaders.upstreamLineage]: item.path.join(' ➔ ')
                  });
              }
          });

          try {
              // Create native Multi-Sheet Excel Workbook (.xlsx)
              const wb = XLSX.utils.book_new();

              // Enable Right-to-Left (RTL) mode on all worksheet views and the workbook
              wb.Workbook = { Views: [{ RTL: true }] };

              // Setup Sheet 1
              const ws1 = XLSX.utils.json_to_sheet(sheet1Data);
              ws1['!views'] = [{ rightToLeft: true }];
              ws1['!cols'] = [
                  { wch: 34 }, // Tree
                  { wch: 26 }, // Father Name
                  { wch: 18 }, // Father Type
                  { wch: 26 }, // Son Name
                  { wch: 18 }, // Son Type
                  { wch: 14 }, // Branch #
                  { wch: 20 }, // Cable
                  { wch: 14 }, // Level
                  { wch: 12 }, // Amps
                  { wch: 12 }, // Voltage
                  { wch: 12 }, // kVA
                  { wch: 16 }, // Calc Amps
                  { wch: 16 }, // Calc kVA
                  { wch: 16 }, // Sons count
                  { wch: 30 }, // Sons list
                  { wch: 38 }, // Lineage
                  { wch: 18 }, // Essential
                  { wch: 12 }, // Has Meter
                  { wch: 14 }, // Meter #
                  { wch: 16 }, // Generator
                  { wch: 20 }, // Special
                  { wch: 16 }, // Model
                  { wch: 16 }, // Son Num
                  { wch: 16 }, // Father Num
                  { wch: 16 }, // Building
                  { wch: 14 }, // Floor
                  { wch: 16 }, // Office
                  { wch: 18 }, // Place
                  { wch: 30 }  // Desc
              ];
              XLSX.utils.book_append_sheet(wb, ws1, (t.csvHeaders.allComponentsSheet || 'All Components').substring(0, 31));

              // Setup Sheet 2
              const ws2 = XLSX.utils.aoa_to_sheet(sheet2AOA);
              ws2['!views'] = [{ rightToLeft: true }];
              ws2['!cols'] = [
                  { wch: 14 }, // Branch #
                  { wch: 28 }, // Son Name
                  { wch: 20 }, // Son Type
                  { wch: 20 }, // Cable
                  { wch: 12 }, // Amps
                  { wch: 12 }, // Voltage
                  { wch: 12 }, // kVA
                  { wch: 16 }, // Sons count
                  { wch: 28 }, // Sons list
                  { wch: 18 }, // Essential
                  { wch: 16 }, // Generator
                  { wch: 22 }, // Location
                  { wch: 30 }  // Desc
              ];
              XLSX.utils.book_append_sheet(wb, ws2, (t.csvHeaders.dividedByFatherSheet || 'Divided by Father').substring(0, 31));

              // Setup Sheet 3
              let ws3: XLSX.WorkSheet | null = null;
              if (sheet3Data.length > 0) {
                  ws3 = XLSX.utils.json_to_sheet(sheet3Data);
                  ws3['!views'] = [{ rightToLeft: true }];
                  ws3['!cols'] = [
                      { wch: 26 }, // Father Name
                      { wch: 18 }, // Father Type
                      { wch: 20 }, // Cable
                      { wch: 26 }, // Son Name
                      { wch: 18 }, // Son Type
                      { wch: 14 }, // Branch #
                      { wch: 14 }, // Level
                      { wch: 12 }, // Amps
                      { wch: 12 }, // Voltage
                      { wch: 12 }, // kVA
                      { wch: 16 }, // Sons count
                      { wch: 38 }  // Lineage
                  ];
                  XLSX.utils.book_append_sheet(wb, ws3, (t.csvHeaders.fatherSonMatrixSheet || 'Link Matrix').substring(0, 31));
              }

              // Output .xlsx file
              const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
              const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
              const url = URL.createObjectURL(blob);
              triggerDownload(url, `${baseFileName}.xlsx`);
              setTimeout(() => URL.revokeObjectURL(url), 5000);
          } catch (xlsxErr) {
              console.error("XLSX generation fallback:", xlsxErr);
              // Fallback CSV generation with full father-son headers
              if (sheet1Data.length > 0) {
                  const headers = Object.keys(sheet1Data[0]);
                  const csvContent = [
                      headers.join(','),
                      ...sheet1Data.map(row => headers.map(header => {
                          const val = row[header];
                          const valStr = val !== undefined && val !== null ? String(val) : '';
                          return `"${valStr.replace(/"/g, '""')}"`;
                      }).join(','))
                  ].join('\n');
                  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  triggerDownload(url, `${baseFileName}.csv`);
              }
          }

          setShowExportModal(false);
          return;
      }

      const svgData = getFullSVGString();
      if (!svgData) {
          alert("Diagram export data could not be generated.");
          return;
      }

      const { clone, svgString, width, height, minX, minY } = svgData;

      if (format === 'svg') {
          const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
          triggerDownload(url, `${baseFileName}.svg`);
          setShowExportModal(false);
          return;
      }

      if (format === 'pdf') {
          const isLandscape = width >= height;
          // Check if diagram or current language uses Hebrew or Arabic
          const hasRTLChars = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(svgString) || language === 'he' || language === 'ar';

          if (hasRTLChars) {
              // Full Hebrew & Arabic Support:
              // Native browser canvas rasterization utilizes the platform's HarfBuzz/Skia text shaping engine.
              // It renders flawless Arabic cursive connections (initial, medial, final glyphs), correct RTL direction,
              // Hebrew Nikud and letterforms, and bidirectional layout at ultra-crisp 300+ DPI print quality.
              try {
                  const canvas = await svgToCanvas(clone, minX, minY, width, height, 3.5);
                  const pdf = new jsPDF({
                      orientation: isLandscape ? 'landscape' : 'portrait',
                      unit: 'pt',
                      format: [width, height],
                      compress: true
                  });
                  const actualPageWidth = pdf.internal.pageSize.getWidth();
                  const actualPageHeight = pdf.internal.pageSize.getHeight();
                  const pngData = canvas.toDataURL('image/png');
                  pdf.addImage(pngData, 'PNG', 0, 0, actualPageWidth, actualPageHeight, undefined, 'FAST');
                  pdf.save(`${baseFileName}.pdf`);
              } catch (rtlPdfErr) {
                  console.error("Hebrew/Arabic PDF generation error:", rtlPdfErr);
                  alert("Failed to generate PDF document.");
              }
          } else {
              // Pure Latin/English diagrams: Direct vector parsing via svg2pdf with automated fallback
              const pdf = new jsPDF({
                  orientation: isLandscape ? 'landscape' : 'portrait',
                  unit: 'pt',
                  format: [width, height],
                  compress: true
              });

              // Temporarily attach clone to DOM off-screen for complete layout, font & SVG text metrics
              // Note: Do NOT use visibility: hidden or opacity: 0 because svg2pdf inspects CSS visibility & opacity
              // and will discard/skip all elements if hidden!
              clone.style.position = 'fixed';
              clone.style.left = '-99999px';
              clone.style.top = '-99999px';
              clone.style.width = `${width}px`;
              clone.style.height = `${height}px`;
              clone.style.pointerEvents = 'none';
              clone.style.zIndex = '-99999';
              document.body.appendChild(clone);

              try {
                  const targetWidth = pdf.internal.pageSize.getWidth();
                  const targetHeight = pdf.internal.pageSize.getHeight();

                  await svg2pdf(clone, pdf, {
                      x: 0,
                      y: 0,
                      width: targetWidth,
                      height: targetHeight
                  });

                  // Validation: Verify svg2pdf actually generated visual commands in the document
                  const page1 = (pdf.internal as any).pages[1];
                  const opCount = Array.isArray(page1) ? page1.length : (typeof page1 === 'string' ? page1.length : 0);
                  if (opCount <= 4) {
                      throw new Error("Vector PDF produced an empty page");
                  }

                  pdf.save(`${baseFileName}.pdf`);
              } catch (vectorErr) {
                  console.warn("Direct vector svg2pdf encountered an issue, falling back to ultra-high DPI print PDF:", vectorErr);
                  const canvas = await svgToCanvas(clone, minX, minY, width, height, 3.5);
                  const fallbackPdf = new jsPDF({
                      orientation: isLandscape ? 'landscape' : 'portrait',
                      unit: 'pt',
                      format: [width, height],
                      compress: true
                  });
                  const actualPageWidth = fallbackPdf.internal.pageSize.getWidth();
                  const actualPageHeight = fallbackPdf.internal.pageSize.getHeight();
                  const pngData = canvas.toDataURL('image/png');
                  fallbackPdf.addImage(pngData, 'PNG', 0, 0, actualPageWidth, actualPageHeight, undefined, 'FAST');
                  fallbackPdf.save(`${baseFileName}.pdf`);
              } finally {
                  if (clone.parentNode) {
                      clone.parentNode.removeChild(clone);
                  }
              }
          }

          setShowExportModal(false);
          return;
      }

      if (format === 'raster-pdf') {
          // 2. Dedicated Print PDF: 300+ DPI Lossless rasterization for commercial plotters & printing
          try {
              const canvas = await svgToCanvas(clone, minX, minY, width, height, 3.5);
              const isLandscape = width >= height;
              const pdf = new jsPDF({
                  orientation: isLandscape ? 'landscape' : 'portrait',
                  unit: 'pt',
                  format: [width, height],
                  compress: true
              });

              const actualPageWidth = pdf.internal.pageSize.getWidth();
              const actualPageHeight = pdf.internal.pageSize.getHeight();
              const pngData = canvas.toDataURL('image/png');
              pdf.addImage(pngData, 'PNG', 0, 0, actualPageWidth, actualPageHeight, undefined, 'FAST');
              pdf.save(`${baseFileName}_print_300dpi.pdf`);
          } catch (err: any) {
              console.error("Print PDF export error:", err);
              alert(`Export failed: ${err.message || 'Error generating print PDF'}`);
          }

          setShowExportModal(false);
          return;
      }

      try {
          const canvas = await svgToCanvas(clone, minX, minY, width, height, 3.0);

          if (format === 'png') {
              if (canvas.toBlob) {
                  canvas.toBlob((blob) => {
                      if (blob) {
                          const blobUrl = URL.createObjectURL(blob);
                          triggerDownload(blobUrl, `${baseFileName}.png`);
                          setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
                      } else {
                          const pngUrl = canvas.toDataURL('image/png');
                          triggerDownload(pngUrl, `${baseFileName}.png`);
                      }
                  }, 'image/png');
              } else {
                  const pngUrl = canvas.toDataURL('image/png');
                  triggerDownload(pngUrl, `${baseFileName}.png`);
              }
          }
      } catch (err: any) {
          console.error("Export error:", err);
          alert(`Export failed: ${err.message || 'Error generating export file'}`);
      }

      setShowExportModal(false);
  };

  const handleImportProject = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const content = reader.result;
            if (typeof content !== 'string') return;
            
            let importedData: any = JSON.parse(content);
            if (Array.isArray(importedData)) {
                saveToHistory();
                const restoredProjects = importedData.map((p: any) => {
                    if (!p.pages) return null;
                    const migratedPages = p.pages.map((page: any) => {
                        if (page.rootNode && !page.items) {
                            return { ...page, items: [page.rootNode], rootNode: undefined };
                        }
                        return page;
                    });
                    return { ...p, id: generateId('proj'), pages: migratedPages };
                }).filter(Boolean) as Project[];
                if(restoredProjects.length > 0) {
                    setProjects(prev => [...prev, ...restoredProjects]);
                    alert(`${t.dialogs.restoreSuccess}`);
                } else {
                    alert(`${t.dialogs.importError}`);
                }
            } 
            else {
                if(importedData.pages && importedData.pages[0].rootNode && !importedData.pages[0].items) {
                     importedData = {
                         ...importedData,
                         pages: importedData.pages.map((p: any) => ({
                             ...p,
                             items: [p.rootNode],
                             rootNode: undefined
                         }))
                     };
                }
                if (importedData.id && importedData.pages) {
                    saveToHistory();
                    const exists = projects.some(p => p.id === importedData.id);
                    if (exists) importedData = { ...importedData, id: generateId('proj') };
                    setProjects(prev => [...prev, importedData]);
                    setActiveProjectId(importedData.id);
                    setActivePageId(importedData.pages[0].id);
                } else {
                    alert(`${t.dialogs.importError}`);
                }
            }
        } catch (error: any) {
            alert(`${t.dialogs.importError}`);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleAddProject = () => {
      saveToHistory();
      const newProj: Project = {
          id: generateId('proj'),
          name: `${t.projects} ${projects.length + 1}`,
          lastUpdated: new Date().toISOString(),
          pages: [{
              id: generateId('page'),
              name: 'Page 1',
              items: []
          }]
      };
      setProjects([...projects, newProj]);
      setActiveProjectId(newProj.id);
      setActivePageId(newProj.pages[0].id);
  };

  const handleAddPage = () => {
      saveToHistory();
      const newPage: Page = {
        id: generateId('page'),
        name: `${t.pages} ${activeProject.pages.length + 1}`,
        items: []
      };
      const nowIso = new Date().toISOString();
      setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, lastUpdated: nowIso, pages: [...p.pages, newPage] } : p));
      setActivePageId(newPage.id);
  };

  const deletePage = (projectId: string, pageId: string) => {
      const project = projects.find(p => p.id === projectId);
      if (!project || project.pages.length <= 1) { alert("Cannot delete last page."); return; }
      saveToHistory();
      const newPages = project.pages.filter(p => p.id !== pageId);
      const nowIso = new Date().toISOString();
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, lastUpdated: nowIso, pages: newPages } : p));
      if (activePageId === pageId) setActivePageId(newPages[0].id);
  };

  const handleDeletePageClick = (projectId: string, pageId: string) => {
      requestConfirmation(`${t.dialogs.deletePageTitle}`, `${t.dialogs.deletePage}`, () => deletePage(projectId, pageId));
  }

  const deleteProject = (projId: string) => {
      if (projects.length <= 1) return;
      saveToHistory();
      const newProjs = projects.filter(p => p.id !== projId);
      setProjects(newProjs);
      if (activeProjectId === projId) {
          setActiveProjectId(newProjs[0].id);
          setActivePageId(newProjs[0].pages[0].id);
      }
  };

  const handleDeleteProjectClick = (projId: string) => {
      requestConfirmation(`${t.dialogs.deleteProjectTitle}`, `${t.dialogs.deleteProject}`, () => deleteProject(projId));
  }

  const startEditing = (id: string, currentName: string) => {
      setEditingId(id);
      setEditName(currentName);
  };

  const saveEdit = () => {
      if (!editingId) return;
      const projIndex = projects.findIndex(p => p.id === editingId);
      const nowIso = new Date().toISOString();
      if (projIndex !== -1) {
          if(projects[projIndex].name !== editName) {
              saveToHistory();
              setProjects(prev => prev.map((p, idx) => idx === projIndex ? { ...p, name: editName, lastUpdated: nowIso } : p));
          }
      } else {
          if (activeProject.pages.some(p => p.id === editingId)) {
               saveToHistory();
               setProjects(prev => prev.map(p => {
                   if (p.id !== activeProjectId) return p;
                   return {
                       ...p,
                       lastUpdated: nowIso,
                       pages: p.pages.map(pg => pg.id === editingId ? { ...pg, name: editName } : pg)
                   };
               }));
          }
      }
      setEditingId(null);
      setEditName('');
  };

  const handleReset = () => {
      if(confirm(`${t.dialogs.reset}`)) {
          saveToHistory();
          setProjects([DEFAULT_PROJECT]);
          setActiveProjectId(DEFAULT_PROJECT.id);
          setActivePageId(DEFAULT_PROJECT.pages[0].id);
          setSelectedNode(null);
          setIsConnectMode(false);
      }
  };

  const searchMatches = useMemo(() => {
    if (!searchTerm.trim()) return null;
    const matches = new Set<string>();
    const term = searchTerm.toLowerCase();
    const traverse = (node: ElectricalNode) => {
      if (
        (node.name && node.name.toLowerCase().includes(term)) || 
        (node.model && node.model.toLowerCase().includes(term)) ||
        (node.componentNumber && node.componentNumber.toLowerCase().includes(term)) ||
        (node.meterNumber && node.meterNumber.toLowerCase().includes(term)) ||
        (node.place && node.place.toLowerCase().includes(term)) ||
        (node.building && node.building.toLowerCase().includes(term)) ||
        (node.floor && node.floor.toLowerCase().includes(term)) ||
        (node.office && node.office.toLowerCase().includes(term)) ||
        (node.description && node.description.toLowerCase().includes(term)) ||
        node.type.toLowerCase().includes(term)
      ) {
        matches.add(node.id);
      }
      node.children.forEach(traverse);
    };
    activePage.items.forEach(traverse);
    return matches;
  }, [activePage.items, searchTerm]);

  const matchingNodesList = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    const list: ElectricalNode[] = [];
    const traverse = (node: ElectricalNode) => {
      if (
        (node.name && node.name.toLowerCase().includes(term)) || 
        (node.model && node.model.toLowerCase().includes(term)) ||
        (node.componentNumber && node.componentNumber.toLowerCase().includes(term)) ||
        (node.meterNumber && node.meterNumber.toLowerCase().includes(term)) ||
        (node.place && node.place.toLowerCase().includes(term)) ||
        (node.building && node.building.toLowerCase().includes(term)) ||
        (node.floor && node.floor.toLowerCase().includes(term)) ||
        (node.office && node.office.toLowerCase().includes(term)) ||
        (node.description && node.description.toLowerCase().includes(term)) ||
        node.type.toLowerCase().includes(term)
      ) {
        list.push(node);
      }
      node.children.forEach(traverse);
    };
    activePage.items.forEach(traverse);
    return list;
  }, [activePage.items, searchTerm]);

  const addRecentSearch = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s.toLowerCase() !== trimmed.toLowerCase());
      const next = [trimmed, ...filtered].slice(0, 5);
      try {
        localStorage.setItem('smartschema_recent_searches', JSON.stringify(next));
      } catch (_) {}
      return next;
    });
  }, []);

  const removeRecentSearch = useCallback((queryToRemove: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setRecentSearches(prev => {
      const next = prev.filter(s => s !== queryToRemove);
      try {
        localStorage.setItem('smartschema_recent_searches', JSON.stringify(next));
      } catch (_) {}
      return next;
    });
  }, []);

  const clearAllRecentSearches = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setRecentSearches([]);
    try {
      localStorage.removeItem('smartschema_recent_searches');
    } catch (_) {}
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const availableLocations = useMemo(() => {
    const buildings = new Set<string>();
    const floors = new Set<string>();
    const offices = new Set<string>();
    const places = new Set<string>();

    const traverse = (node: ElectricalNode) => {
      if (node.building && node.building.trim()) buildings.add(node.building.trim());
      if (node.floor && node.floor.trim()) floors.add(node.floor.trim());
      if (node.office && node.office.trim()) offices.add(node.office.trim());
      if (node.place && node.place.trim()) places.add(node.place.trim());
      node.children.forEach(traverse);
    };

    activePage.items.forEach(traverse);

    return {
      buildings: Array.from(buildings).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      floors: Array.from(floors).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      offices: Array.from(offices).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      places: Array.from(places).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    };
  }, [activePage.items]);

  const handleEditPrintSettings = useCallback((focusField?: string) => {
      setIsPrintMode(true);
      setShowProjectSidebar(true);
      setSelectedNode(null);
      setMultiSelection(new Set<string>());
      setSelectionMode('node');
      setIsConnectMode(false);
      setConnectionSource(null);
      setPrintSettingsFocus(focusField);
  }, []);

  // Handle node navigation from Building & Floor distribution view
  const handleNavigateToNodeFromBuildingView = useCallback((pageId: string, nodeId: string) => {
    setShowBuildingFloorsModal(false);
    if (activePageId !== pageId) {
      setActivePageId(pageId);
    }
    
    // Find node and select
    const findNodeInTree = (nodes: ElectricalNode[]): ElectricalNode | null => {
      for (const n of nodes) {
        if (n.id === nodeId) return n;
        if (n.children && n.children.length > 0) {
          const childFound = findNodeInTree(n.children);
          if (childFound) return childFound;
        }
      }
      return null;
    };

    setTimeout(() => {
      const pageToSearch = activeProject.pages.find(p => p.id === pageId) || activePage;
      const targetNode = findNodeInTree(pageToSearch.items);
      if (targetNode) {
        setSelectedNode(targetNode);
        setMultiSelection(new Set([targetNode.id]));
        setSelectionMode('node');
      }
    }, 120);
  }, [activePageId, activeProject, activePage]);

  // Handle location update (building, floor, place, office) from Building & Floor view
  const handleUpdateNodeLocation = useCallback((pageId: string, nodeId: string, updates: Partial<ElectricalNode>) => {
    const nowIso = new Date().toISOString();
    setProjects(prevProjects => {
      const updateInTree = (nodes: ElectricalNode[]): ElectricalNode[] => {
        return nodes.map(n => {
          if (n.id === nodeId) {
            return { ...n, ...updates };
          }
          if (n.children && n.children.length > 0) {
            return { ...n, children: updateInTree(n.children) };
          }
          return n;
        });
      };

      return prevProjects.map(p => {
        const hasPage = p.pages.some(pg => pg.id === pageId);
        if (!hasPage) return p;
        return {
          ...p,
          lastUpdated: nowIso,
          pages: p.pages.map(page => {
            if (page.id !== pageId) return page;
            return {
              ...page,
              items: updateInTree(page.items)
            };
          })
        };
      });
    });
  }, []);

  if (shareAccessStatus !== 'granted') {
    return (
      <AccessBlockedView
        status={shareAccessStatus}
        t={t}
        correctPasscode={shareRequiredPasscode}
        onUnlock={() => setShareAccessStatus('granted')}
        onGoHome={() => {
          if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', window.location.pathname);
          }
          window.location.hash = '';
          window.location.search = '';
          setShareAccessStatus('granted');
          setIsReadOnly(false);
          const savedData = localStorage.getItem('smartschema_data') || localStorage.getItem('voltgraph_data');
          if (savedData) {
            try {
              const parsed = JSON.parse(savedData);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setProjects(parsed);
                setActiveProjectId(parsed[0].id);
                setActivePageId(parsed[0].pages[0]?.id || '');
              }
            } catch (_) {}
          }
        }}
      />
    );
  }

  // Main App Permanent Password Lock Screen Protection (Local only, does not block shared view links)
  if (!isReadOnly && !isAppUnlocked) {
    return (
      <AppLockScreen
        onUnlock={handleUnlock}
        t={t}
        language={language}
        onLanguageChange={setLanguage}
        theme={theme}
        onToggleTheme={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
        isRTL={isRTL}
      />
    );
  }

  return (
    <div className={`min-h-screen flex flex-col font-sans ${isDark ? 'text-slate-200 bg-slate-900 theme-dark' : 'text-slate-800 bg-slate-50 theme-light'} ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      
      {/* Clean View Header (Used for shared read-only links and clean view mode) */}
      {(isCleanView || isReadOnly) ? (
        <CleanViewHeader
          projects={projects}
          activeProject={activeProject}
          activeProjectId={activeProjectId}
          onSelectProject={(projId) => {
            const p = projects.find(item => item.id === projId);
            if (p) {
              setActiveProjectId(p.id);
              setActivePageId(p.pages[0]?.id || '');
              setSelectedNode(null);
              setMultiSelection(new Set());
            }
          }}
          activePage={activePage}
          activePageId={activePageId}
          onSelectPage={(pageId) => {
            setActivePageId(pageId);
            setSelectedNode(null);
            setMultiSelection(new Set());
          }}
          isReadOnly={isReadOnly}
          onExitCleanView={!isReadOnly ? () => setIsCleanView(false) : undefined}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchMatchCount={searchMatches?.size || 0}
          activeFilters={activeFilters}
          onToggleFilter={toggleFilter}
          onClearFilters={() => setActiveFilters(new Set())}
          availableLocations={availableLocations}
          orientation={orientation}
          onCycleOrientation={cycleOrientation}
          theme={theme}
          onToggleTheme={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
          isAnnotating={isAnnotating}
          onToggleAnnotating={() => setIsAnnotating(!isAnnotating)}
          annotationColor={annotationColor}
          onAnnotationColorChange={setAnnotationColor}
          onClearAnnotations={handleClearAnnotations}
          onSaveAnnotations={handleSaveAnnotations}
          onUndoAnnotation={handleUndoAnnotation}
          canUndoAnnotation={annotations.length > 0}
          annotationsCount={annotations.length}
          palmRejectionMode={palmRejectionMode}
          onPalmRejectionModeChange={setPalmRejectionMode}
          isStylusActive={isStylusActive}
          onOpenExport={() => setShowExportModal(true)}
          onOpenTopology={() => setShowTopologyModal(true)}
          onOpenBuildingFloors={() => setShowBuildingFloorsModal(true)}
          onOpenSecurity={() => setShowSecurityModal(true)}
          onLogOut={handleLogOut}
          t={t}
          isRTL={isRTL}
        />
      ) : (
      <nav className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between sticky top-0 z-40 shadow-md">
        <div className="flex items-center gap-3">
             <button onClick={() => setShowProjectSidebar(!showProjectSidebar)} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors">
                <span className="material-icons-round">menu</span>
            </button>
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded flex items-center justify-center shadow-lg">
                 <span className="material-icons-round text-white text-lg">electrical_services</span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-tight hidden sm:block leading-none">{t.appName}</h1>
                {isReadOnly && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    {t.readOnly?.badge || "View Mode"}
                  </span>
                )}
              </div>
              <button 
                onClick={() => setShowVersionHistoryModal(true)}
                className="flex items-center gap-1.5 mt-1 group cursor-pointer hover:opacity-90 transition-all text-left"
                title={isReadOnly ? (t.readOnly?.badge || "View Mode") : `${t.saveStatus?.savedTooltip || "All changes saved to browser local storage"}${lastSavedTime ? ` (${t.saveStatus?.lastSaved || "Saved at"} ${lastSavedTime})` : ''} • ${t.versionHistory?.clickStatusToOpen || "Click to open Version History"}`}
              >
                 <span className={`w-1.5 h-1.5 rounded-full transition-colors ${isReadOnly ? 'bg-emerald-400' : saveStatus === 'saved' ? 'bg-emerald-400' : saveStatus === 'saving' ? 'bg-amber-400 animate-pulse' : 'bg-red-500'}`}></span>
                 <span className="text-[10px] text-slate-400 group-hover:text-sky-300 transition-colors font-medium uppercase tracking-wider">
                   {isReadOnly ? (t.readOnly?.badge || "View Mode") : (t.saveStatus?.[saveStatus] || saveStatus)}
                 </span>
                 {!isReadOnly && saveStatus === 'saved' && lastSavedTime && (
                   <span className="text-[9px] text-slate-500 font-mono hidden sm:inline-block">
                     • {lastSavedTime}
                   </span>
                 )}
                 {!isReadOnly && (
                   <span className="text-[9px] text-indigo-400/80 group-hover:text-indigo-300 font-mono hidden md:inline-block bg-indigo-500/10 px-1 rounded">
                     {versionHistory.length}/10
                   </span>
                 )}
              </button>
            </div>
        </div>
        
        <div className="flex-1 max-w-md mx-6 relative" ref={searchContainerRef}>
            <span className="absolute top-1/2 -translate-y-1/2 material-icons-round text-slate-500 left-3 text-lg pointer-events-none">search</span>
            <input 
                type="text" 
                placeholder={t.searchPlaceholder}
                value={searchTerm}
                onFocus={() => setIsSearchFocused(true)}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addRecentSearch(searchTerm);
                    setIsSearchFocused(false);
                  } else if (e.key === 'Escape') {
                    setIsSearchFocused(false);
                  }
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-full py-2 pl-10 pr-10 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder-slate-500 shadow-inner"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                }}
                className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 hover:text-white p-0.5 rounded-full hover:bg-slate-700 transition-colors"
                title={t.clearSearch || "Clear search"}
              >
                <span className="material-icons-round text-sm">close</span>
              </button>
            )}

            {/* Recent Searches & Search Suggestions Dropdown */}
            {isSearchFocused && (
              <div className={`absolute top-full mt-2 left-0 right-0 bg-slate-800/95 border border-slate-700 rounded-2xl shadow-2xl z-[80] overflow-hidden backdrop-blur-md animate-fadeIn ${isRTL ? 'rtl' : 'ltr'}`}>
                {/* Matching Components (if user typed something) */}
                {searchTerm.trim().length > 0 && (
                  <div className="p-3 border-b border-slate-700/80">
                    <div className="flex items-center justify-between pb-1.5 mb-1 text-[11px] font-bold text-sky-400 uppercase tracking-wider">
                      <span className="flex items-center gap-1">
                        <span className="material-icons-round text-xs">manage_search</span>
                        {t.searchSuggestions || "Matching Components"} ({matchingNodesList.length})
                      </span>
                    </div>

                    {matchingNodesList.length === 0 ? (
                      <div className="text-xs text-slate-500 py-1.5 px-2 italic">
                        {t.connectionTopology?.noMatchingNodes || "No matching components found"}
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                        {matchingNodesList.slice(0, 5).map(node => {
                          const config = COMPONENT_CONFIG[node.type] || { icon: 'help', color: '#94a3b8' };
                          const loc = [node.building, node.floor, node.office, node.place].filter(Boolean).join(' / ');

                          return (
                            <button
                              key={node.id}
                              onClick={() => {
                                setSelectedNode(node);
                                setMultiSelection(new Set([node.id]));
                                setSelectionMode('node');
                                addRecentSearch(node.name);
                                setSearchTerm(node.name);
                                setIsSearchFocused(false);
                              }}
                              className="w-full text-left px-2.5 py-1.5 hover:bg-slate-700/70 rounded-xl flex items-center justify-between group transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div 
                                  className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                                  style={{ backgroundColor: `${node.customColor || config.color}20`, color: node.customColor || config.color }}
                                >
                                  <LegendIcon icon={config.icon} color={node.customColor || config.color} size={12} />
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-semibold text-slate-200 group-hover:text-white truncate">
                                    {node.name}
                                  </span>
                                  <span className="text-[10px] text-slate-400 truncate">
                                    {t.componentTypes[node.type] || node.type} {loc ? `• ${loc}` : ''}
                                  </span>
                                </div>
                              </div>
                              <span className="material-icons-round text-xs text-slate-500 group-hover:text-sky-400 transition-colors">
                                my_location
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Recent Searches Section */}
                <div className="p-3">
                  <div className="flex items-center justify-between pb-1.5 mb-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <span className="material-icons-round text-xs text-indigo-400">history</span>
                      {t.recentSearches || "Recent Searches"}
                    </span>
                    {recentSearches.length > 0 && (
                      <button
                        onClick={clearAllRecentSearches}
                        className="text-[11px] text-red-400 hover:text-red-300 hover:underline flex items-center gap-0.5"
                      >
                        <span className="material-icons-round text-[11px]">delete_sweep</span>
                        {t.clearRecentSearches || "Clear All"}
                      </button>
                    )}
                  </div>

                  {recentSearches.length === 0 ? (
                    <div className="py-2 px-2 text-xs text-slate-500 text-center italic">
                      {t.noRecentSearches || "No recent searches"}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {recentSearches.map((query, qIdx) => (
                        <div
                          key={qIdx}
                          onClick={() => {
                            setSearchTerm(query);
                            addRecentSearch(query);
                            setIsSearchFocused(false);
                          }}
                          className="flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-700/60 rounded-xl cursor-pointer group transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="material-icons-round text-xs text-slate-500 group-hover:text-indigo-400 transition-colors">
                              search
                            </span>
                            <span className="text-xs text-slate-300 group-hover:text-white truncate font-medium">
                              {query}
                            </span>
                          </div>
                          <button
                            onClick={(e) => removeRecentSearch(query, e)}
                            className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-700 rounded-lg transition-colors"
                            title="Remove"
                          >
                            <span className="material-icons-round text-xs">close</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer hint */}
                <div className="px-3 py-1.5 bg-slate-900/60 border-t border-slate-700/60 text-[10px] text-slate-400 flex items-center justify-between">
                  <span>{t.pressEnterToSearch || "Press Enter to search"}</span>
                  <span className="font-mono text-[9px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">ESC to close</span>
                </div>
              </div>
            )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Group 1: Creation & Undo/Redo & Link (Only in Edit Mode) */}
          {!isReadOnly && (
            <div className="flex items-center gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80 shadow-sm">
              {/* Add Power Source Dropdown */}
              <div className="relative" ref={addIndependentMenuRef}>
                <button 
                  onClick={() => setShowAddIndependentMenu(prev => !prev)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    showAddIndependentMenu 
                      ? 'bg-emerald-600 text-white shadow-md' 
                      : 'text-emerald-400 hover:text-white hover:bg-emerald-600/20'
                  }`}
                  title={t.addIndependent || "Add Independent Source"}
                >
                  <span className="material-icons-round text-base">add_circle</span>
                  <span className="hidden xl:inline">{t.addIndependent || "Add Source"}</span>
                  <span className="material-icons-round text-xs transition-transform duration-200" style={{ transform: showAddIndependentMenu ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                </button>

                {showAddIndependentMenu && (
                  <div className={`absolute top-full mt-2 ${isRTL ? 'left-0' : 'right-0'} w-52 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden py-1 animate-fadeIn`}>
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-700/60">
                      {t.addIndependent || "Add Power Source"}
                    </div>
                    <button onClick={() => { handleAddIndependentNode(ComponentType.SYSTEM_ROOT); setShowAddIndependentMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 hover:text-white flex items-center gap-2.5 transition-colors">
                      <div className="w-6 h-6 rounded-md bg-blue-500/20 text-blue-400 flex items-center justify-center">
                        <span className="material-icons-round text-sm">domain</span>
                      </div>
                      <span className="font-medium">{t.addGrid}</span>
                    </button>
                    <button onClick={() => { handleAddIndependentNode(ComponentType.GENERATOR); setShowAddIndependentMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 hover:text-white flex items-center gap-2.5 transition-colors">
                      <div className="w-6 h-6 rounded-md bg-red-500/20 text-red-400 flex items-center justify-center">
                        <span className="material-icons-round text-sm">settings_power</span>
                      </div>
                      <span className="font-medium">{t.addGen}</span>
                    </button>
                    <button onClick={() => { handleAddIndependentNode(ComponentType.TRANSFORMER); setShowAddIndependentMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 hover:text-white flex items-center gap-2.5 transition-colors">
                      <div className="w-6 h-6 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center">
                        <span className="material-icons-round text-sm">electric_bolt</span>
                      </div>
                      <span className="font-medium">{t.addTrans}</span>
                    </button>
                    <button onClick={() => { handleAddIndependentNode(ComponentType.UPS); setShowAddIndependentMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 hover:text-white flex items-center gap-2.5 transition-colors">
                      <div className="w-6 h-6 rounded-md bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                        <span className="material-icons-round text-sm">battery_charging_full</span>
                      </div>
                      <span className="font-medium">UPS</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Undo & Redo */}
              <div className="flex items-center bg-slate-900/60 rounded-lg p-0.5 border border-slate-700/60">
                <button 
                  onClick={handleUndo} 
                  disabled={history.length === 0} 
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/80 rounded disabled:opacity-25 transition-colors"
                  title={`${t.undo} (Ctrl+Z)`}
                >
                  <span className="material-icons-round text-base">undo</span>
                </button>
                <div className="w-px h-3.5 bg-slate-700/80"></div>
                <button 
                  onClick={handleRedo} 
                  disabled={future.length === 0} 
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/80 rounded disabled:opacity-25 transition-colors"
                  title={`${t.redo} (Ctrl+Y)`}
                >
                  <span className="material-icons-round text-base">redo</span>
                </button>
              </div>

              {/* Connect / Link Mode */}
              <button 
                onClick={() => {
                  setIsConnectMode(!isConnectMode);
                  setConnectionSource(null);
                  if (!isConnectMode) setSelectedNode(null);
                }}
                className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                  isConnectMode 
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md animate-pulse' 
                    : 'text-slate-400 hover:text-amber-400 hover:bg-slate-700/60'
                }`}
                title={t.linkComponents}
              >
                <span className="material-icons-round text-base">link</span>
                {isConnectMode && <span className="text-[11px] font-bold">{t.linking}</span>}
              </button>
            </div>
          )}

          {/* Group 2: View Controls (Filter, Orientation, Lock Layout, Fullscreen) */}
          <div className="flex items-center gap-0.5 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80 shadow-sm">
            {/* Filter Dropdown */}
            <div className="relative" ref={navFilterRef}>
              <button 
                onClick={() => setShowNavFilterDropdown(prev => !prev)}
                className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors ${
                  activeFilters.size > 0 
                    ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/80'
                }`}
                title={t.filters.title}
              >
                <span className="material-icons-round text-base">filter_alt</span>
                {activeFilters.size > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 bg-blue-600 text-white rounded-full min-w-[15px] text-center leading-none">
                    {activeFilters.size}
                  </span>
                )}
              </button>

              {showNavFilterDropdown && (
                <div className={`absolute top-full mt-2 ${isRTL ? 'left-0' : 'right-0'} w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-[70] p-3 max-h-80 overflow-y-auto custom-scrollbar`}>
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.filters.title}</span>
                    {activeFilters.size > 0 && (
                      <button 
                        onClick={() => setActiveFilters(new Set())}
                        className="text-xs text-red-400 hover:text-red-300 hover:underline flex items-center gap-1"
                      >
                        <span className="material-icons-round text-xs">clear</span>
                        {t.filters.clear}
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {[
                      { key: 'meter', icon: 'speed', color: '#3b82f6' },
                      { key: 'no-meter', icon: 'power_off', color: '#64748b' },
                      { key: 'generator', icon: 'letter_g', color: '#ef4444' },
                      { key: 'ac', icon: 'ac_unit', color: '#06b6d4' },
                      { key: 'reserved', icon: 'lock', color: '#eab308' },
                      { key: 'essential', icon: 'star', color: '#ef4444' },
                      { key: 'non-essential', icon: 'star', color: '#64748b' },
                      { key: 'multimeter', icon: 'multimeter', color: '#10b981' },
                      { key: 'publicBoard', icon: 'public_board', color: '#14b8a6' },
                      { key: 'transferSwitch', icon: 'transfer_switch', color: '#c084fc' }
                    ].map(({ key, icon, color }) => (
                      <label key={key} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-slate-700/70 rounded-lg cursor-pointer transition-colors">
                        <input 
                          type="checkbox" 
                          checked={activeFilters.has(key)}
                          onChange={() => toggleFilter(key)}
                          className="w-4 h-4 rounded bg-slate-900 border-slate-600 text-blue-600 focus:ring-offset-slate-800 cursor-pointer"
                        />
                        <LegendIcon icon={icon} color={color} size={16} />
                        <span className="text-sm text-slate-200">
                          {key === 'no-meter' ? t.filters.noMeter : key === 'non-essential' ? t.filters.nonEssential : t.filters[key]}
                        </span>
                      </label>
                    ))}

                    {/* Filter by Location Section */}
                    <div className="border-t border-slate-700/80 my-2 pt-1">
                      <div className="px-2 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider">{t.filters.byLocation}</div>
                    </div>

                    {/* Building Filter */}
                    {availableLocations.buildings.length > 0 && (
                      <div className="mb-2">
                        <div className="px-2 py-0.5 text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                          <span className="material-icons-round text-xs text-blue-400">domain</span>
                          {t.filters.byBuilding}
                        </div>
                        {availableLocations.buildings.map(bld => (
                          <label key={`bld:${bld}`} className="flex items-center gap-2.5 px-2 py-1 hover:bg-slate-700/70 rounded-lg cursor-pointer transition-colors">
                            <input 
                              type="checkbox" 
                              checked={activeFilters.has(`bld:${bld}`)}
                              onChange={() => toggleFilter(`bld:${bld}`)}
                              className="w-4 h-4 rounded bg-slate-900 border-slate-600 text-blue-600 focus:ring-offset-slate-800 cursor-pointer"
                            />
                            <span className="text-xs text-slate-200 truncate">{bld}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {/* Floor Filter */}
                    {availableLocations.floors.length > 0 && (
                      <div className="mb-2">
                        <div className="px-2 py-0.5 text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                          <span className="material-icons-round text-xs text-amber-400">stairs</span>
                          {t.filters.byFloor}
                        </div>
                        {availableLocations.floors.map(flr => (
                          <label key={`flr:${flr}`} className="flex items-center gap-2.5 px-2 py-1 hover:bg-slate-700/70 rounded-lg cursor-pointer transition-colors">
                            <input 
                              type="checkbox" 
                              checked={activeFilters.has(`flr:${flr}`)}
                              onChange={() => toggleFilter(`flr:${flr}`)}
                              className="w-4 h-4 rounded bg-slate-900 border-slate-600 text-blue-600 focus:ring-offset-slate-800 cursor-pointer"
                            />
                            <span className="text-xs text-slate-200 truncate">{flr}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {/* Office Filter */}
                    {availableLocations.offices.length > 0 && (
                      <div className="mb-2">
                        <div className="px-2 py-0.5 text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                          <span className="material-icons-round text-xs text-emerald-400">meeting_room</span>
                          {t.filters.byOffice}
                        </div>
                        {availableLocations.offices.map(off => (
                          <label key={`off:${off}`} className="flex items-center gap-2.5 px-2 py-1 hover:bg-slate-700/70 rounded-lg cursor-pointer transition-colors">
                            <input 
                              type="checkbox" 
                              checked={activeFilters.has(`off:${off}`)}
                              onChange={() => toggleFilter(`off:${off}`)}
                              className="w-4 h-4 rounded bg-slate-900 border-slate-600 text-blue-600 focus:ring-offset-slate-800 cursor-pointer"
                            />
                            <span className="text-xs text-slate-200 truncate">{off}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {/* Place / Room Filter */}
                    {availableLocations.places.length > 0 && (
                      <div className="mb-2">
                        <div className="px-2 py-0.5 text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                          <span className="material-icons-round text-xs text-purple-400">place</span>
                          {t.filters.byPlace}
                        </div>
                        {availableLocations.places.map(plc => (
                          <label key={`plc:${plc}`} className="flex items-center gap-2.5 px-2 py-1 hover:bg-slate-700/70 rounded-lg cursor-pointer transition-colors">
                            <input 
                              type="checkbox" 
                              checked={activeFilters.has(`plc:${plc}`)}
                              onChange={() => toggleFilter(`plc:${plc}`)}
                              className="w-4 h-4 rounded bg-slate-900 border-slate-600 text-blue-600 focus:ring-offset-slate-800 cursor-pointer"
                            />
                            <span className="text-xs text-slate-200 truncate">{plc}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {availableLocations.buildings.length === 0 && 
                     availableLocations.floors.length === 0 && 
                     availableLocations.offices.length === 0 && 
                     availableLocations.places.length === 0 && (
                      <div className="px-2 py-1 text-xs text-slate-500 italic">
                        {t.filters.noLocations}
                      </div>
                    )}
                    
                    <div className="border-t border-slate-700/80 my-2 pt-1">
                      <div className="px-2 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider">{t.filters.byType}</div>
                    </div>
                    
                    {Object.values(ComponentType).map(type => (
                      <label key={type} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-slate-700/70 rounded-lg cursor-pointer transition-colors">
                        <input 
                          type="checkbox" 
                          checked={activeFilters.has(type)}
                          onChange={() => toggleFilter(type)}
                          className="w-4 h-4 rounded bg-slate-900 border-slate-600 text-blue-600 focus:ring-offset-slate-800 cursor-pointer"
                        />
                        <LegendIcon 
                          icon={COMPONENT_CONFIG[type]?.icon || 'help'} 
                          color={COMPONENT_CONFIG[type]?.color || '#94a3b8'} 
                          size={16} 
                        />
                        <span className="text-sm text-slate-200">{t.componentTypes[type]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Orientation Toggle */}
            <button 
              onClick={cycleOrientation} 
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/80 rounded-lg transition-colors relative"
              title={`${t.toggleOrientation}: ${t.orientations?.[orientation] || orientation}`}
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
              {orientation === 'orthogonal_vertical' && (
                <span className="absolute bottom-0.5 right-0.5 text-[8px] font-bold text-sky-400 bg-slate-900 px-0.5 rounded leading-none">
                  90°
                </span>
              )}
            </button>

            {/* Lock Layout */}
            <button 
              onClick={() => setIsLayoutLocked(!isLayoutLocked)} 
              className={`p-1.5 rounded-lg transition-colors ${
                isLayoutLocked 
                  ? 'text-red-400 hover:bg-red-950/40' 
                  : 'text-emerald-400 hover:bg-emerald-950/40'
              }`}
              title={isLayoutLocked ? t.unlockLayout : t.lockLayout}
            >
              <span className="material-icons-round text-base">{isLayoutLocked ? 'lock' : 'lock_open'}</span>
            </button>

            {/* Clean View / Fullscreen */}
            <button 
              onClick={() => setIsCleanView(true)} 
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/80 rounded-lg transition-colors"
              title={t.cleanView}
            >
              <span className="material-icons-round text-base">fullscreen</span>
            </button>

            {/* Building & Floor Distribution Quick Access */}
            <button
              onClick={() => setShowBuildingFloorsModal(true)}
              className="p-1.5 text-amber-400 hover:text-white hover:bg-amber-600/30 rounded-lg transition-colors"
              title={t.buildingFloors?.openTooltip || "Building & Floor Distribution"}
            >
              <span className="material-icons-round text-base">apartment</span>
            </button>
          </div>

          {/* Group 3: Project Tools Menu Dropdown */}
          <div className="relative" ref={toolsMenuRef}>
            <button
              onClick={() => setShowToolsMenu(prev => !prev)}
              className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-all ${
                showToolsMenu
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                  : 'text-slate-300 hover:text-white bg-slate-800/90 hover:bg-slate-700 border-slate-700/80'
              }`}
              title={t.toolsMenu || "Project Tools"}
            >
              <span className="material-icons-round text-base text-indigo-400">tune</span>
              <span className="hidden lg:inline">{t.tools || "Tools"}</span>
              {versionHistory.length > 0 && (
                <span className="text-[10px] font-bold bg-indigo-500/30 text-indigo-300 px-1.5 py-0.2 rounded-full hidden sm:inline">
                  {versionHistory.length}
                </span>
              )}
              <span className="material-icons-round text-xs opacity-70">expand_more</span>
            </button>

            {showToolsMenu && (
              <div className={`absolute top-full mt-2 ${isRTL ? 'left-0' : 'right-0'} w-64 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden p-2 animate-fadeIn`}>
                <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-700/60 flex items-center justify-between">
                  <span>{t.toolsMenu || "Project Tools"}</span>
                  <span className="material-icons-round text-xs text-indigo-400">construction</span>
                </div>
                
                <div className="space-y-1 pt-1.5">
                  {/* Share Project */}
                  <button
                    onClick={() => { setShowShareModal(true); setShowToolsMenu(false); }}
                    className="w-full text-left px-2.5 py-2 hover:bg-slate-700/70 rounded-xl flex items-center justify-between text-xs text-slate-200 hover:text-white transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                        <span className="material-icons-round text-sm">share</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">{t.share?.title ? (language === 'en' ? 'Share Project Link' : language === 'he' ? 'שיתוף קישור פרויקט' : 'مشاركة رابط المشروع') : 'Share Project'}</span>
                        <span className="text-[10px] text-slate-400">{language === 'en' ? 'Cloud link or read-only view' : language === 'he' ? 'קישור ענן או צפייה בלבד' : 'رابط سحابي أو عرض فقط'}</span>
                      </div>
                    </div>
                    <span className="material-icons-round text-xs text-slate-500 group-hover:text-blue-400">chevron_right</span>
                  </button>

                  {/* Folder Auto-Save & Sync */}
                  <button
                    onClick={() => { setShowFolderSyncModal(true); setShowToolsMenu(false); }}
                    className="w-full text-left px-2.5 py-2 hover:bg-slate-700/70 rounded-xl flex items-center justify-between text-xs text-slate-200 hover:text-white transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <span className="material-icons-round text-sm">folder_shared</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">{t.folderSync?.title || "Folder Auto-Save & Sync"}</span>
                        <span className="text-[10px] text-slate-400">{folderSettings.enabled ? (folderSettings.folderName || "Connected") : (t.folderSync?.chooseFolder || "Select folder")}</span>
                      </div>
                    </div>
                    {folderSettings.enabled && directoryHandle ? (
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    ) : (
                      <span className="material-icons-round text-xs text-slate-500 group-hover:text-emerald-400">chevron_right</span>
                    )}
                  </button>

                  {/* Export Diagram */}
                  <button
                    onClick={() => { setShowExportModal(true); setShowToolsMenu(false); }}
                    className="w-full text-left px-2.5 py-2 hover:bg-slate-700/70 rounded-xl flex items-center justify-between text-xs text-slate-200 hover:text-white transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <span className="material-icons-round text-sm">save_alt</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">{t.export.title}</span>
                        <span className="text-[10px] text-slate-400">SVG, PDF, DXF, PNG, JSON</span>
                      </div>
                    </div>
                    <span className="material-icons-round text-xs text-slate-500 group-hover:text-emerald-400">chevron_right</span>
                  </button>

                  {/* Version History */}
                  <button
                    onClick={() => { setShowVersionHistoryModal(true); setShowToolsMenu(false); }}
                    className="w-full text-left px-2.5 py-2 hover:bg-slate-700/70 rounded-xl flex items-center justify-between text-xs text-slate-200 hover:text-white transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                        <span className="material-icons-round text-sm">history</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">{t.versionHistory?.openButton || "Version History"}</span>
                        <span className="text-[10px] text-slate-400">{t.versionHistory?.openTooltip || "Snapshots & rollback"}</span>
                      </div>
                    </div>
                    {versionHistory.length > 0 && (
                      <span className="text-[10px] font-bold bg-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded-full">
                        {versionHistory.length}
                      </span>
                    )}
                  </button>

                  {/* Connection Topology */}
                  <button
                    onClick={() => { setShowTopologyModal(true); setShowToolsMenu(false); }}
                    className="w-full text-left px-2.5 py-2 hover:bg-slate-700/70 rounded-xl flex items-center justify-between text-xs text-slate-200 hover:text-white transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
                        <span className="material-icons-round text-sm">account_tree</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">{t.connectionTopology?.openButton || "Topology & Auditor"}</span>
                        <span className="text-[10px] text-slate-400">{t.connectionTopology?.subtitle || "Electrical paths & busbars"}</span>
                      </div>
                    </div>
                    <span className="material-icons-round text-xs text-slate-500 group-hover:text-sky-400">chevron_right</span>
                  </button>

                  {/* Building & Floor Distribution */}
                  <button
                    onClick={() => { setShowBuildingFloorsModal(true); setShowToolsMenu(false); }}
                    className="w-full text-left px-2.5 py-2 hover:bg-slate-700/70 rounded-xl flex items-center justify-between text-xs text-slate-200 hover:text-white transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                        <span className="material-icons-round text-sm">apartment</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">{t.buildingFloors?.openButton || "Building & Floors"}</span>
                        <span className="text-[10px] text-slate-400">{t.buildingFloors?.subtitle || "Architectural elevation & layout"}</span>
                      </div>
                    </div>
                    <span className="material-icons-round text-xs text-slate-500 group-hover:text-amber-400">chevron_right</span>
                  </button>

                  {/* Print / PDF Layout Toggle */}
                  <button
                    onClick={() => {
                      const newState = !isPrintMode;
                      setIsPrintMode(newState);
                      if (newState) handleEditPrintSettings();
                      setShowToolsMenu(false);
                    }}
                    className="w-full text-left px-2.5 py-2 hover:bg-slate-700/70 rounded-xl flex items-center justify-between text-xs text-slate-200 hover:text-white transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${isPrintMode ? 'bg-blue-600 text-white' : 'bg-rose-500/20 text-rose-400'}`}>
                        <span className="material-icons-round text-sm">picture_as_pdf</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">{t.togglePrintMode}</span>
                        <span className="text-[10px] text-slate-400">{isPrintMode ? (t.active || 'Active') : (language === 'en' ? 'Sheet & Page Setup' : 'הגדרות גיליון והדפסה')}</span>
                      </div>
                    </div>
                    {isPrintMode && <span className="w-2 h-2 rounded-full bg-blue-500"></span>}
                  </button>

                  {/* Print Settings (if in print mode) */}
                  {isPrintMode && (
                    <button
                      onClick={() => {
                        handleEditPrintSettings();
                        setShowToolsMenu(false);
                      }}
                      className="w-full text-left px-2.5 py-2 hover:bg-slate-700/70 rounded-xl flex items-center justify-between text-xs text-blue-300 hover:text-blue-200 transition-colors group bg-blue-950/40 border border-blue-800/40"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                          <span className="material-icons-round text-sm">settings</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium">{t.printSettings.title}</span>
                          <span className="text-[10px] text-blue-300/70">{t.titleBlock?.edit || "Configure Sheet"}</span>
                        </div>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Group 4: Settings & Security Dropdown */}
          <div className="relative" ref={settingsMenuRef}>
            <button
              onClick={() => setShowSettingsMenu(prev => !prev)}
              className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-all ${
                showSettingsMenu
                  ? 'bg-slate-700 text-white border-slate-600 shadow-md'
                  : 'text-slate-300 hover:text-white bg-slate-800/90 hover:bg-slate-700 border-slate-700/80'
              }`}
              title={t.settingsMenu || "Settings & Security"}
            >
              <span className="material-icons-round text-base text-slate-300">settings</span>
              <span className="hidden lg:inline">{t.settings || "Settings"}</span>
              <span className="material-icons-round text-xs opacity-70">expand_more</span>
            </button>

            {showSettingsMenu && (
              <div className={`absolute top-full mt-2 ${isRTL ? 'left-0' : 'right-0'} w-64 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden p-3 animate-fadeIn space-y-3`}>
                {/* Language Selection */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                    <span className="material-icons-round text-xs text-blue-400">translate</span>
                    <span>{t.languageLabel || "Language"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 bg-slate-900/70 p-1 rounded-xl border border-slate-700/60">
                    {[
                      { code: 'en', label: 'English' },
                      { code: 'he', label: 'עברית' },
                      { code: 'ar', label: 'العربية' }
                    ].map(({ code, label }) => (
                      <button
                        key={code}
                        onClick={() => { setLanguage(code as Language); }}
                        className={`py-1 px-1 rounded-lg text-xs font-medium transition-all text-center ${
                          language === code
                            ? 'bg-blue-600 text-white font-bold shadow-sm'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Theme Switcher */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                    <span className="material-icons-round text-xs text-amber-400">palette</span>
                    <span>{t.themeLabel || "Theme"}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 bg-slate-900/70 p-1 rounded-xl border border-slate-700/60">
                    <button
                      onClick={() => setTheme('light')}
                      className={`py-1 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                        theme === 'light'
                          ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 font-bold border border-amber-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <span className="material-icons-round text-sm">light_mode</span>
                      <span>Light</span>
                    </button>
                    <button
                      onClick={() => setTheme('dark')}
                      className={`py-1 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                        theme === 'dark'
                          ? 'bg-blue-600/30 text-blue-300 font-bold border border-blue-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <span className="material-icons-round text-sm">dark_mode</span>
                      <span>Dark</span>
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-700/60 pt-2 space-y-1">
                  {/* Folder Auto-Save & Sync */}
                  <button
                    onClick={() => { setShowFolderSyncModal(true); setShowSettingsMenu(false); }}
                    className="w-full text-left px-2 py-1.5 hover:bg-slate-700/70 rounded-xl flex items-center justify-between text-xs text-slate-200 hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <span className="material-icons-round text-xs">folder_shared</span>
                      </div>
                      <span className="font-medium">{t.folderSync?.title || "Folder Auto-Save & Sync"}</span>
                    </div>
                    {folderSettings.enabled && directoryHandle && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    )}
                  </button>

                  {/* Security & Password Modal */}
                  <button
                    onClick={() => { setShowSecurityModal(true); setShowSettingsMenu(false); }}
                    className="w-full text-left px-2 py-1.5 hover:bg-slate-700/70 rounded-xl flex items-center gap-2 text-xs text-slate-200 hover:text-white transition-colors"
                  >
                    <div className="w-5 h-5 rounded-md bg-blue-500/20 text-blue-400 flex items-center justify-center">
                      <span className="material-icons-round text-xs">shield</span>
                    </div>
                    <span className="font-medium">{t.auth?.securitySettings || "Security & Password"}</span>
                  </button>

                  {/* About SmartSchema */}
                  <button
                    onClick={() => { setShowAboutModal(true); setShowSettingsMenu(false); }}
                    className="w-full text-left px-2 py-1.5 hover:bg-slate-700/70 rounded-xl flex items-center gap-2 text-xs text-slate-200 hover:text-white transition-colors"
                  >
                    <div className="w-5 h-5 rounded-md bg-slate-700 text-slate-300 flex items-center justify-center">
                      <span className="material-icons-round text-xs">info</span>
                    </div>
                    <span className="font-medium">{t.aboutApp || "About SmartSchema"}</span>
                  </button>

                  {/* Log Out */}
                  {!isReadOnly && (
                    <button
                      onClick={() => { setShowSettingsMenu(false); handleLogOut(); }}
                      className="w-full text-left px-2 py-1.5 hover:bg-red-950/50 rounded-xl flex items-center gap-2 text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      <div className="w-5 h-5 rounded-md bg-red-500/20 text-red-400 flex items-center justify-center">
                        <span className="material-icons-round text-xs">logout</span>
                      </div>
                      <span className="font-medium">{t.auth?.logout || "Log Out & Lock"}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Group 5: AI Analyze Primary Action */}
          <button onClick={handleAnalyze} className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white px-3 sm:px-4 py-1.5 rounded-xl font-semibold shadow-lg shadow-purple-900/25 hover:shadow-purple-900/40 transition-all flex items-center gap-1.5 text-xs sm:text-sm shrink-0">
            <span className="material-icons-round text-base sm:text-lg">auto_awesome</span>
            <span>{t.analyze}</span>
          </button>
        </div>
      </nav>
      )}

      {/* Read-Only Top Alert Banner */}
      {isReadOnly && !isCleanView && (
        <div className="bg-slate-900/95 border-b border-emerald-500/40 px-6 py-2 flex items-center justify-between z-30 shadow-md backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
              <span className="material-icons-round text-sm">visibility</span>
            </div>
            <div>
              <span className="font-bold text-white text-xs mr-2">
                {t.readOnly?.bannerTitle || "View-Only Mode"}
              </span>
              <span className="text-xs text-slate-400 hidden sm:inline">
                {t.readOnly?.bannerDesc || "You are viewing a shared read-only diagram. Editing, modifying, and cloning are disabled. All navigation, filtering, and export tools are active."}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowShareModal(true)}
              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium transition-all flex items-center gap-1"
            >
              <span className="material-icons-round text-xs text-blue-400">share</span>
              <span>{t.share?.title ? (language === 'en' ? 'Share' : language === 'he' ? 'שיתוף' : 'مشاركة') : 'Share'}</span>
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        {showProjectSidebar && !isCleanView && !isReadOnly && (
            <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <h2 className="font-bold text-slate-300 text-sm uppercase tracking-wider">{t.projects}</h2>
                      {isReadOnly && (
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.2 rounded font-bold uppercase">
                          {t.readOnly?.badge || "View"}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                         <button onClick={() => setShowFolderSyncModal(true)} className="text-slate-400 hover:text-blue-400 p-1 hover:bg-slate-800 rounded relative" title={t.folderSync?.title || "Folder Auto-Save & Sync"}>
                            <span className="material-icons-round text-lg">folder_shared</span>
                            {folderSettings.enabled && directoryHandle && (
                              <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-400"></span>
                            )}
                         </button>
                         <button onClick={() => setShowVersionHistoryModal(true)} className="text-slate-400 hover:text-indigo-400 p-1 hover:bg-slate-800 rounded" title={t.versionHistory?.openTooltip || "Version History"}>
                            <span className="material-icons-round text-lg">history</span>
                         </button>
                         <button onClick={() => setShowShareModal(true)} className="text-slate-400 hover:text-blue-400 p-1 hover:bg-slate-800 rounded" title={t.share?.title || "Share Project"}>
                            <span className="material-icons-round text-lg">share</span>
                         </button>
                         <button onClick={handleBackupAll} className="text-slate-400 hover:text-green-400 p-1 hover:bg-slate-800 rounded" title={t.backupAll}>
                            <span className="material-icons-round text-lg">archive</span>
                         </button>
                         {!isReadOnly && (
                           <>
                             <input type="file" ref={fileInputRef} onChange={handleImportProject} accept=".json" className="hidden" />
                             <button onClick={() => fileInputRef.current?.click()} className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded" title={t.importProject}>
                                <span className="material-icons-round text-lg">upload_file</span>
                            </button>
                            <button onClick={handleAddProject} className="text-blue-400 hover:text-blue-300 p-1 hover:bg-slate-800 rounded" title="Add Project">
                                <span className="material-icons-round text-lg">add_box</span>
                            </button>
                           </>
                         )}
                    </div>
                </div>

                {/* Folder Auto-Save Status Banner in Sidebar */}
                {!isReadOnly && (
                  <div className="px-3 py-2 bg-slate-950/60 border-b border-slate-800/80">
                    {folderSettings.enabled && directoryHandle ? (
                      <div 
                        onClick={() => setShowFolderSyncModal(true)}
                        className="flex items-center justify-between p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-emerald-500/30 cursor-pointer group transition-all"
                        title={folderSettings.folderName || directoryHandle.name}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                            <span className="material-icons-round text-sm">folder_special</span>
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-slate-200 group-hover:text-white truncate text-[11px]">
                              {folderSettings.folderName || directoryHandle.name}
                            </span>
                            <span className="text-[9px] text-emerald-400 flex items-center gap-1 font-mono">
                              <span className={`w-1.5 h-1.5 rounded-full ${folderSyncStatus === 'saving' ? 'bg-amber-400 animate-spin' : 'bg-emerald-400 animate-pulse'}`}></span>
                              <span>{folderSyncStatus === 'saving' ? (t.folderSync?.statusSaving || "Saving to folder...") : (t.folderSync?.statusSynced || "Folder Synced")}</span>
                            </span>
                          </div>
                        </div>
                        <span className="material-icons-round text-xs text-slate-500 group-hover:text-blue-400 transition-colors">tune</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowFolderSyncModal(true)}
                        className="w-full py-1.5 px-2.5 bg-slate-900/80 hover:bg-slate-800 border border-dashed border-slate-700/90 hover:border-blue-500/50 rounded-xl text-[11px] font-medium text-slate-300 hover:text-blue-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer group"
                      >
                        <span className="material-icons-round text-sm text-blue-400 group-hover:scale-110 transition-transform">folder_open</span>
                        <span>{t.folderSync?.chooseFolder || "Auto-Save to Local Folder"}</span>
                      </button>
                    )}
                  </div>
                )}
                <div className="flex-1 overflow-y-auto p-2 space-y-4">
                    {projects.map(project => (
                        <div key={project.id} className="space-y-1">
                            <div 
                                className={`px-3 py-2 rounded flex items-center justify-between group ${activeProjectId === project.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50'}`}
                                onClick={() => { setActiveProjectId(project.id); setActivePageId(project.pages[0].id); }}
                            >
                                <div className="flex items-center gap-2 flex-1 overflow-hidden">
                                    <span className="material-icons-round text-sm shrink-0">folder</span>
                                    {editingId === project.id ? (
                                        <input 
                                            type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onBlur={saveEdit} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} autoFocus
                                            className="w-full bg-slate-700 border border-slate-600 rounded px-1 py-0.5 text-xs text-white" onClick={(e) => e.stopPropagation()}
                                        />
                                    ) : (
                                        <div className="flex flex-col min-w-0 flex-1">
                                            <span className="font-medium text-sm truncate">{project.name}</span>
                                            {project.lastUpdated && (
                                                <span className="text-[10px] text-slate-500 group-hover:text-slate-400 transition-colors flex items-center gap-1">
                                                    <span className="material-icons-round text-[11px] opacity-75">schedule</span>
                                                    <span>{t.projectTimestamps?.lastUpdated || "Updated"} {formatProjectTimestamp(project.lastUpdated)}</span>
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    {!isReadOnly && editingId !== project.id && <button onClick={(e) => { e.stopPropagation(); handleDownloadProject(project); }} className="text-slate-600 hover:text-green-400" title={t.backupProject}><span className="material-icons-round text-sm">save_alt</span></button>}
                                    {!isReadOnly && editingId !== project.id && <button onClick={(e) => { e.stopPropagation(); startEditing(project.id, project.name); }} className="text-slate-600 hover:text-blue-400"><span className="material-icons-round text-sm">edit</span></button>}
                                    {!isReadOnly && projects.length > 1 && editingId !== project.id && <button onClick={(e) => { e.stopPropagation(); handleDeleteProjectClick(project.id); }} className="text-slate-600 hover:text-red-400"><span className="material-icons-round text-sm">delete</span></button>}
                                </div>
                            </div>
                            
                            {activeProjectId === project.id && (
                                <div className={`space-y-1 border-slate-800 mx-2 ${isRTL ? 'border-r-2 pr-4' : 'border-l-2 pl-4'}`}>
                                    {project.pages.map(page => (
                                        <div key={page.id} className={`px-3 py-1.5 rounded cursor-pointer flex items-center justify-between group ${activePageId === page.id ? 'bg-blue-600/20 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`} onClick={() => setActivePageId(page.id)}>
                                            <div className="flex items-center gap-2 flex-1 overflow-hidden">
                                                <span className="material-icons-round text-xs shrink-0">description</span>
                                                {editingId === page.id ? (
                                                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onBlur={saveEdit} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} autoFocus className="w-full bg-slate-700 border border-slate-600 rounded px-1 py-0.5 text-xs text-white" onClick={(e) => e.stopPropagation()} />
                                                ) : (
                                                    <span className="text-xs truncate">{page.name}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {!isReadOnly && editingId !== page.id && <button onClick={(e) => { e.stopPropagation(); startEditing(page.id, page.name); }} className="text-slate-600 hover:text-blue-400"><span className="material-icons-round text-[10px]">edit</span></button>}
                                                {!isReadOnly && project.pages.length > 1 && editingId !== page.id && <button onClick={(e) => { e.stopPropagation(); handleDeletePageClick(project.id, page.id); }} className="text-slate-600 hover:text-red-400"><span className="material-icons-round text-[10px]">close</span></button>}
                                            </div>
                                        </div>
                                    ))}
                                    <button onClick={handleAddPage} className={`px-3 py-1.5 w-full text-xs text-slate-600 hover:text-blue-400 flex items-center gap-2 ${isRTL ? 'text-right' : 'text-left'}`}>
                                        <span className="material-icons-round text-sm">add</span>
                                        {t.addPage}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </aside>
        )}

        <div className="flex-1 relative p-4 flex flex-col bg-slate-950/50 overflow-hidden">
            {/* Floating Inspector Card for Clean / Read-Only View */}
            {(isCleanView || isReadOnly) && selectedNode && (
                <div className={`absolute top-4 ${isRTL ? 'left-4' : 'right-4'} z-40 w-80 sm:w-96 max-h-[calc(100vh-6rem)] bg-slate-900/95 border border-slate-700/90 rounded-2xl shadow-2xl backdrop-blur-md flex flex-col overflow-hidden animate-fadeIn`}>
                    <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-800/40">
                        <div className="flex items-center gap-2">
                            <span className="material-icons-round text-blue-400 text-base">info</span>
                            <span className="text-xs font-bold text-white uppercase tracking-wider">
                                {t.readOnly?.inspectorTitle || "Component Specifications"}
                            </span>
                        </div>
                        <button
                            onClick={() => {
                                setSelectedNode(null);
                                setMultiSelection(new Set());
                                setSelectionMode('node');
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            title="Close Inspector"
                        >
                            <span className="material-icons-round text-base">close</span>
                        </button>
                    </div>
                    <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                        {(() => {
                            const selectedParent = findNodeParent(activePage.items, selectedNode.id);
                            return (
                                <ReadOnlyInspector
                                    selectedNode={selectedNode}
                                    parentNode={selectedParent}
                                    t={t}
                                    isRTL={isRTL}
                                    onNavigateToNode={handleNavigateToNode}
                                />
                            );
                        })()}
                    </div>
                </div>
            )}

            {!isCleanView && !isReadOnly && (
                <div className="mb-2 flex items-center justify-between">
                     <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">{t.active}:</span>
                        <span className="text-sm font-medium text-slate-200">{activeProject.name} / {activePage.name}</span>
                     </div>
                     {isConnectMode && (
                        <div className="bg-amber-900/40 border border-amber-700/50 px-3 py-1 rounded text-xs text-amber-300 animate-pulse font-bold">
                            {connectionSource ? t.connectMode.target : t.connectMode.source}
                        </div>
                     )}
                </div>
            )}
            <div className={`flex-1 rounded-xl border shadow-xl relative overflow-hidden ${isConnectMode ? 'border-amber-600/50 shadow-amber-900/20' : 'border-slate-800'} ${theme === 'light' ? 'bg-white' : 'bg-slate-900'}`}>
                {/* Floating Full Annotation Toolbar (Colors, Tools, Thickness, Stylus indicator & Palm Rejection selector) */}
                <AnnotationToolbar
                    isAnnotating={isAnnotating}
                    onToggleAnnotating={() => setIsAnnotating(!isAnnotating)}
                    annotationColor={annotationColor}
                    onAnnotationColorChange={setAnnotationColor}
                    annotationWidth={annotationWidth}
                    onAnnotationWidthChange={setAnnotationWidth}
                    annotationTool={annotationTool}
                    onAnnotationToolChange={setAnnotationTool}
                    onUndo={handleUndoAnnotation}
                    canUndo={annotations.length > 0}
                    onClear={handleClearAnnotations}
                    annotationsCount={annotations.length}
                    onSave={handleSaveAnnotations}
                    palmRejectionMode={palmRejectionMode}
                    onPalmRejectionModeChange={setPalmRejectionMode}
                    isStylusActive={isStylusActive}
                    t={t}
                    isRTL={isRTL}
                />
                <Diagram 
                    key={activePage.id}
                    data={activePage.items || []} 
                    onNodeClick={handleNodeClick} 
                    onLinkClick={handleLinkClick}
                    onDuplicateChild={handleAddDuplicatedChild}
                    onDeleteNode={handleDeleteNodeClick}
                    onToggleCollapse={handleToggleCollapse}
                    onGroupNode={handleGroupNode}
                    onNodeMove={handleNodeMove}
                    onAddRoot={() => handleAddIndependentNode(ComponentType.SYSTEM_ROOT)}
                    onAddGenerator={() => handleAddIndependentNode(ComponentType.GENERATOR)}
                    onBackgroundClick={handleBackgroundClick}
                    selectedNodeId={selectedNode?.id || null}
                    multiSelection={multiSelection}
                    selectedLinkId={selectionMode === 'link' ? selectedNode?.id || null : null}
                    orientation={orientation}
                    searchMatches={searchMatches}
                    isConnectMode={isConnectMode}
                    connectionSourceId={connectionSource?.id || null}
                    isPrintMode={isPrintMode}
                    activeProject={activeProject}
                    onDisconnectLink={handleDisconnectLink}
                    onEditPrintSettings={handleEditPrintSettings}
                    t={t}
                    language={language}
                    theme={theme}
                    isCleanView={isCleanView}
                    activeFilters={activeFilters}
                    annotations={annotations}
                    isAnnotating={isAnnotating}
                    annotationColor={annotationColor}
                    annotationWidth={annotationWidth}
                    annotationTool={annotationTool}
                    palmRejectionMode={palmRejectionMode}
                    onStylusDetected={(detected) => setIsStylusActive(detected)}
                    onAnnotationAdd={handleAnnotationAdd}
                    onDeleteAnnotation={handleDeleteAnnotation}
                    onUpdateAnnotations={handleUpdateAnnotations}
                    onToggleLayoutLocked={() => setIsLayoutLocked(!isLayoutLocked)}
                    onToggleAnnotating={() => setIsAnnotating(!isAnnotating)}
                    isLayoutLocked={isLayoutLocked}
                />
            </div>
        </div>

        {/* Input/Settings Panel */}
        {!isCleanView && !isReadOnly && (
            <aside className="w-96 bg-slate-900 border-l border-slate-800 overflow-y-auto flex flex-col z-30 shadow-2xl">
                {isPrintMode && !selectedNode ? (
                    <div className="flex flex-col h-full">
                         <div className="p-4 border-b border-slate-800 bg-slate-800/30">
                            <button 
                                onClick={() => handleEditPrintSettings()}
                                className="w-full py-2 px-4 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 transition-colors flex items-center justify-center gap-2 mb-2"
                            >
                                <span className="material-icons-round text-sm">edit</span>
                                <span className="text-sm font-bold">{t.printSettings.title}</span>
                            </button>
                        </div>
                        <div className="p-4 flex-1 overflow-y-auto">
                            <PrintSettingsPanel 
                                key={activeProjectId}
                                metadata={activeProject.printMetadata || DEFAULT_PRINT_METADATA}
                                projectName={activeProject.name}
                                onChange={handleUpdatePrintMetadata}
                                onUpdateProjectName={handleUpdateProjectName}
                                onClose={() => setIsPrintMode(false)}
                                focusField={printSettingsFocus}
                                t={t}
                            />
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="p-4 border-b border-slate-800 bg-slate-800/30">
                            <h2 className="font-bold text-slate-200 flex items-center gap-2">
                                <span className="material-icons-round text-blue-400">{isReadOnly ? 'visibility' : 'tune'}</span>
                                {isReadOnly ? (t.readOnly?.inspectorTitle || "Component Specifications") : t.propertiesActions}
                            </h2>
                        </div>

                        <div className="p-4 flex-1 overflow-y-auto">
                            {(() => {
                                const selectedParent = selectedNode ? findNodeParent(activePage.items, selectedNode.id) : null;
                                const currentParentId = selectedParent ? selectedParent.id : '__root__';
                                const descendantIds = selectedNode ? getAllDescendantIds(selectedNode) : new Set<string>();
                                const availableParents = selectedNode 
                                    ? getFlatNodeList(activePage.items).filter(n => !descendantIds.has(n.id))
                                    : [];

                                if (isReadOnly) {
                                    return (
                                        <ReadOnlyInspector 
                                            selectedNode={selectedNode}
                                            parentNode={selectedParent}
                                            t={t}
                                            isRTL={isRTL}
                                            onNavigateToNode={handleNavigateToNode}
                                        />
                                    );
                                }

                                return (
                                    <InputPanel 
                                        selectedNode={selectedNode}
                                        selectionMode={selectionMode}
                                        multiSelectionCount={multiSelection.size}
                                        availableParents={availableParents}
                                        currentParentId={currentParentId}
                                        onAdd={handleAddNode}
                                        onAddIndependent={handleAddIndependentNode}
                                        onEdit={handleEditNode}
                                        onChangeParent={handleReparentNode}
                                        onBulkEdit={handleBulkEdit}
                                        onEditConnection={updateNodeConnectionStyle}
                                        onDelete={() => {
                                            if (multiSelection.size > 0) {
                                                if(confirm(`${t.dialogs.deleteNode}`)) {
                                                    executeBulkDelete(multiSelection);
                                                }
                                            } else if (selectedNode) {
                                                handleDeleteNodeClick(selectedNode);
                                            }
                                        }}
                                        onCancel={() => { setSelectedNode(null); setMultiSelection(new Set<string>()); setSelectionMode('node'); }}
                                        onDetach={handleDetachNode}
                                        onStartConnection={handleStartConnection}
                                        onNavigate={handleNavigateToNode}
                                        onDisconnectLink={handleDisconnectLink}
                                        t={t}
                                    />
                                );
                            })()}
                        </div>
                    </>
                )}
                
                {!isReadOnly && (
                    <div className="p-4 border-t border-slate-800 text-center">
                         <button onClick={handleReset} className="text-xs text-red-400 hover:text-red-300 hover:underline transition-colors">
                            {t.resetDiagram}
                        </button>
                    </div>
                )}
            </aside>
        )}
      </main>

      <AnalysisModal isOpen={showAnalysis} onClose={() => setShowAnalysis(false)} loading={isAnalyzing} result={analysisResult} t={t} />
      <ConfirmationModal isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} t={t} />
      <ExportModal isOpen={showExportModal} onClose={() => setShowExportModal(false)} onExport={handleExport} onOpenShare={() => setShowShareModal(true)} t={t} />
      <ShareModal isOpen={showShareModal} onClose={() => setShowShareModal(false)} activeProject={activeProject} allProjects={projects} onUpdateProject={handleUpdateProject} t={t} />
      <TopologyModal 
        isOpen={showTopologyModal} 
        onClose={() => setShowTopologyModal(false)} 
        activeProject={activeProject} 
        activePage={activePage} 
        onSelectNode={(node) => {
          setSelectedNode(node);
          setMultiSelection(new Set([node.id]));
          setSelectionMode('node');
        }} 
        t={t} 
        isDark={isDark} 
        isRTL={isRTL} 
      />
      <BuildingFloorsModal
        isOpen={showBuildingFloorsModal}
        onClose={() => setShowBuildingFloorsModal(false)}
        activeProject={activeProject}
        allProjects={projects}
        activePage={activePage}
        onNavigateToNode={handleNavigateToNodeFromBuildingView}
        onUpdateNodeLocation={handleUpdateNodeLocation}
        t={t}
        language={language}
        theme={theme}
        isRTL={isRTL}
      />
      <VersionHistoryModal
        isOpen={showVersionHistoryModal}
        onClose={() => setShowVersionHistoryModal(false)}
        versionHistory={versionHistory}
        onRevertSnapshot={handleRevertSnapshot}
        onCreateManualSnapshot={handleCreateManualSnapshot}
        onDeleteSnapshot={handleDeleteSnapshot}
        onClearHistory={handleClearVersionHistory}
        currentProject={activeProject}
        allProjects={projects}
        t={t}
        isDark={isDark}
        isRTL={isRTL}
      />
      <AboutModal isOpen={showAboutModal} onClose={() => setShowAboutModal(false)} t={t} />
      <SecurityModal
        isOpen={showSecurityModal}
        onClose={() => setShowSecurityModal(false)}
        onLogOut={handleLogOut}
        t={t}
      />
      <FolderSyncModal
        isOpen={showFolderSyncModal}
        onClose={() => setShowFolderSyncModal(false)}
        folderSettings={folderSettings}
        directoryHandle={directoryHandle}
        onSelectDirectory={handleSelectFolderDirectory}
        onDisconnectFolder={handleDisconnectFolder}
        onUpdateSettings={handleUpdateFolderSettings}
        currentProjects={projects}
        onLoadProjectsFromFolder={handleLoadProjectsFromFolder}
        onSaveNowToFolder={handleManualSaveToFolder}
        t={t}
        isRTL={isRTL}
      />

      {/* Subtle Local Storage Saved Toast */}
      {showSaveToast && !isReadOnly && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900/95 border border-emerald-500/40 text-emerald-300 px-3.5 py-2 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2.5 text-xs font-medium animate-fadeIn transition-all pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="material-icons-round text-emerald-400 text-sm">cloud_done</span>
          <span>{t.saveStatus?.savedToast || "Project state saved to local storage"}</span>
          {lastSavedTime && <span className="text-[10px] text-slate-400 font-mono">({lastSavedTime})</span>}
        </div>
      )}
    </div>
  );
}
