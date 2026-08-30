import React from 'react';
import { MASTER_APP_PASSWORD } from './AppLockScreen';

interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogOut: () => void;
  t: any;
}

export const SecurityModal: React.FC<SecurityModalProps> = ({
  isOpen,
  onClose,
  onLogOut,
  t
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full p-6 relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-blue-600/15 to-transparent pointer-events-none"></div>

        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center">
              <span className="material-icons-round text-xl">shield</span>
            </div>
            <div>
              <h3 className="font-bold text-white text-base leading-tight">
                {t.auth?.securitySettings || 'Security & Password'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {t.auth?.securitySettingsDesc || 'Permanent password protection is enabled for your SmartSchema workspace.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <span className="material-icons-round text-lg">close</span>
          </button>
        </div>

        {/* Info Content */}
        <div className="space-y-4 relative z-10">
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-2.5">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
              <span className="material-icons-round text-base">verified_user</span>
              <span>Permanent Master Protection Active</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Every workstation and browser session requires the permanent master password to access your diagrams.
            </p>
            <div className="flex items-center justify-between bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg text-xs">
              <span className="text-slate-400">Master Password:</span>
              <span className="font-mono font-semibold text-sky-400 tracking-wider">••••••••</span>
            </div>
          </div>

          {/* Log Out / Lock Area */}
          <div className="bg-red-950/30 border border-red-900/40 rounded-xl p-4 flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-200">{t.auth?.logout || 'Log Out & Lock'}</span>
              <span className="text-[11px] text-slate-400 mt-0.5">{t.auth?.logoutTooltip || 'Lock workspace immediately'}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogOut();
              }}
              className="py-2 px-3.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-red-600/20 flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <span className="material-icons-round text-sm">lock</span>
              <span>{t.auth?.lockNow || 'Lock Now'}</span>
            </button>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition-colors cursor-pointer"
            >
              {t.inputPanel?.close || 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
