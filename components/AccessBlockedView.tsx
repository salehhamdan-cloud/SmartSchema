import React, { useState } from 'react';

interface AccessBlockedViewProps {
  status: 'disabled' | 'revoked' | 'expired' | 'locked';
  t: any;
  correctPasscode?: string;
  onUnlock?: () => void;
  onGoHome?: () => void;
}

export const AccessBlockedView: React.FC<AccessBlockedViewProps> = ({
  status,
  t,
  correctPasscode,
  onUnlock,
  onGoHome
}) => {
  const [inputPasscode, setInputPasscode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPasscode.trim()) return;
    if (correctPasscode && inputPasscode.trim() === correctPasscode.trim()) {
      setErrorMsg('');
      if (onUnlock) onUnlock();
    } else {
      setErrorMsg(t.share?.invalidPasscode || "Incorrect passcode. Please try again.");
    }
  };

  const getDetails = () => {
    switch (status) {
      case 'expired':
        return {
          icon: 'timer_off',
          iconColor: 'text-amber-400 bg-amber-500/20 border-amber-500/40',
          title: t.share?.linkExpiredTitle || "Diagram Link Expired",
          desc: t.share?.linkExpiredDesc || "The expiration time set for this shared diagram link has passed. Please contact the project author for a new link."
        };
      case 'locked':
        return {
          icon: 'lock',
          iconColor: 'text-blue-400 bg-blue-500/20 border-blue-500/40',
          title: t.share?.passcodeRequiredTitle || "Passcode Protected Diagram",
          desc: t.share?.passcodeRequiredDesc || "Please enter the access passcode provided by the diagram engineer to view this project."
        };
      case 'revoked':
      case 'disabled':
      default:
        return {
          icon: 'link_off',
          iconColor: 'text-red-400 bg-red-500/20 border-red-500/40',
          title: t.share?.accessDeniedTitle || "Diagram Access Disabled",
          desc: t.share?.accessDeniedDesc || "The owner of this electrical diagram has disabled or revoked public link access."
        };
    }
  };

  const details = getDetails();

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-slate-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-8 text-center space-y-6 animate-fadeIn">
        <div className={`w-16 h-16 mx-auto rounded-2xl border flex items-center justify-center ${details.iconColor}`}>
          <span className="material-icons-round text-3xl">{details.icon}</span>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white tracking-tight">{details.title}</h2>
          <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
            {details.desc}
          </p>
        </div>

        {status === 'locked' && (
          <form onSubmit={handleUnlockSubmit} className="space-y-4">
            <div className="space-y-2 text-left">
              <label className="text-xs font-semibold text-slate-300">
                {t.share?.enterPasscode || "Enter Passcode"}
              </label>
              <input
                type="password"
                autoFocus
                value={inputPasscode}
                onChange={(e) => {
                  setInputPasscode(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="••••"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-center text-lg tracking-widest text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
              {errorMsg && (
                <p className="text-xs text-red-400 font-medium text-center">{errorMsg}</p>
              )}
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <span className="material-icons-round text-sm">lock_open</span>
              <span>{t.share?.unlock || "Unlock & View"}</span>
            </button>
          </form>
        )}

        {status !== 'locked' && (
          <div className="pt-2 text-[11px] text-slate-500 font-medium">
            SmartSchema &bull; Protected Shared Diagram
          </div>
        )}
      </div>
    </div>
  );
};
