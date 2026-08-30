import { Project, ElectricalNode } from '../types';

export interface FolderSyncSettings {
  enabled: boolean;
  folderName: string;
  autoLoadOnStart: boolean;
  saveIndividualProjects: boolean;
  saveWorkspaceBundle: boolean;
  lastSavedTime: string | null;
  lastSyncStatus: 'idle' | 'saving' | 'synced' | 'error' | 'permission_required';
  lastErrorMessage?: string;
}

export interface DiscoveredProjectFile {
  fileName: string;
  projectName: string;
  lastModified: number;
  pagesCount: number;
  componentsCount: number;
  isWorkspaceBundle: boolean;
  projects: Project[];
  fileSize: number;
}

const DB_NAME = 'SmartSchema_FolderStorageDB';
const DB_VERSION = 1;
const STORE_NAME = 'folder_handles';
const HANDLE_KEY = 'active_directory_handle';
const SETTINGS_KEY = 'smartschema_folder_sync_settings';

// Default initial settings
export const DEFAULT_FOLDER_SETTINGS: FolderSyncSettings = {
  enabled: false,
  folderName: '',
  autoLoadOnStart: true,
  saveIndividualProjects: true,
  saveWorkspaceBundle: true,
  lastSavedTime: null,
  lastSyncStatus: 'idle'
};

// Check if running inside an iframe / cross-origin subframe
export const isInsideIframe = (): boolean => {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch (e) {
    return true;
  }
};

// Check if File System Access API is supported and usable in current environment
export const isFileSystemAccessSupported = (): boolean => {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
};

// IndexedDB Helper to persist FileSystemDirectoryHandle
const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not available'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveDirectoryHandleToDB = async (handle: FileSystemDirectoryHandle): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(handle, HANDLE_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

export const getDirectoryHandleFromDB = async (): Promise<FileSystemDirectoryHandle | null> => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
};

export const removeDirectoryHandleFromDB = async (): Promise<void> => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(HANDLE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
};

// Local storage helpers for settings
export const getStoredFolderSettings = (): FolderSyncSettings => {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      return { ...DEFAULT_FOLDER_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (_) {}
  return DEFAULT_FOLDER_SETTINGS;
};

export const saveStoredFolderSettings = (settings: FolderSyncSettings): void => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (_) {}
};

// Verify / request permission for directory handle
export const verifyFolderPermission = async (
  handle: FileSystemDirectoryHandle,
  readWrite: boolean = true
): Promise<boolean> => {
  try {
    const mode = readWrite ? 'readwrite' : 'read';
    // @ts-ignore - queryPermission is standard on FileSystemHandle
    if (handle.queryPermission) {
      const status = await (handle as any).queryPermission({ mode });
      if (status === 'granted') return true;
    }
    // @ts-ignore - requestPermission is standard on FileSystemHandle
    if (handle.requestPermission) {
      const status = await (handle as any).requestPermission({ mode });
      return status === 'granted';
    }
    return true;
  } catch (err) {
    console.warn('Folder permission verification failed:', err);
    return false;
  }
};

// Count total electrical components in project for overview
const countProjectComponents = (project: Project): number => {
  let count = 0;
  const countInNode = (node: ElectricalNode) => {
    count++;
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(countInNode);
    }
  };

  if (project.pages && Array.isArray(project.pages)) {
    project.pages.forEach(page => {
      if (page.items && Array.isArray(page.items)) {
        page.items.forEach(countInNode);
      }
    });
  }
  return count;
};

// Clean file names for filesystem safe naming
export const sanitizeFileName = (name: string): string => {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'Project';
};

