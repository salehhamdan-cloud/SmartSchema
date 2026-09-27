
import React from 'react';

export interface ExportProgress {
  percent: number;
  current?: number;
  total?: number;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: 'svg' | 'png' | 'json' | 'excel' | 'pdf' | 'raster-pdf' | 'cad') => void;
  onOpenShare?: () => void;
  t: any;
  progress?: ExportProgress | number | null;
}

export const ExportModal: React.FC<ExportModalProps> = ({ 
  isOpen, 
  onClose, 
  onExport, 
  onOpenShare, 
  t,
  progress 
}) => {
  if (!isOpen) return null;

  const isExporting = progress !== null && progress !== undefined;
  const percent = typeof progress === 'number' 
    ? progress 
    : (progress ? progress.percent : 0);
  const currentTile = typeof progress === 'object' && progress ? progress.current : undefined;
  const totalTiles = typeof progress === 'object' && progress ? progress.total : undefined;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={(e) => {
        if (!isExporting && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full p-6 overflow-hidden">
        {/* Progress Bar Overlay during Tiled PDF Generation */}
        {isExporting && (
          <div className="absolute inset-0 z-30 bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fadeIn select-none">
            <div className="relative mb-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <span className="material-icons-round text-white text-3xl animate-pulse">picture_as_pdf</span>
              </div>
              <div className="absolute -inset-1.5 rounded-2xl border-2 border-blue-400/30 animate-pulse pointer-events-none" />
            </div>

            <h4 className="text-base font-bold text-white mb-1.5">
              {t.export?.generatingPdf || "Generating High-Resolution PDF..."}
            </h4>
            <p className="text-xs text-slate-300 mb-5 max-w-xs leading-relaxed">
              {t.export?.processingTiles || "Rendering high-precision vector slices..."}
            </p>

            <div className="w-full max-w-xs space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-blue-400 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                  {currentTile !== undefined && totalTiles !== undefined
                    ? `${t.export?.renderingTile || "Slice"} ${currentTile} / ${totalTiles}`
                    : `${percent}%`}
                </span>
                <span className="text-white font-mono font-bold text-sm">
                  {percent}%
                </span>
              </div>

              {/* Progress bar container */}
              <div className="w-full bg-slate-700/80 rounded-full h-3 p-0.5 border border-slate-600/60 shadow-inner overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-300 ease-out shadow-md"
                  style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                />
              </div>

              <p className="text-[11px] text-slate-400 leading-normal pt-1">
                {t.export?.keepWindowOpen || "Please wait while the multi-tile document compiles into lossless vector quality."}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <span className="material-icons-round text-blue-400 text-xl">save_alt</span>
            </div>
            <h3 className="text-lg font-bold text-white">{t.export.title}</h3>
          </div>
          <button 
            onClick={onClose} 
            disabled={isExporting}
            className={`text-slate-400 hover:text-white transition-colors ${isExporting ? 'opacity-30 cursor-not-allowed pointer-events-none' : ''}`}
          >
            <span className="material-icons-round">close</span>
          </button>
        </div>
        
        <p className="text-slate-400 text-sm mb-6">
          {t.export.subtitle}
        </p>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          {onOpenShare && (
            <button 
              onClick={() => {
                onClose();
                onOpenShare();
              }}
              className="w-full flex items-center justify-between p-4 rounded-lg bg-blue-900/30 hover:bg-blue-900/50 border border-blue-500/50 hover:border-blue-400 transition-all group"
            >
              <div className="flex items-center gap-3">
                <span className="material-icons-round text-blue-400 text-2xl">share</span>
                <div className="text-left">
                  <div className="text-sm font-bold text-blue-200 group-hover:text-white flex items-center gap-1.5">
                    <span>{t.share?.title || "Share Project Link (GitHub Pages)"}</span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-semibold uppercase">
                      {t.share?.recommended || "View-Only"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">{t.share?.readOnlyDesc || "Interactive link without database"}</div>
                </div>
              </div>
              <span className="material-icons-round text-blue-400 group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
            </button>
          )}

          {/* 1. Vector PDF (100% SVG Vector Sharpness) */}
          <button 
            onClick={() => onExport('pdf')}
            className="w-full flex items-center justify-between p-4 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-red-500/50 transition-all group"
          >
            <div className="flex items-center gap-3">
              <span className="material-icons-round text-red-400 text-2xl">picture_as_pdf</span>
              <div className="text-left">
                <div className="text-sm font-bold text-slate-200 group-hover:text-white flex items-center gap-2">
                  <span>{t.export.formats.pdf}</span>
                  <span className="text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 px-1.5 py-0.5 rounded font-semibold uppercase">
                    {t.export.badges?.vector || "Vector / SVG Quality"}
                  </span>
                </div>
                <div className="text-xs text-slate-400">{t.export.desc.pdf}</div>
              </div>
            </div>
            <span className="material-icons-round text-slate-500 group-hover:text-red-400">arrow_forward</span>
          </button>

          {/* 2. Vector SVG */}
          <button 
            onClick={() => onExport('svg')}
            className="w-full flex items-center justify-between p-4 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-amber-500/50 transition-all group"
          >
            <div className="flex items-center gap-3">
              <span className="material-icons-round text-amber-400 text-2xl">polyline</span>
              <div className="text-left">
                <div className="text-sm font-bold text-slate-200 group-hover:text-white flex items-center gap-2">
                  <span>{t.export.formats.svg}</span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-semibold uppercase">
                    Vector
                  </span>
                </div>
                <div className="text-xs text-slate-400">{t.export.desc.svg}</div>
              </div>
            </div>
            <span className="material-icons-round text-slate-500 group-hover:text-amber-400">arrow_forward</span>
          </button>

          {/* 3. Ultra-HD Print PDF (300 DPI) */}
          <button 
            onClick={() => onExport('raster-pdf')}
            className="w-full flex items-center justify-between p-4 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-rose-500/50 transition-all group"
          >
            <div className="flex items-center gap-3">
              <span className="material-icons-round text-rose-400 text-2xl">print</span>
              <div className="text-left">
                <div className="text-sm font-bold text-slate-200 group-hover:text-white flex items-center gap-2">
                  <span>{t.export.formats.rasterPdf || "Print PDF (300 DPI Ultra-HD)"}</span>
                  <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded font-semibold uppercase">
                    {t.export.badges?.print || "300 DPI Lossless"}
                  </span>
                </div>
                <div className="text-xs text-slate-400">{t.export.desc.rasterPdf || "Lossless 300 DPI document, optimal for print shops and commercial plotters."}</div>
              </div>
            </div>
            <span className="material-icons-round text-slate-500 group-hover:text-rose-400">arrow_forward</span>
          </button>

          {/* 4. AutoCAD / CAD Drawing (.dxf / DWG / DWF) */}
          <button 
            onClick={() => onExport('cad')}
            className="w-full flex items-center justify-between p-4 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-cyan-500/50 transition-all group"
          >
            <div className="flex items-center gap-3">
              <span className="material-icons-round text-cyan-400 text-2xl">architecture</span>
              <div className="text-left">
                <div className="text-sm font-bold text-slate-200 group-hover:text-white flex items-center gap-2">
                  <span>{t.export.formats.cad || "AutoCAD / CAD Drawing (.dxf)"}</span>
                  <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.5 rounded font-semibold uppercase">
                    {t.export.badges?.cad || "AutoCAD / DWG / CAD"}
                  </span>
                </div>
                <div className="text-xs text-slate-400">{t.export.desc.cad || "Universal AutoCAD CAD drawing (DWG/DWF compatible) with layers, wires, and electrical blocks."}</div>
              </div>
            </div>
            <span className="material-icons-round text-slate-500 group-hover:text-cyan-400">arrow_forward</span>
          </button>

          {/* 5. PNG Image */}
          <button 
            onClick={() => onExport('png')}
            className="w-full flex items-center justify-between p-4 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-purple-500/50 transition-all group"
          >
            <div className="flex items-center gap-3">
              <span className="material-icons-round text-purple-400 text-2xl">image</span>
              <div className="text-left">
                <div className="text-sm font-bold text-slate-200 group-hover:text-white flex items-center gap-2">
                  <span>{t.export.formats.png}</span>
                  <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded font-semibold uppercase">
                    300 DPI
                  </span>
                </div>
                <div className="text-xs text-slate-400">{t.export.desc.png}</div>
              </div>
            </div>
            <span className="material-icons-round text-slate-500 group-hover:text-purple-400">arrow_forward</span>
          </button>

          {/* 5. Excel */}
          <button 
            onClick={() => onExport('excel')}
            className="w-full flex items-center justify-between p-4 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-emerald-500/50 transition-all group"
          >
            <div className="flex items-center gap-3">
              <span className="material-icons-round text-emerald-400 text-2xl">table_view</span>
              <div className="text-left">
                <div className="text-sm font-bold text-slate-200 group-hover:text-white">{t.export.formats.excel}</div>
                <div className="text-xs text-slate-400">{t.export.desc.excel}</div>
              </div>
            </div>
            <span className="material-icons-round text-slate-500 group-hover:text-emerald-400">arrow_forward</span>
          </button>

          {/* 6. JSON */}
          <button 
            onClick={() => onExport('json')}
            className="w-full flex items-center justify-between p-4 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-cyan-500/50 transition-all group"
          >
            <div className="flex items-center gap-3">
              <span className="material-icons-round text-cyan-400 text-2xl">data_object</span>
              <div className="text-left">
                <div className="text-sm font-bold text-slate-200 group-hover:text-white">{t.export.formats.json}</div>
                <div className="text-xs text-slate-400">{t.export.desc.json}</div>
              </div>
            </div>
            <span className="material-icons-round text-slate-500 group-hover:text-cyan-400">arrow_forward</span>
          </button>
        </div>

        <div className="mt-6 flex justify-end">
          <button 
            onClick={onClose}
            disabled={isExporting}
            className={`px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm font-medium ${isExporting ? 'opacity-30 cursor-not-allowed pointer-events-none' : ''}`}
          >
            {t.inputPanel.close}
          </button>
        </div>
      </div>
    </div>
  );
};
