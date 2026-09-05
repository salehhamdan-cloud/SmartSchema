
import React from 'react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: 'svg' | 'png' | 'json' | 'excel' | 'pdf' | 'raster-pdf') => void;
  onOpenShare?: () => void;
  t: any;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, onExport, onOpenShare, t }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <span className="material-icons-round text-blue-400 text-xl">save_alt</span>
            </div>
            <h3 className="text-lg font-bold text-white">{t.export.title}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
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

          {/* 4. PNG Image */}
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
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm font-medium"
          >
            {t.inputPanel.close}
          </button>
        </div>
      </div>
    </div>
  );
};
