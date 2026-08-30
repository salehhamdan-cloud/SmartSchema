import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AnnotationItem, PalmRejectionMode } from '../types';

interface AnnotationToolbarProps {
  isAnnotating: boolean;
  onToggleAnnotating: () => void;
  annotationColor: string;
  onAnnotationColorChange: (color: string) => void;
  annotationWidth: number;
  onAnnotationWidthChange: (width: number) => void;
  annotationTool: 'pen' | 'highlighter' | 'eraser';
  onAnnotationToolChange: (tool: 'pen' | 'highlighter' | 'eraser') => void;
  onUndo: () => void;
  canUndo: boolean;
  onClear: () => void;
  annotationsCount: number;
  onSave?: () => void;
  palmRejectionMode?: PalmRejectionMode;
  onPalmRejectionModeChange?: (mode: PalmRejectionMode) => void;
  isStylusActive?: boolean;
  t: any;
  isRTL: boolean;
}

const PRESET_COLORS = [
  { hex: '#ef4444', label: 'Red' },
  { hex: '#3b82f6', label: 'Blue' },
  { hex: '#10b981', label: 'Green' },
  { hex: '#f59e0b', label: 'Amber' },
  { hex: '#8b5cf6', label: 'Purple' },
  { hex: '#ffffff', label: 'White' },
  { hex: '#0f172a', label: 'Dark' }
];