// Write projects into directory handle
export const writeProjectsToFolder = async (
  directoryHandle: FileSystemDirectoryHandle,
  projects: Project[],
  options: { saveWorkspaceBundle?: boolean; saveIndividualProjects?: boolean } = {
    saveWorkspaceBundle: true,
    saveIndividualProjects: true
  }
): Promise<{ success: boolean; filesWritten: string[]; error?: string }> => {
  const filesWritten: string[] = [];

  try {
    const hasPermission = await verifyFolderPermission(directoryHandle, true);
    if (!hasPermission) {
      return { success: false, filesWritten: [], error: 'Permission not granted for directory' };
    }

    const timestamp = new Date().toISOString();

    // 1. Save Complete Workspace Bundle if enabled
    if (options.saveWorkspaceBundle !== false) {
      const bundleFileName = 'smartschema_workspace.json';
      const bundleData = {
        app: 'SmartSchema',
        version: '1.0.0',
        exportedAt: timestamp,
        projectCount: projects.length,
        projects: projects
      };

      const fileHandle = await directoryHandle.getFileHandle(bundleFileName, { create: true });
      // @ts-ignore
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(bundleData, null, 2));
      await writable.close();
      filesWritten.push(bundleFileName);
    }

    // 2. Save Individual Project files if enabled
    if (options.saveIndividualProjects !== false) {
      for (const project of projects) {
        const safeName = sanitizeFileName(project.name);
        const projectFileName = `${safeName}.smartschema.json`;

        const projectData = {
          ...project,
          _smartschema_meta: {
            app: 'SmartSchema',
            savedAt: timestamp,
            version: '1.0.0'
          }
        };

        const fileHandle = await directoryHandle.getFileHandle(projectFileName, { create: true });
        // @ts-ignore
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(projectData, null, 2));
        await writable.close();
        filesWritten.push(projectFileName);
      }
    }

    // 3. Write informational README so users know what files are in this folder
    try {
      const readmeHandle = await directoryHandle.getFileHandle('_SmartSchema_Info.txt', { create: true });
      // @ts-ignore
      const readmeWritable = await readmeHandle.createWritable();
      const readmeText = `SmartSchema - Electrical CAD Auto-Save Directory\n` +
        `Last Synced: ${new Date().toLocaleString()}\n` +
        `Total Projects: ${projects.length}\n` +
        `Projects: ${projects.map(p => p.name).join(', ')}\n\n` +
        `These files are automatically synced by SmartSchema. You can open, restore, or copy them anytime.\n`;
      await readmeWritable.write(readmeText);
      await readmeWritable.close();
    } catch (_) {}

    return { success: true, filesWritten };
  } catch (err: any) {
    console.error('Error writing projects to folder:', err);
    return { success: false, filesWritten, error: err?.message || 'Failed to save to folder' };
  }
};

// Parse JSON string into valid project objects with migrations
export const parseRawProjectsData = (content: string, fallbackFileName: string = 'Imported Project'): Project[] => {
  try {
    const raw = JSON.parse(content);

    // Case 1: Workspace Bundle object { app, projects: [...] }
    if (raw && Array.isArray(raw.projects)) {
      return normalizeProjectsList(raw.projects);
    }

    // Case 2: Array of projects directly [ { id, name, pages: [...] } ]
    if (Array.isArray(raw)) {
      return normalizeProjectsList(raw);
    }

    // Case 3: Single project object { id, name, pages: [...] }
    if (raw && typeof raw === 'object' && (raw.pages || raw.items || raw.name)) {
      const single = normalizeSingleProject(raw, fallbackFileName);
      return single ? [single] : [];
    }

    return [];
  } catch (err) {
    console.error('Failed to parse projects JSON content:', err);
    return [];
  }
};

// Normalize list of projects with legacy format support
const normalizeProjectsList = (list: any[]): Project[] => {
  return list
    .map((p, idx) => normalizeSingleProject(p, `Project ${idx + 1}`))
    .filter((p): p is Project => p !== null);
};

