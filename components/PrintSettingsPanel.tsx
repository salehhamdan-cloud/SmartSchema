import React, { useState, useEffect, useRef } from 'react';
import { PrintMetadata, PrintRevision } from '../types';

interface PrintSettingsPanelProps {
  metadata: PrintMetadata;
  projectName?: string;
  onChange: (metadata: PrintMetadata) => void;
  onUpdateProjectName?: (name: string) => void;
  onClose: () => void;
  focusField?: string;
  t: any;
}

export const PrintSettingsPanel: React.FC<PrintSettingsPanelProps> = ({ 
    metadata, 
    projectName = '', 
    onChange, 
    onUpdateProjectName, 
    onClose, 
    focusField,
    t 
}) => {
  const [formData, setFormData] = useState<PrintMetadata>(metadata);
  const [localProjectName, setLocalProjectName] = useState(projectName);
  
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Focus effect
  useEffect(() => {
    if (focusField) {
        if (inputRefs.current[focusField]) {
            inputRefs.current[focusField]?.focus();
            inputRefs.current[focusField]?.select();
        } else if (focusField === 'revisions') {
            const firstRevInput = document.getElementById('rev-input-0');
            if (firstRevInput) firstRevInput.focus();
        }
    }
  }, [focusField]);

  // Sync with prop changes
  useEffect(() => {
    setFormData(prev => {
        if (
            prev.engineer === metadata.engineer &&
            prev.editorProfession === metadata.editorProfession &&
            prev.organization === metadata.organization &&
            prev.date === metadata.date &&
            prev.revision === metadata.revision &&
            prev.approvedBy === metadata.approvedBy &&
            prev.email === metadata.email &&
            prev.phone === metadata.phone &&
            prev.logo === metadata.logo &&
            JSON.stringify(prev.revisions || []) === JSON.stringify(metadata.revisions || [])
        ) {
            return prev;
        }
        return metadata;
    });
  }, [metadata]);

  useEffect(() => {
      setLocalProjectName(projectName);
  }, [projectName]);

  // Debounced update for metadata
  useEffect(() => {
    const timer = setTimeout(() => {
        onChange(formData);
    }, 300);
    return () => clearTimeout(timer);
  }, [formData, onChange]);

  // Debounced update for project name
  useEffect(() => {
    const timer = setTimeout(() => {
        if (localProjectName !== projectName && onUpdateProjectName) {
            onUpdateProjectName(localProjectName);
        }
    }, 300);
    return () => clearTimeout(timer);
  }, [localProjectName, projectName, onUpdateProjectName]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Please upload an image smaller than 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setFormData(prev => ({ ...prev, logo: dataUrl }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveLogo = () => {
    setFormData(prev => ({ ...prev, logo: '' }));
  };

  const handleAddRevision = () => {
    let currentRevs = formData.revisions ? [...formData.revisions] : [];
    if (currentRevs.length === 0 && (formData.revision || formData.date)) {
      currentRevs.push({
        id: `rev-init-${Date.now()}`,
        revision: formData.revision || 'Rev A',
        date: formData.date || new Date().toISOString().slice(0, 10),
        description: ''
      });
    }
    const count = currentRevs.length;
    const nextCode = `Rev ${String.fromCharCode(65 + count)}`;
    const today = new Date().toISOString().slice(0, 10);
    const newRev: PrintRevision = {
      id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      revision: nextCode,
      date: today,
      description: ''
    };
    const updated = [...currentRevs, newRev];
    setFormData(prev => ({
      ...prev,
      revisions: updated,
      revision: newRev.revision,
      date: newRev.date
    }));
  };

  const handleUpdateRevision = (id: string, field: 'revision' | 'date' | 'description', value: string) => {
    const currentRevs = formData.revisions || [];
    const updated = currentRevs.map(r => r.id === id ? { ...r, [field]: value } : r);
    const last = updated[updated.length - 1];
    setFormData(prev => ({
      ...prev,
      revisions: updated,
      revision: last ? last.revision : prev.revision,
      date: last ? last.date : prev.date
    }));
  };

  const handleRemoveRevision = (id: string) => {
    const currentRevs = formData.revisions || [];
    const updated = currentRevs.filter(r => r.id !== id);
    const last = updated[updated.length - 1];
    setFormData(prev => ({
      ...prev,
      revisions: updated,
      revision: last ? last.revision : '',
      date: last ? last.date : ''
    }));
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg overflow-hidden sticky top-4">
      <div className="p-4 border-b border-slate-700 bg-slate-900 flex items-center justify-between">
        <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <span className="material-icons-round text-blue-400">print</span>
            {t.printSettings.title}
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white" title={t.inputPanel.close}>
            <span className="material-icons-round">close</span>
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Project Name */}
        <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">{t.printLayout.project}</label>
            <input
                ref={el => { inputRefs.current['projectName'] = el; }}
                type="text"
                value={localProjectName}
                onChange={(e) => setLocalProjectName(e.target.value)}
                placeholder="Project Name"
                className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm font-bold"
            />
        </div>

        {/* Company / Organization & Logo */}
        <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">{t.printSettings.organization}</label>
            <input
                ref={el => { inputRefs.current['organization'] = el; }}
                type="text"
                name="organization"
                value={formData.organization}
                onChange={handleChange}
                placeholder="Company / Organization Name"
                className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
            />
        </div>

        {/* Company Logo Upload & Preview */}
        <div className="p-3 bg-slate-900/70 rounded-lg border border-slate-700/70 space-y-2">
            <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <span className="material-icons-round text-sm text-blue-400">image</span>
                    {t.printSettings.logo || "Company Logo"}
                </label>
                {formData.logo && (
                    <button 
                        type="button" 
                        onClick={handleRemoveLogo}
                        className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1"
                    >
                        <span className="material-icons-round text-xs">delete</span>
                        {t.printSettings.removeLogo || "Remove"}
                    </button>
                )}
            </div>

            <input 
                ref={fileInputRef}
                type="file" 
                accept="image/png,image/jpeg,image/svg+xml,image/webp" 
                onChange={handleLogoUpload}
                className="hidden" 
            />

            {formData.logo ? (
                <div className="flex items-center gap-3 bg-slate-800 p-2 rounded border border-slate-700">
                    <div className="w-16 h-12 bg-white rounded flex items-center justify-center p-1 overflow-hidden shrink-0 border border-slate-600">
                        <img 
                            src={formData.logo} 
                            alt="Logo preview" 
                            className="max-w-full max-h-full object-contain"
                            referrerPolicy="no-referrer"
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-300 truncate font-medium">Logo attached</p>
                        <button 
                            type="button" 
                            onClick={() => fileInputRef.current?.click()}
                            className="text-[11px] text-blue-400 hover:text-blue-300 underline mt-0.5"
                        >
                            {t.printSettings.uploadLogo || "Change Image"}
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2 px-3 border border-dashed border-slate-600 hover:border-blue-500 rounded-lg text-slate-400 hover:text-blue-400 text-xs flex items-center justify-center gap-2 transition-colors bg-slate-800/40"
                >
                    <span className="material-icons-round text-sm">add_photo_alternate</span>
                    <span>{t.printSettings.uploadLogo || "Upload Company Logo"}</span>
                </button>
            )}
            <p className="text-[10px] text-slate-500">{t.printSettings.logoHint || "PNG, JPG, or SVG (Max 2MB)"}</p>
        </div>

        {/* Editor Information: Profession, Name, Email, Telephone */}
        <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-700/60 space-y-3">
            <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                    {t.printSettings.editorProfession || "The Profession of Editor"}
                </label>
                <input
                    ref={el => { inputRefs.current['editorProfession'] = el; }}
                    type="text"
                    name="editorProfession"
                    value={formData.editorProfession || ''}
                    onChange={handleChange}
                    placeholder={t.printSettings.editorProfessionPlaceholder || "e.g. Electrical Engineer / Practical Electrical Engineer / Certified Electrician"}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                    {(
                        t.printSettings?.title?.includes('הגדרות')
                            ? ['מהנדס חשמל', 'הנדסאי חשמל', 'חשמלאי מוסמך']
                            : t.printSettings?.title?.includes('إعدادات')
                            ? ['مهندس كهرباء', 'مهندس تطبيقي', 'كهربائي معتمد']
                            : ['Electrical Engineer', 'Practical Electrical Engineer', 'Certified Electrician']
                    ).map((preset) => (
                        <button
                            key={preset}
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, editorProfession: preset }))}
                            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                                formData.editorProfession === preset
                                    ? 'bg-blue-600/30 border-blue-500 text-blue-300 font-medium'
                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                            }`}
                        >
                            {preset}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                    {t.printSettings.engineer || "Editor Name"}
                </label>
                <input
                    ref={el => { inputRefs.current['engineer'] = el; }}
                    type="text"
                    name="engineer"
                    value={formData.engineer}
                    onChange={handleChange}
                    placeholder={t.printSettings.engineerPlaceholder || "Full name"}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                />
            </div>

            {/* Engineer / electrician Contact Info: Mail and Telephone */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                        <span className="material-icons-round text-xs text-slate-400">email</span>
                        {t.printSettings.email || "Engineer / Electrician Email"}
                    </label>
                    <input
                        ref={el => { inputRefs.current['email'] = el; }}
                        type="email"
                        name="email"
                        value={formData.email || ''}
                        onChange={handleChange}
                        placeholder="engineer@example.com"
                        className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-xs"
                    />
                </div>
                <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                        <span className="material-icons-round text-xs text-slate-400">call</span>
                        {t.printSettings.phone || "Engineer / Electrician Phone"}
                    </label>
                    <input
                        ref={el => { inputRefs.current['phone'] = el; }}
                        type="tel"
                        name="phone"
                        value={formData.phone || ''}
                        onChange={handleChange}
                        placeholder="+1 234 567 890"
                        className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-xs"
                    />
                </div>
            </div>
        </div>

        {/* Approved By */}
        <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">{t.printSettings.approvedBy}</label>
            <input
                ref={el => { inputRefs.current['approvedBy'] = el; }}
                type="text"
                name="approvedBy"
                value={formData.approvedBy}
                onChange={handleChange}
                placeholder="Approver Name"
                className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
            />
        </div>

        {/* Date and Primary Revision */}
        <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">{t.printSettings.date}</label>
                <input
                    ref={el => { inputRefs.current['date'] = el; }}
                    type="text"
                    name="date"
                    value={formData.date}
                    onChange={handleChange}
                    placeholder="YYYY-MM-DD"
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                />
            </div>
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">{t.printSettings.revision}</label>
                <input
                    ref={el => { inputRefs.current['revision'] = el; }}
                    type="text"
                    name="revision"
                    value={formData.revision}
                    onChange={handleChange}
                    placeholder="Rev A"
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                />
            </div>
        </div>

        {/* Revisions with Date (Multiple revisions table) */}
        <div className="p-3 bg-slate-900/70 rounded-lg border border-slate-700/70 space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <span className="material-icons-round text-sm text-blue-400">history_edu</span>
                    {t.printSettings.revisions || "Revisions with Date"}
                </label>
                <button
                    type="button"
                    onClick={handleAddRevision}
                    className="px-2 py-1 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/40 rounded text-[11px] font-medium flex items-center gap-1 transition-colors"
                >
                    <span className="material-icons-round text-xs">add</span>
                    {t.printSettings.addRevision || "Add Revision"}
                </button>
            </div>

            {formData.revisions && formData.revisions.length > 0 ? (
                <div className="space-y-2">
                    {formData.revisions.map((rev, index) => (
                        <div key={rev.id} className="p-2.5 bg-slate-800 rounded border border-slate-700/80 space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="w-24">
                                    <input
                                        id={`rev-input-${index}`}
                                        type="text"
                                        value={rev.revision}
                                        onChange={(e) => handleUpdateRevision(rev.id, 'revision', e.target.value)}
                                        placeholder={t.printSettings.revCode || "Rev A"}
                                        className="w-full bg-slate-900 border border-slate-700 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500 font-bold"
                                    />
                                </div>
                                <div className="flex-1">
                                    <input
                                        type="text"
                                        value={rev.date}
                                        onChange={(e) => handleUpdateRevision(rev.id, 'date', e.target.value)}
                                        placeholder={t.printSettings.revDate || "YYYY-MM-DD"}
                                        className="w-full bg-slate-900 border border-slate-700 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveRevision(rev.id)}
                                    className="text-slate-400 hover:text-rose-400 p-1 transition-colors"
                                    title={t.printSettings.deleteRev || "Delete"}
                                >
                                    <span className="material-icons-round text-xs">delete_outline</span>
                                </button>
                            </div>
                            <div>
                                <input
                                    type="text"
                                    value={rev.description || ''}
                                    onChange={(e) => handleUpdateRevision(rev.id, 'description', e.target.value)}
                                    placeholder={t.printSettings.revDesc || "Description / Changes (optional)"}
                                    className="w-full bg-slate-900/80 border border-slate-700 text-slate-300 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-[11px] text-slate-500 italic text-center py-1">
                    Click "Add Revision" to create a revision history table with dates.
                </p>
            )}
        </div>
        
        <div className="pt-2">
             <p className="text-[10px] text-slate-500 italic text-center">
                Changes are saved automatically.
             </p>
        </div>
      </div>
    </div>
  );
};