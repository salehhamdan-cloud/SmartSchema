import React from 'react';

interface CanvasZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitDiagram: () => void;
  onResetZoom: () => void;
  isLayoutLocked?: boolean;
  onToggleLayoutLocked?: () => void;
  isAnnotating?: boolean;
  onToggleAnnotating?: () => void;
  t: any;
  isRTL: boolean;
}

export const CanvasZoomControls: React.FC<CanvasZoomControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onFitDiagram,
  onResetZoom,
  isLayoutLocked,
  onToggleLayoutLocked,
  isAnnotating,
  onToggleAnnotating,
  t,
  isRTL
}) => {
  const cT = t.canvasControls || {};

  return (
    <div
      className={`fixed bottom-4 sm:bottom-6 ${
        isRTL ? 'left-4 sm:left-6' : 'right-4 sm:right-6'
      } z-30 flex items-center gap-1.5 p-1.5 bg-slate-900/90 hover:bg-slate-900 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl transition-all select-none`}
      style={{ touchAction: 'none' }}
    >
      {/* Zoom In */}
      <button
        type="button"
        onClick={onZoomIn}
        className="w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 text-slate-200 hover:text-white flex items-center justify-center transition-colors border border-slate-700/60 shadow-sm"
        title={cT.zoomIn || 'Zoom In'}
        aria-label={cT.zoomIn || 'Zoom In'}
      >
        <span className="material-icons-round text-lg">add</span>
      </button>

      {/* Zoom Out */}
      <button
        type="button"
        onClick={onZoomOut}
        className="w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 text-slate-200 hover:text-white flex items-center justify-center transition-colors border border-slate-700/60 shadow-sm"
        title={cT.zoomOut || 'Zoom Out'}
        aria-label={cT.zoomOut || 'Zoom Out'}
      >
        <span className="material-icons-round text-lg">remove</span>
      </button>

      {/* Fit Diagram */}
      <button
        type="button"
        onClick={onFitDiagram}
        className="w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 text-slate-200 hover:text-white flex items-center justify-center transition-colors border border-slate-700/60 shadow-sm"
        title={cT.fitDiagram || 'Fit Diagram to Screen'}
        aria-label={cT.fitDiagram || 'Fit Diagram to Screen'}
      >
        <span className="material-icons-round text-lg">crop_free</span>
      </button>

      {/* Reset Zoom 100% */}
      <button
        type="button"
        onClick={onResetZoom}
        className="w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 text-slate-200 hover:text-white flex items-center justify-center transition-colors border border-slate-700/60 shadow-sm text-xs font-bold"
        title={cT.resetZoom || 'Reset View (100%)'}
        aria-label={cT.resetZoom || 'Reset View (100%)'}
      >
        <span className="material-icons-round text-base">center_focus_strong</span>
      </button>

      {/* Toggle Lock / Unlock Layout (if available) */}
      {onToggleLayoutLocked && (
        <button
          type="button"
          onClick={onToggleLayoutLocked}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors border shadow-sm ${
            isLayoutLocked
              ? 'bg-amber-600/30 border-amber-500/60 text-amber-300 hover:bg-amber-600/40'
              : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border-slate-700/60'
          }`}
          title={
            isLayoutLocked
              ? cT.unlockPan || 'Unlock Layout'
              : cT.lockPan || 'Lock Layout'
          }
          aria-label={
            isLayoutLocked
              ? cT.unlockPan || 'Unlock Layout'
              : cT.lockPan || 'Lock Layout'
          }
        >
          <span className="material-icons-round text-base">
            {isLayoutLocked ? 'lock' : 'lock_open'}
          </span>
        </button>
      )}

      {/* Toggle Drawing & Annotations */}
      {onToggleAnnotating && (
        <button
          type="button"
          onClick={onToggleAnnotating}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all border shadow-sm ${
            isAnnotating
              ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30'
              : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700/60'
          }`}
          title={cT.drawMode || 'Drawing & Annotations'}
          aria-label={cT.drawMode || 'Drawing & Annotations'}
        >
          <span className="material-icons-round text-base">edit</span>
        </button>
      )}
    </div>
  );
};
