import React, { useState } from 'react';
import { Language, Theme } from '../types';

export const MASTER_APP_PASSWORD = 'Sh@1987s';

interface AppLockScreenProps {
  onUnlock: () => void;
  t: any;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  theme: Theme;
  onToggleTheme: () => void;
  isRTL: boolean;
}

export const AppLockScreen: React.FC<AppLockScreenProps> = ({
  onUnlock,
  t,
  language,
  onLanguageChange,
  theme,
  onToggleTheme,
  isRTL
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isShaking, setIsShaking] = useState(false);

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 600);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (password === MASTER_APP_PASSWORD) {
      onUnlock();
    } else {
      setErrorMessage(t.auth?.wrongPassword || 'Incorrect password. Please try again.');
      triggerShake();
    }
  };

  return (
    <div 
      className={`min-h-screen w-full flex flex-col justify-between relative overflow-hidden font-sans select-none ${
        theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-900 text-slate-100'
      } ${isRTL ? 'rtl' : 'ltr'}`} 
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Background ambient lighting */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-sky-500/5 rounded-full blur-3xl"></div>
        {/* Circuit grid subtle overlay */}
        <div 
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #38bdf8 1px, transparent 0)`,
            backgroundSize: '24px 24px'
          }}
        />
      </div>

      {/* Top utility bar (Language, Theme, Branding) */}
      <header className="relative z-10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="material-icons-round text-white text-2xl">electrical_services</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight leading-none">{t.appName || 'SmartSchema'}</h1>
            <span className="text-[10px] text-slate-400 font-mono font-medium">Single-Line Diagram CAD</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Language selector */}
          <div className="flex bg-slate-800/80 backdrop-blur-md rounded-xl border border-slate-700/80 p-0.5 shadow-md overflow-hidden">
            {(['en', 'he', 'ar'] as Language[]).map((lang) => (
              <button 
                key={lang} 
                onClick={() => onLanguageChange(lang)} 
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  language === lang 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Theme toggle */}
          <button 
            onClick={onToggleTheme} 
            className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 rounded-xl border border-slate-700/80 backdrop-blur-md transition-colors cursor-pointer"
            title={t.toggleTheme}
          >
            <span className="material-icons-round text-lg">{theme === 'light' ? 'dark_mode' : 'light_mode'}</span>
          </button>
        </div>
      </header>

      {/* Centered Login Card */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4">
        <div 
          className={`w-full max-w-md bg-slate-900/90 border border-slate-800/90 rounded-2xl shadow-2xl shadow-black/60 p-7 md:p-8 backdrop-blur-xl transition-transform duration-300 ${
            isShaking ? 'animate-bounce' : ''
          }`}
        >
          {/* Top lock icon banner */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner mb-4 bg-sky-500/15 border border-sky-500/30 text-sky-400">
              <span className="material-icons-round text-3xl">
                lock
              </span>
            </div>

            <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight mb-1.5">
              {t.auth?.enterPassword || 'Enter App Password'}
            </h2>
            <p className="text-xs md:text-sm text-slate-400 leading-relaxed max-w-sm">
              {t.auth?.enterPasswordDesc || 'Please enter your password to access your single-line diagram workspace.'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Primary password field */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {t.auth?.password || 'Password'}
              </label>
              <div className="relative">
                <span className="absolute top-1/2 -translate-y-1/2 left-3.5 material-icons-round text-slate-500 text-lg pointer-events-none">
                  key
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder={t.auth?.enterPasswordPlaceholder || 'Enter password...'}
                  autoFocus
                  required
                  className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl py-2.5 pl-10 pr-11 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  title={showPassword ? (t.auth?.hidePassword || 'Hide password') : (t.auth?.showPassword || 'Show password')}
                >
                  <span className="material-icons-round text-base">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {/* Error banner */}
            {errorMessage && (
              <div className="p-3 bg-red-950/70 border border-red-800/80 rounded-xl flex items-center gap-2.5 text-red-300 text-xs animate-fadeIn">
                <span className="material-icons-round text-red-400 text-base shrink-0">error_outline</span>
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Action button */}
            <button
              type="submit"
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-semibold text-sm shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 group cursor-pointer mt-2"
            >
              <span>
                {t.auth?.unlock || 'Unlock Workspace'}
              </span>
              <span className="material-icons-round text-base transition-transform group-hover:translate-x-0.5">
                arrow_forward
              </span>
            </button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
        <span className="material-icons-round text-sm text-emerald-400">lock</span>
        <span>{t.auth?.passwordProtectedBadge || 'Password Protected'} • SmartSchema Security</span>
      </footer>
    </div>
  );
};