export const AnnotationToolbar: React.FC<AnnotationToolbarProps> = ({
  isAnnotating,
  onToggleAnnotating,
  annotationColor,
  onAnnotationColorChange,
  annotationWidth,
  onAnnotationWidthChange,
  annotationTool,
  onAnnotationToolChange,
  onUndo,
  canUndo,
  onClear,
  annotationsCount,
  onSave,
  palmRejectionMode = 'smart-palm',
  onPalmRejectionModeChange,
  isStylusActive = false,
  t,
  isRTL
}) => {
  const [isSavedRecently, setIsSavedRecently] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  
  // Draggable position state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Initialize initial position once
  useEffect(() => {
    if (position === null && typeof window !== 'undefined') {
      const initialX = isRTL ? 24 : Math.max(20, window.innerWidth - 380);
      const initialY = 76;
      setPosition({ x: initialX, y: initialY });
    }
  }, [isRTL, position]);

  if (!isAnnotating) return null;

  const handlePointerDownDrag = (e: React.PointerEvent) => {
    // Only drag from header or drag handle
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) return;

    e.preventDefault();
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const rect = toolbar.getBoundingClientRect();
    dragStartOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    isDraggingRef.current = true;

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (_) {}

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const newX = Math.max(10, Math.min(window.innerWidth - (rect.width || 280), moveEvent.clientX - dragStartOffsetRef.current.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 80, moveEvent.clientY - dragStartOffsetRef.current.y));
      setPosition({ x: newX, y: newY });
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      isDraggingRef.current = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const handleSaveClick = () => {
    if (onSave) {
      onSave();
      setIsSavedRecently(true);
      setTimeout(() => setIsSavedRecently(false), 2200);
    }
  };

  const aT = t.annotations || {};

  // Render Minimized Pill
  if (isMinimized) {
    return (
      <div
        ref={toolbarRef}
        className="fixed z-50 flex items-center gap-1.5 bg-slate-900/95 backdrop-blur-md border border-purple-500/60 rounded-full shadow-2xl p-1.5 animate-fadeIn select-none cursor-move"
        style={{
          left: position ? `${position.x}px` : undefined,
          top: position ? `${position.y}px` : undefined,
          touchAction: 'none'
        }}
        onPointerDown={handlePointerDownDrag}
      >
        {/* Drag handle */}
        <div className="flex items-center text-slate-400 pl-1">
          <span className="material-icons-round text-sm">drag_indicator</span>
        </div>

        {/* Current Tool preview */}
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold border border-white/30"
          style={{ backgroundColor: annotationTool === 'eraser' ? '#ef4444' : annotationColor }}
          title={`${aT.title || 'Drawing'}: ${annotationTool}`}
        >
          <span className="material-icons-round text-sm">
            {annotationTool === 'eraser' ? 'auto_fix_normal' : annotationTool === 'highlighter' ? 'highlight' : 'edit'}
          </span>
        </div>

        {/* Undo */}
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="p-1 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title={aT.undo || 'Undo'}
        >
          <span className="material-icons-round text-sm">undo</span>
        </button>

        {/* Expand full toolbar */}
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="px-2 py-1 bg-purple-600/80 hover:bg-purple-600 text-white rounded-full text-[11px] font-bold flex items-center gap-1 transition-colors shadow-sm"
          title={aT.expand || 'Expand Toolbar'}
        >
          <span className="material-icons-round text-xs">unfold_more</span>
          <span>{aT.expand || 'Expand'}</span>
        </button>

        {/* Close Drawing Mode */}
        <button
          type="button"
          onClick={onToggleAnnotating}
          className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title={aT.disable || 'Close Drawing'}
        >
          <span className="material-icons-round text-sm">close</span>
        </button>
      </div>
    );
  }

  // Render Full Draggable Toolbar
  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 flex flex-col gap-2 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-2.5 w-[330px] sm:w-[360px] max-w-[calc(100vw-1.5rem)] animate-fadeIn select-none"
      style={{
        left: position ? `${position.x}px` : undefined,
        top: position ? `${position.y}px` : undefined,
        touchAction: 'none'
      }}
    >
      {/* Header bar with Drag Handle */}
      <div
        onPointerDown={handlePointerDownDrag}
        className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2 px-1 cursor-move"
        title={aT.dragToolbar || 'Drag to reposition toolbar'}
      >
        <div className="flex items-center gap-1.5">
          <span className="material-icons-round text-slate-400 text-sm">drag_indicator</span>
          <div className="w-6 h-6 rounded-lg bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-purple-300">
            <span className="material-icons-round text-sm">brush</span>
          </div>
          <span className="text-xs font-bold text-slate-100">
            {aT.title || 'Annotations & Markup'}
          </span>
          {annotationsCount > 0 && (
            <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.2 rounded-full font-medium">
              {annotationsCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Live Stylus Active Badge */}
          {isStylusActive && (
            <div
              className="flex items-center gap-1 bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              title={aT.stylusActive || 'Stylus Active'}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="hidden sm:inline">{aT.stylusActive || 'Stylus'}</span>
            </div>
          )}

          {/* Minimize button */}
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title={aT.minimize || 'Minimize Toolbar'}
          >
            <span className="material-icons-round text-base">minimize</span>
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={onToggleAnnotating}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title={aT.disable || 'Close Drawing'}
          >
            <span className="material-icons-round text-base">close</span>
          </button>
        </div>
      </div>

      {/* Main Tools Row: Pen / Highlighter / Smart Eraser */}
      <div className="grid grid-cols-3 gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
        <button
          type="button"
          onClick={() => onAnnotationToolChange('pen')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
            annotationTool === 'pen'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
              : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
          }`}
          title={aT.pen || 'Pen'}
        >
          <span className="material-icons-round text-sm">edit</span>
          <span>{aT.pen || 'Pen'}</span>
        </button>

        <button
          type="button"
          onClick={() => onAnnotationToolChange('highlighter')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
            annotationTool === 'highlighter'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
              : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
          }`}
          title={aT.highlighter || 'Highlighter'}
        >
          <span className="material-icons-round text-sm">highlight</span>
          <span>{aT.highlighter || 'Marker'}</span>
        </button>

        <button
          type="button"
          onClick={() => onAnnotationToolChange('eraser')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
            annotationTool === 'eraser'
              ? 'bg-red-600 text-white shadow-md shadow-red-600/30 ring-2 ring-red-400/50'
              : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
          }`}
          title={aT.eraser || 'Smart Partial Eraser'}
        >
          <span className="material-icons-round text-sm">auto_fix_normal</span>
          <span>{aT.partialEraser || 'Smart Eraser'}</span>
        </button>
      </div>

      {/* Palm Rejection & Input Recognition Mode Selector */}
      {onPalmRejectionModeChange && (
        <div className="bg-slate-800/70 p-1.5 rounded-xl border border-slate-700/60 flex flex-col gap-1">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <span className="material-icons-round text-xs text-blue-400">front_hand</span>
              <span>{aT.palmRejection || 'Palm Rejection'}</span>
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              {palmRejectionMode === 'pen-only'
                ? aT.penOnlyShort || 'Stylus Only'
                : palmRejectionMode === 'smart-palm'
                ? aT.smartPalmShort || 'Smart Auto'
                : aT.touchAndPenShort || 'Touch + Pen'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={() => onPalmRejectionModeChange('pen-only')}
              className={`flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                palmRejectionMode === 'pen-only'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
              title={aT.penOnlyDesc || 'Palm Rejection ON. Rest hand on screen; only active stylus draws, accidental palm touches are ignored.'}
            >
              <span className="material-icons-round text-xs">edit_attributes</span>
              <span className="truncate">{aT.penOnlyShort || 'Stylus Only'}</span>
            </button>

            <button
              type="button"
              onClick={() => onPalmRejectionModeChange('smart-palm')}
              className={`flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                palmRejectionMode === 'smart-palm'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
              title={aT.smartPalmDesc || 'Auto-detects stylus and blocks wide palm contact points while writing.'}
            >
              <span className="material-icons-round text-xs">auto_awesome</span>
              <span className="truncate">{aT.smartPalmShort || 'Smart Auto'}</span>
            </button>

            <button
              type="button"
              onClick={() => onPalmRejectionModeChange('touch-and-pen')}
              className={`flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                palmRejectionMode === 'touch-and-pen'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
              title={aT.touchAndPenDesc || 'Allows drawing with any touch or stylus input.'}
            >
              <span className="material-icons-round text-xs">touch_app</span>
              <span className="truncate">{aT.touchAndPenShort || 'Touch + Pen'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Color Palette & Stroke Size (Hidden when eraser is active) */}
      {annotationTool !== 'eraser' ? (
        <div className="flex items-center justify-between gap-1.5 pt-0.5">
          {/* Quick Color Swatches */}
          <div className="flex items-center gap-1">
            {PRESET_COLORS.map(c => {
              const isSelected = annotationColor.toLowerCase() === c.hex.toLowerCase();
              return (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => onAnnotationColorChange(c.hex)}
                  className={`w-6 h-6 rounded-full transition-transform border-2 flex items-center justify-center ${
                    isSelected
                      ? 'scale-110 border-white shadow-lg'
                      : 'border-slate-700 hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.hex }}
                  title={c.label}
                >
                  {isSelected && (
                    <span
                      className="material-icons-round text-[10px] font-bold"
                      style={{ color: c.hex === '#ffffff' ? '#000000' : '#ffffff' }}
                    >
                      check
                    </span>
                  )}
                </button>
              );
            })}

            {/* Custom Color Input */}
            <div className="relative flex items-center ml-0.5">
              <input
                type="color"
                value={annotationColor}
                onChange={e => onAnnotationColorChange(e.target.value)}
                className="w-6 h-6 rounded-full cursor-pointer bg-transparent border border-slate-700 p-0 overflow-hidden"
                title={aT.color || 'Custom Color'}
              />
            </div>
          </div>

          {/* Stroke Width Selector */}
          <div className="flex items-center gap-0.5 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700">
            {[
              { w: 2, label: aT.thin || '2px', dotSize: 'w-1 h-1' },
              { w: 4, label: aT.medium || '4px', dotSize: 'w-2 h-2' },
              { w: 8, label: aT.thick || '8px', dotSize: 'w-3 h-3' },
              { w: 14, label: aT.highlighterSize || '14px', dotSize: 'w-4 h-4' }
            ].map(item => {
              const isSelected = annotationWidth === item.w;
              return (
                <button
                  key={item.w}
                  type="button"
                  onClick={() => onAnnotationWidthChange(item.w)}
                  className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                  }`}
                  title={`${aT.strokeWidth || 'Size'}: ${item.label}`}
                >
                  <div
                    className={`${item.dotSize} rounded-full`}
                    style={{ backgroundColor: isSelected ? '#ffffff' : '#94a3b8' }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* Smart Partial Eraser interactive guide */
        <div className="text-[11px] text-slate-300 bg-red-950/40 p-2 rounded-xl border border-red-800/50 flex items-center gap-2">
          <span className="material-icons-round text-sm text-red-400 animate-pulse">auto_fix_high</span>
          <span>{aT.eraserHint || 'Drag over any line to erase parts cleanly with live slice precision.'}</span>
        </div>
      )}

      {/* Action Buttons: Undo, Clear, Autosave Indicator & Save Button */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
        <div className="flex items-center gap-1.5">
          {/* Undo */}
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors border ${
              canUndo
                ? 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border-slate-700'
                : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
            }`}
            title={aT.undo || 'Undo Stroke'}
          >
            <span className="material-icons-round text-sm">undo</span>
            <span className="hidden sm:inline">{aT.undo || 'Undo'}</span>
          </button>

          {/* Clear All */}
          <button
            type="button"
            onClick={onClear}
            disabled={annotationsCount === 0}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors border ${
              annotationsCount > 0
                ? 'bg-slate-800 text-red-400 hover:bg-red-950/60 hover:text-red-300 border-slate-700 hover:border-red-800'
                : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
            }`}
            title={aT.clear || 'Clear All'}
          >
            <span className="material-icons-round text-sm">delete_sweep</span>
            <span className="hidden sm:inline">{aT.clear || 'Clear'}</span>
          </button>
        </div>

        {/* Save Button with Auto-save feedback */}
        <div className="flex items-center gap-1.5">
          {onSave && (
            <button
              type="button"
              onClick={handleSaveClick}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-md ${
                isSavedRecently
                  ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
              }`}
              title={aT.saveAnnotations || 'Save Markup'}
            >
              <span className="material-icons-round text-sm">
                {isSavedRecently ? 'check_circle' : 'save'}
              </span>
              <span>
                {isSavedRecently
                  ? aT.annotationsSaved || 'Saved!'
                  : aT.saveAnnotations || 'Save'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
