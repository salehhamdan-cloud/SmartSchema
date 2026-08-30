import React, { useState } from 'react';
import { AnnotationItem } from '../types';

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
  t,
  isRTL
}) => {
  const [isSavedRecently, setIsSavedRecently] = useState(false);
  const [showThicknessMenu, setShowThicknessMenu] = useState(false);

  if (!isAnnotating) return null;

  const handleSaveClick = () => {
    if (onSave) {
      onSave();
      setIsSavedRecently(true);
      setTimeout(() => setIsSavedRecently(false), 2000);
    }
  };

  const aT = t.annotations || {};

  return (
    <div
      className={`fixed top-16 md:top-20 ${
        isRTL ? 'left-4' : 'right-4'
      } z-50 flex flex-col gap-2 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-2.5 max-w-[calc(100vw-2rem)] sm:max-w-md animate-fadeIn select-none`}
      style={{ touchAction: 'none' }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2 px-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-purple-300">
            <span className="material-icons-round text-sm">brush</span>
          </div>
          <span className="text-xs font-bold text-slate-100">
            {aT.title || 'Annotations & Markup'}
          </span>
          {annotationsCount > 0 && (
            <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full font-medium">
              {annotationsCount}
            </span>
          )}
        </div>

        <button
          onClick={onToggleAnnotating}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title={aT.disable || 'Close Drawing'}
        >
          <span className="material-icons-round text-base">close</span>
        </button>
      </div>

      {/* Main Tools Row: Pen / Highlighter / Eraser */}
      <div className="grid grid-cols-3 gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
        <button
          type="button"
          onClick={() => onAnnotationToolChange('pen')}
          className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold transition-all ${
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
          className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold transition-all ${
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
          className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold transition-all ${
            annotationTool === 'eraser'
              ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
              : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
          }`}
          title={aT.eraser || 'Eraser'}
        >
          <span className="material-icons-round text-sm">auto_fix_normal</span>
          <span>{aT.eraser || 'Eraser'}</span>
        </button>
      </div>

      {/* Color Palette & Stroke Size (Hidden when eraser is active) */}
      {annotationTool !== 'eraser' && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {/* Quick Color Swatches */}
          <div className="flex items-center gap-1.5">
            {PRESET_COLORS.map(c => {
              const isSelected = annotationColor.toLowerCase() === c.hex.toLowerCase();
              return (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => onAnnotationColorChange(c.hex)}
                  className={`w-7 h-7 rounded-full transition-transform border-2 flex items-center justify-center ${
                    isSelected
                      ? 'scale-110 border-white shadow-lg'
                      : 'border-slate-700 hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.hex }}
                  title={c.label}
                >
                  {isSelected && (
                    <span
                      className="material-icons-round text-xs font-bold"
                      style={{ color: c.hex === '#ffffff' ? '#000000' : '#ffffff' }}
                    >
                      check
                    </span>
                  )}
                </button>
              );
            })}

            {/* Custom Color Input */}
            <div className="relative flex items-center">
              <input
                type="color"
                value={annotationColor}
                onChange={e => onAnnotationColorChange(e.target.value)}
                className="w-7 h-7 rounded-full cursor-pointer bg-transparent border border-slate-700 p-0 overflow-hidden"
                title={aT.color || 'Custom Color'}
              />
            </div>
          </div>

          {/* Stroke Width Selector */}
          <div className="flex items-center gap-1 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700">
            {[
              { w: 2, label: aT.thin || '2px', dotSize: 'w-1.5 h-1.5' },
              { w: 4, label: aT.medium || '4px', dotSize: 'w-2.5 h-2.5' },
              { w: 8, label: aT.thick || '8px', dotSize: 'w-3.5 h-3.5' },
              { w: 14, label: aT.highlighterSize || '14px', dotSize: 'w-4.5 h-4.5' }
            ].map(item => {
              const isSelected = annotationWidth === item.w;
              return (
                <button
                  key={item.w}
                  type="button"
                  onClick={() => onAnnotationWidthChange(item.w)}
                  className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
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
      )}

      {/* Eraser hint when active */}
      {annotationTool === 'eraser' && (
        <div className="text-[11px] text-slate-400 bg-slate-800/60 p-2 rounded-lg border border-slate-700/40 flex items-center gap-2">
          <span className="material-icons-round text-sm text-red-400">info</span>
          <span>{aT.eraserHint || 'Tap or click on any stroke line to erase it.'}</span>
        </div>
      )}

      {/* Action Buttons: Undo, Clear, Save */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800">
        <div className="flex items-center gap-1.5">
          {/* Undo */}
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors border ${
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
            className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors border ${
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

        {/* Save Annotations Button */}
        {onSave && (
          <button
            type="button"
            onClick={handleSaveClick}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-lg ${
              isSavedRecently
                ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
            }`}
            title={aT.saveAnnotations || 'Save Annotations to Project'}
          >
            <span className="material-icons-round text-sm">
              {isSavedRecently ? 'check_circle' : 'save'}
            </span>
            <span>
              {isSavedRecently
                ? aT.annotationsSaved || 'Saved!'
                : aT.saveAnnotations || 'Save Markup'}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