// Normalize single project
const normalizeSingleProject = (p: any, defaultName: string): Project | null => {
  if (!p || typeof p !== 'object') return null;

  const id = p.id || `proj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const name = p.name || defaultName.replace(/\.smartschema\.json$|\.json$/i, '');

  let pages: any[] = [];
  if (Array.isArray(p.pages) && p.pages.length > 0) {
    pages = p.pages.map((page: any, pIdx: number) => {
      const pageId = page.id || `page-${Date.now()}-${pIdx}`;
      const pageName = page.name || `Page ${pIdx + 1}`;
      let items = page.items || [];
      if (!items.length && page.rootNode) {
        items = [page.rootNode];
      }
      return {
        id: pageId,
        name: pageName,
        items: items
      };
    });
  } else if (Array.isArray(p.items)) {
    // Single page formatted project
    pages = [
      {
        id: `page-${Date.now()}-1`,
        name: 'Main Diagram',
        items: p.items
      }
    ];
  } else {
    pages = [
      {
        id: `page-${Date.now()}-1`,
        name: 'Main Diagram',
        items: []
      }
    ];
  }

  return {
    id,
    name,
    pages,
    lastUpdated: p.lastUpdated || Date.now()
  };
};

// Scan and read all projects from a FileSystemDirectoryHandle
export const scanProjectsInDirectory = async (
  directoryHandle: FileSystemDirectoryHandle
): Promise<{ success: boolean; projectsFound: DiscoveredProjectFile[]; error?: string }> => {
  const discovered: DiscoveredProjectFile[] = [];

  try {
    const hasPermission = await verifyFolderPermission(directoryHandle, false);
    if (!hasPermission) {
      return { success: false, projectsFound: [], error: 'Folder access permission required' };
    }

    // @ts-ignore - entries() is standard
    for await (const [name, handle] of (directoryHandle as any).entries()) {
      if (handle.kind === 'file') {
        const isJson = name.toLowerCase().endsWith('.json') || name.toLowerCase().endsWith('.smartschema.json');
        if (!isJson || name.startsWith('.')) continue;

        try {
          const file = await (handle as FileSystemFileHandle).getFile();
          const content = await file.text();
          const parsedProjects = parseRawProjectsData(content, name);

          if (parsedProjects.length > 0) {
            const isBundle = name.toLowerCase() === 'smartschema_workspace.json' || parsedProjects.length > 1;
            const primaryName = parsedProjects.length === 1 ? parsedProjects[0].name : `${parsedProjects.length} Projects Bundle`;
            const totalPages = parsedProjects.reduce((acc, p) => acc + (p.pages?.length || 0), 0);
            const totalComponents = parsedProjects.reduce((acc, p) => acc + countProjectComponents(p), 0);

            discovered.push({
              fileName: name,
              projectName: primaryName,
              lastModified: file.lastModified,
              pagesCount: totalPages,
              componentsCount: totalComponents,
              isWorkspaceBundle: isBundle,
              projects: parsedProjects,
              fileSize: file.size
            });
          }
        } catch (e) {
          console.warn(`Could not parse file ${name}:`, e);
        }
      }
    }

    // Sort by latest modified first
    discovered.sort((a, b) => b.lastModified - a.lastModified);

    return { success: true, projectsFound: discovered };
  } catch (err: any) {
    console.error('Error scanning folder:', err);
    return { success: false, projectsFound: [], error: err?.message || 'Failed to read directory contents' };
  }
};

// Parse multiple files from standard input (fallback for browsers without showDirectoryPicker)
export const parseProjectsFromFileList = async (
  fileList: FileList | File[]
): Promise<DiscoveredProjectFile[]> => {
  const results: DiscoveredProjectFile[] = [];
  const files = Array.from(fileList);

  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.json')) {
      try {
        const content = await file.text();
        const parsed = parseRawProjectsData(content, file.name);
        if (parsed.length > 0) {
          const isBundle = file.name.toLowerCase() === 'smartschema_workspace.json' || parsed.length > 1;
          const primaryName = parsed.length === 1 ? parsed[0].name : `${parsed.length} Projects Bundle`;
          const totalPages = parsed.reduce((acc, p) => acc + (p.pages?.length || 0), 0);
          const totalComponents = parsed.reduce((acc, p) => acc + countProjectComponents(p), 0);

          results.push({
            fileName: file.name,
            projectName: primaryName,
            lastModified: file.lastModified,
            pagesCount: totalPages,
            componentsCount: totalComponents,
            isWorkspaceBundle: isBundle,
            projects: parsed,
            fileSize: file.size
          });
        }
      } catch (err) {
        console.warn(`Error reading file ${file.name}:`, err);
      }
    }
  }

  results.sort((a, b) => b.lastModified - a.lastModified);
  return results;
};

// Download complete workspace bundle JSON file to user's downloads/disk
export const downloadWorkspaceBundleFile = (projects: Project[]): void => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bundleData = {
    app: 'SmartSchema',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    projectCount: projects.length,
    projects: projects
  };
  const blob = new Blob([JSON.stringify(bundleData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `smartschema_workspace_${timestamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Download individual project JSON file
export const downloadProjectFile = (project: Project): void => {
  const safeName = sanitizeFileName(project.name);
  const projectData = {
    ...project,
    _smartschema_meta: {
      app: 'SmartSchema',
      savedAt: new Date().toISOString(),
      version: '1.0.0'
    }
  };
  const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.smartschema.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
