
import React, { useState, useEffect, useRef } from 'react';
import { ComponentType, NewNodeData, ElectricalNode, ConnectionStyle, NodeShape } from '../types';
import { COMMON_MODELS, COMPONENT_CONFIG, DEFAULT_CONNECTION_STYLE } from '../constants';
import { LegendIcon } from './LegendIcon';

interface InputPanelProps {
  selectedNode: ElectricalNode | null;
  selectionMode: 'node' | 'link';
  multiSelectionCount?: number;
  availableParents?: ElectricalNode[];
  currentParentId?: string | null;
  onAdd: (data: NewNodeData) => void;
  onAddIndependent: (type: ComponentType) => void;
  onEdit: (data: NewNodeData, newParentId?: string | null) => void;
  onChangeParent?: (nodeId: string, newParentId: string | null) => void;
  onBulkEdit?: (updates: Partial<NewNodeData>) => void;
  onEditConnection: (style: ConnectionStyle) => void;
  onDelete: () => void;
  onCancel: () => void;
  onDetach?: (nodeId: string) => void;
  onStartConnection?: (nodeId: string) => void;
  onNavigate?: (nodeId: string) => void;
  onDisconnectLink?: () => void; 
  t: any;
}

export const InputPanel: React.FC<InputPanelProps> = ({ 
    selectedNode, 
    selectionMode,
    multiSelectionCount = 0,
    availableParents = [],
    currentParentId = '__root__',
    onAdd, 
    onAddIndependent,
    onEdit, 
    onChangeParent,
    onBulkEdit,
    onEditConnection,
    onDelete, 
    onCancel,
    onDetach,
    onStartConnection,
    onNavigate,
    onDisconnectLink,
    t
}) => {
  const [activeTab, setActiveTab] = useState<'add' | 'edit'>('add');
  const [selectedParentId, setSelectedParentId] = useState<string>(currentParentId || '__root__');
  
  const [formData, setFormData] = useState<NewNodeData>({
    name: '',
    componentNumber: '',
    type: ComponentType.BREAKER,
    model: '',
    amps: undefined,
    voltage: undefined,
    kva: undefined,
    description: '',
    place: '',
    building: '',
    floor: '',
    office: '',
    customColor: undefined,
    customBgColor: undefined,
    shape: 'rectangle',
    customImage: undefined,
    hasMeter: false,
    meterNumber: '',
    meterModel: '',
    meterSerial: '',
    isExcludedFromMeter: false,
    hasGeneratorConnection: false,
    generatorName: '',
    isAirConditioning: false,
    isAirBreaker: false,
    isReserved: false,
    isEssential: false,
    hasMultimeter: false,
    multimeterModel: '',
    multimeterSerial: '',
    isPublicBoard: false,
    hasTransferSwitch: false,
    secondBreakerName: '',
    secondBreakerNumber: '',
    secondBreakerAmps: undefined
  });

  const [connectionData, setConnectionData] = useState<ConnectionStyle>(DEFAULT_CONNECTION_STYLE);
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isParentDropdownOpen, setIsParentDropdownOpen] = useState(false);
  const [parentSearchQuery, setParentSearchQuery] = useState('');
  const [parentTypeFilter, setParentTypeFilter] = useState<string>('ALL');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const parentDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) {
        setIsTypeDropdownOpen(false);
      }
      if (parentDropdownRef.current && !parentDropdownRef.current.contains(event.target as Node)) {
        setIsParentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (selectedNode) {
        setSelectedParentId(currentParentId || '__root__');
    }
  }, [selectedNode?.id, currentParentId]);

  useEffect(() => {
    if (activeTab === 'edit' && selectedNode) {
        setFormData({
            name: selectedNode.name,
            componentNumber: selectedNode.componentNumber || '',
            type: selectedNode.type,
            model: selectedNode.model || '',
            amps: selectedNode.amps,
            voltage: selectedNode.voltage,
            kva: selectedNode.kva,
            description: selectedNode.description || '',
            place: selectedNode.place || '',
            building: selectedNode.building || '',
            floor: selectedNode.floor || '',
            office: selectedNode.office || '',
            customColor: selectedNode.customColor,
            customBgColor: selectedNode.customBgColor,
            shape: selectedNode.shape || 'rectangle',
            customImage: selectedNode.customImage,
            hasMeter: selectedNode.hasMeter || false,
            meterNumber: selectedNode.meterNumber || selectedNode.meterSerial || '',
            meterModel: selectedNode.meterModel || '',
            meterSerial: selectedNode.meterSerial || selectedNode.meterNumber || '',
            isExcludedFromMeter: selectedNode.isExcludedFromMeter || false,
            hasGeneratorConnection: selectedNode.hasGeneratorConnection || false,
            generatorName: selectedNode.generatorName || '',
            isAirConditioning: selectedNode.isAirConditioning || false,
            isAirBreaker: selectedNode.isAirBreaker || false,
            isReserved: selectedNode.isReserved || false,
            isEssential: selectedNode.isEssential || false,
            hasMultimeter: selectedNode.hasMultimeter || false,
            multimeterModel: selectedNode.multimeterModel || '',
            multimeterSerial: selectedNode.multimeterSerial || '',
            isPublicBoard: selectedNode.isPublicBoard || false,
            hasTransferSwitch: selectedNode.hasTransferSwitch || false,
            secondBreakerName: selectedNode.secondBreakerName || '',
            secondBreakerNumber: selectedNode.secondBreakerNumber || '',
            secondBreakerAmps: selectedNode.secondBreakerAmps
        });
    } else if (activeTab === 'add') {
        setFormData({
            name: '',
            componentNumber: '',
            type: ComponentType.BREAKER,
            model: '',
            amps: undefined,
            voltage: undefined,
            kva: undefined,
            description: '',
            place: '',
            building: '',
            floor: '',
            office: '',
            customColor: undefined,
            customBgColor: undefined,
            shape: 'rectangle',
            customImage: undefined,
            hasMeter: false,
            meterNumber: '',
            meterModel: '',
            meterSerial: '',
            isExcludedFromMeter: false,
            hasGeneratorConnection: false,
            generatorName: '',
            isAirConditioning: false,
            isAirBreaker: false,
            isReserved: false,
            isEssential: false,
            hasMultimeter: false,
            multimeterModel: '',
            multimeterSerial: '',
            isPublicBoard: false,
            hasTransferSwitch: false,
            secondBreakerName: '',
            secondBreakerNumber: '',
            secondBreakerAmps: undefined
        });
    }
  }, [activeTab, selectedNode]);

  useEffect(() => {
      if (!selectedNode && multiSelectionCount <= 1) {
          setActiveTab('add');
      }
  }, [selectedNode, multiSelectionCount]);

  useEffect(() => {
      if (selectedNode && selectionMode === 'link') {
          setConnectionData({
              strokeColor: selectedNode.connectionStyle?.strokeColor || COMPONENT_CONFIG[selectedNode.type]?.color || '#475569',
              lineStyle: selectedNode.connectionStyle?.lineStyle || 'solid',
              lineType: selectedNode.connectionStyle?.lineType || 'orthogonal',
              startMarker: selectedNode.connectionStyle?.startMarker || 'none',
              endMarker: selectedNode.connectionStyle?.endMarker || 'none',
              cableSize: selectedNode.connectionStyle?.cableSize || ''
          });
      }
  }, [selectedNode, selectionMode]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' 
        ? (e.target as HTMLInputElement).checked 
        : (name === 'amps' || name === 'voltage' || name === 'kva' || name === 'secondBreakerAmps') 
            ? (value === '' ? undefined : Number(value)) 
            : value
    }));
  };

  const handleConnectionChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      const newStyle = { ...connectionData, [name]: value };
      setConnectionData(newStyle);
      onEditConnection(newStyle);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
              const base64 = ev.target?.result as string;
              setFormData(prev => ({ ...prev, customImage: base64 }));
          };
          reader.readAsDataURL(file);
      }
  };

  const handleRemoveImage = () => {
      setFormData(prev => ({ ...prev, customImage: undefined }));
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (multiSelectionCount > 1 && onBulkEdit) {
        onBulkEdit(formData);
    } else if (activeTab === 'add') {
        onAdd(formData);
        setFormData(prev => ({ 
            ...prev, 
            name: '', 
            componentNumber: '',
            model: '',
            amps: undefined, 
            voltage: undefined,
            kva: undefined,
            description: '',
            place: '',
            building: '',
            floor: '',
            office: '',
            customColor: undefined,
            customBgColor: undefined,
            shape: 'rectangle',
            customImage: undefined,
            hasMeter: false,
            meterNumber: '',
            meterModel: '',
            meterSerial: '',
            isExcludedFromMeter: false,
            hasGeneratorConnection: false,
            generatorName: '',
            isAirConditioning: false,
            isAirBreaker: false,
            isReserved: false,
            isEssential: false,
            hasMultimeter: false,
            multimeterModel: '',
            multimeterSerial: '',
            isPublicBoard: false,
            hasTransferSwitch: false,
            secondBreakerName: '',
            secondBreakerNumber: '',
            secondBreakerAmps: undefined
        }));
    } else {
        onEdit(formData, selectedParentId === '__root__' ? null : selectedParentId);
    }
  };

  if (multiSelectionCount > 1) {
      return (
        <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg overflow-hidden sticky top-4">
            <div className="p-4 border-b border-slate-700 bg-slate-900 flex items-center justify-between">
                 <h3 className="font-bold text-white text-sm flex items-center gap-2">
                     <span className="material-icons-round text-blue-400">layers</span>
                     {t.inputPanel.bulkEdit}
                 </h3>
                 <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">
                     {multiSelectionCount} {t.inputPanel.itemsSelected}
                 </span>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.customColor}</label>
                        <div className="flex items-center gap-2">
                            <input 
                                type="color" 
                                name="customColor"
                                value={formData.customColor || '#475569'}
                                onChange={handleChange}
                                className="h-8 w-12 bg-transparent border border-slate-700 rounded cursor-pointer"
                            />
                            <span className="text-xs text-slate-500">All Nodes</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.customBgColor}</label>
                        <div className="flex items-center gap-2">
                            <input 
                                type="color" 
                                name="customBgColor"
                                value={formData.customBgColor || '#ffffff'}
                                onChange={handleChange}
                                className="h-8 w-12 bg-transparent border border-slate-700 rounded cursor-pointer"
                            />
                            <span className="text-xs text-slate-500">Background</span>
                        </div>
                    </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.model}</label>
                  <input
                    list="models"
                    name="model"
                    value={formData.model}
                    onChange={handleChange}
                    placeholder="Update Model for all"
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                  />
                  <datalist id="models">
                    {COMMON_MODELS.map(model => (
                        <option key={model} value={model} />
                    ))}
                  </datalist>
                </div>

                <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.shape}</label>
                    <select
                        name="shape"
                        value={formData.shape || 'rectangle'}
                        onChange={handleChange}
                        className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                    >
                        <option value="rectangle">{t.inputPanel.shapes.rectangle}</option>
                        <option value="circle">{t.inputPanel.shapes.circle}</option>
                        <option value="square">{t.inputPanel.shapes.square}</option>
                    </select>
                </div>

                <div className="bg-slate-900/50 p-3 rounded border border-slate-700/50 space-y-3 mt-4">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.inputPanel.location}</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.building}</label>
                            <input
                                type="text"
                                name="building"
                                value={formData.building}
                                onChange={handleChange}
                                className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.floor}</label>
                            <input
                                type="text"
                                name="floor"
                                value={formData.floor}
                                onChange={handleChange}
                                className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.place}</label>
                        <input
                            type="text"
                            name="place"
                            value={formData.place}
                            onChange={handleChange}
                            className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                        />
                    </div>
                </div>
                
                <div className="pt-2">
                    <button type="submit" className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium text-sm">
                        {t.inputPanel.applyBulk}
                    </button>
                    <button type="button" onClick={onCancel} className="w-full py-2 mt-2 text-slate-400 hover:text-white text-sm">
                        {t.inputPanel.close}
                    </button>
                </div>
            </form>
        </div>
      );
  }

  if (!selectedNode) {
    return (
      <div className="flex flex-col gap-4">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="material-icons-round text-sm">add_circle_outline</span>
                  {t.addIndependent}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => onAddIndependent(ComponentType.SYSTEM_ROOT)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded text-left flex items-center gap-2 transition-colors">
                      <LegendIcon icon={COMPONENT_CONFIG[ComponentType.SYSTEM_ROOT].icon} color={COMPONENT_CONFIG[ComponentType.SYSTEM_ROOT].color} size={16} />
                      <span className="text-xs text-slate-200">{t.componentTypes[ComponentType.SYSTEM_ROOT]}</span>
                  </button>
                  <button onClick={() => onAddIndependent(ComponentType.GENERATOR)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded text-left flex items-center gap-2 transition-colors">
                      <LegendIcon icon={COMPONENT_CONFIG[ComponentType.GENERATOR].icon} color={COMPONENT_CONFIG[ComponentType.GENERATOR].color} size={16} />
                      <span className="text-xs text-slate-200">{t.componentTypes[ComponentType.GENERATOR]}</span>
                  </button>
                  <button onClick={() => onAddIndependent(ComponentType.TRANSFORMER)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded text-left flex items-center gap-2 transition-colors">
                      <LegendIcon icon={COMPONENT_CONFIG[ComponentType.TRANSFORMER].icon} color={COMPONENT_CONFIG[ComponentType.TRANSFORMER].color} size={16} />
                      <span className="text-xs text-slate-200">{t.componentTypes[ComponentType.TRANSFORMER]}</span>
                  </button>
                  <button onClick={() => onAddIndependent(ComponentType.BUSBAR)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded text-left flex items-center gap-2 transition-colors">
                      <LegendIcon icon={COMPONENT_CONFIG[ComponentType.BUSBAR].icon} color={COMPONENT_CONFIG[ComponentType.BUSBAR].color} size={16} />
                      <span className="text-xs text-slate-200">{t.componentTypes[ComponentType.BUSBAR]}</span>
                  </button>
                  <button onClick={() => onAddIndependent(ComponentType.LOAD)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded text-left flex items-center gap-2 transition-colors">
                      <LegendIcon icon={COMPONENT_CONFIG[ComponentType.LOAD].icon} color={COMPONENT_CONFIG[ComponentType.LOAD].color} size={16} />
                      <span className="text-xs text-slate-200">{t.componentTypes[ComponentType.LOAD]}</span>
                  </button>
                  <button onClick={() => onAddIndependent(ComponentType.UPS)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded text-left flex items-center gap-2 transition-colors">
                      <LegendIcon icon={COMPONENT_CONFIG[ComponentType.UPS].icon} color={COMPONENT_CONFIG[ComponentType.UPS].color} size={16} />
                      <span className="text-xs text-slate-200">{t.componentTypes[ComponentType.UPS]}</span>
                  </button>
              </div>
          </div>

          <div className="p-6 text-center text-slate-500 bg-slate-900/30 rounded-lg border border-dashed border-slate-800 h-32 flex flex-col items-center justify-center">
            <span className="material-icons-round text-4xl mb-3 opacity-50">touch_app</span>
            <p className="text-xs">Select a component in the diagram to view properties.</p>
          </div>

           <div className="mt-2 p-4 rounded-lg bg-slate-800/30 border border-slate-700/30">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">{t.quickTips}</h4>
                <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                    <li>{t.tip1}</li>
                    <li>{t.tip2}</li>
                    <li>{t.tip3}</li>
                    <li>{t.tip4}</li>
                </ul>
            </div>
      </div>
    );
  }

  if (selectionMode === 'link') {
      return (
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg overflow-hidden sticky top-4">
              <div className="p-4 border-b border-slate-700 bg-slate-900 flex items-center justify-between">
                 <h3 className="font-bold text-white text-sm flex items-center gap-2">
                     <span className="material-icons-round text-amber-400">timeline</span>
                     {t.inputPanel.linkStyle}
                 </h3>
                 <button onClick={onCancel} className="text-slate-400 hover:text-white">
                     <span className="material-icons-round">close</span>
                 </button>
              </div>
              <div className="p-5 space-y-4">
                  <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.strokeColor}</label>
                      <div className="flex items-center gap-2">
                        <input 
                            type="color" 
                            name="strokeColor"
                            value={connectionData.strokeColor}
                            onChange={handleConnectionChange}
                            className="h-8 w-12 bg-transparent border border-slate-700 rounded cursor-pointer"
                        />
                        <input 
                            type="text" 
                            name="strokeColor"
                            value={connectionData.strokeColor}
                            onChange={handleConnectionChange}
                            className="flex-1 bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 text-sm uppercase"
                        />
                      </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.cableSize}</label>
                    <input
                        type="text"
                        name="cableSize"
                        value={connectionData.cableSize || ''}
                        onChange={handleConnectionChange}
                        placeholder="e.g. 4x25mm²"
                        className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                    />
                  </div>

                  <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.lineType}</label>
                      <select 
                        name="lineType"
                        value={connectionData.lineType || 'orthogonal'}
                        onChange={handleConnectionChange}
                        className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 text-sm"
                      >
                          <option value="orthogonal">{t.inputPanel.routeTypes.orthogonal}</option>
                          <option value="straight">{t.inputPanel.routeTypes.straight}</option>
                      </select>
                  </div>
                  
                  <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.lineStyle}</label>
                      <select 
                        name="lineStyle"
                        value={connectionData.lineStyle}
                        onChange={handleConnectionChange}
                        className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 text-sm"
                      >
                          <option value="solid">{t.inputPanel.patterns.solid}</option>
                          <option value="dashed">{t.inputPanel.patterns.dashed}</option>
                          <option value="dotted">{t.inputPanel.patterns.dotted}</option>
                          <option value="dash-dot">{t.inputPanel.patterns.dashDot}</option>
                          <option value="long-dash">{t.inputPanel.patterns.longDash}</option>
                      </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.startMarker}</label>
                          <select 
                            name="startMarker"
                            value={connectionData.startMarker}
                            onChange={handleConnectionChange}
                            className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 text-sm"
                          >
                              <option value="none">{t.inputPanel.markers.none}</option>
                              <option value="arrow">{t.inputPanel.markers.arrow}</option>
                              <option value="circle">{t.inputPanel.markers.circle}</option>
                              <option value="diamond">{t.inputPanel.markers.diamond}</option>
                          </select>
                      </div>
                      <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.endMarker}</label>
                          <select 
                            name="endMarker"
                            value={connectionData.endMarker}
                            onChange={handleConnectionChange}
                            className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 text-sm"
                          >
                              <option value="none">{t.inputPanel.markers.none}</option>
                              <option value="arrow">{t.inputPanel.markers.arrow}</option>
                              <option value="circle">{t.inputPanel.markers.circle}</option>
                              <option value="diamond">{t.inputPanel.markers.diamond}</option>
                          </select>
                      </div>
                  </div>
                  
                  <div className="pt-2 text-xs text-slate-500 italic border-t border-slate-700 mt-2">
                      Styling the connection to: <strong>{selectedNode.name}</strong>
                  </div>

                  <button 
                    type="button"
                    onClick={onDisconnectLink}
                    className="w-full py-2 mt-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 rounded transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <span className="material-icons-round text-sm">link_off</span>
                    {t.inputPanel.disconnect || "Disconnect Link"}
                  </button>
              </div>
          </div>
      );
  }

  const showMeterOptions = formData.type === ComponentType.BREAKER || formData.type === ComponentType.SWITCH || formData.type === ComponentType.DISTRIBUTION_BOARD;
  const showKvaOption = formData.type === ComponentType.TRANSFORMER || formData.type === ComponentType.GENERATOR || formData.type === ComponentType.UPS;
  const isSystemRoot = selectedNode.type === ComponentType.SYSTEM_ROOT;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg overflow-hidden sticky top-4">
      
      <div className="flex border-b border-slate-700">
          <button 
            onClick={() => setActiveTab('add')}
            className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'add' 
                ? 'bg-slate-800 text-blue-400 border-b-2 border-blue-500' 
                : 'bg-slate-900 text-slate-500 hover:text-slate-300'
            }`}
          >
             <span className="material-icons-round text-base">add_circle</span>
             {t.inputPanel.addConnection}
          </button>
          <button 
            onClick={() => setActiveTab('edit')}
            className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'edit' 
                ? 'bg-slate-800 text-yellow-400 border-b-2 border-yellow-500' 
                : 'bg-slate-900 text-slate-500 hover:text-slate-300'
            }`}
          >
             <span className="material-icons-round text-base">edit</span>
             {t.inputPanel.editComponent}
          </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-white">
                {activeTab === 'add' ? t.inputPanel.newDownstream : t.inputPanel.editSelected}
            </h3>
            {activeTab === 'add' && (
                 <span className="text-xs text-slate-400">{t.inputPanel.parent}: {selectedNode.name}</span>
            )}
        </div>

        <div className="relative" ref={typeDropdownRef}>
          <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.componentType}</label>
          <button
            type="button"
            disabled={activeTab === 'edit' && isSystemRoot}
            onClick={() => setIsTypeDropdownOpen(prev => !prev)}
            className="w-full bg-slate-900 border border-slate-700 hover:border-slate-600 text-white rounded px-3 py-2 text-sm flex items-center justify-between transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:border-blue-500"
          >
            <div className="flex items-center gap-2.5">
              <LegendIcon 
                icon={COMPONENT_CONFIG[formData.type]?.icon || 'help'} 
                color={COMPONENT_CONFIG[formData.type]?.color || '#94a3b8'} 
                size={18}
              />
              <span className="font-medium text-slate-200">{t.componentTypes[formData.type]}</span>
            </div>
            <span className={`material-icons-round text-slate-400 text-sm transition-transform duration-200 ${isTypeDropdownOpen ? 'rotate-180' : ''}`}>
              expand_more
            </span>
          </button>

          {isTypeDropdownOpen && !(activeTab === 'edit' && isSystemRoot) && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50 max-h-60 overflow-y-auto py-1 custom-scrollbar">
              {Object.values(ComponentType).map(type => {
                const isSelected = formData.type === type;
                const config = COMPONENT_CONFIG[type];
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, type }));
                      setIsTypeDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between text-xs transition-colors ${
                      isSelected 
                        ? 'bg-blue-600/20 text-blue-300 font-semibold' 
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <LegendIcon 
                        icon={config?.icon || 'help'} 
                        color={config?.color || '#94a3b8'} 
                        size={18}
                      />
                      <span>{t.componentTypes[type]}</span>
                    </div>
                    {isSelected && (
                      <span className="material-icons-round text-blue-400 text-sm">check</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {activeTab === 'edit' && (() => {
            const currentSelectedParent = availableParents.find(p => p.id === selectedParentId);

            // Filter available parents based on search query and type filter
            const filteredParents = availableParents.filter(parent => {
                const matchesType = parentTypeFilter === 'ALL' || parent.type === parentTypeFilter;
                if (!matchesType) return false;
                if (!parentSearchQuery.trim()) return true;
                const query = parentSearchQuery.toLowerCase();
                const name = (parent.name || '').toLowerCase();
                const compNum = (parent.componentNumber || '').toLowerCase();
                const typeName = (t.componentTypes[parent.type] || parent.type || '').toLowerCase();
                return name.includes(query) || compNum.includes(query) || typeName.includes(query);
            });

            // Group filtered parents by ComponentType in a logical order
            const typeOrder = [
                ComponentType.SYSTEM_ROOT,
                ComponentType.TRANSFORMER,
                ComponentType.GENERATOR,
                ComponentType.UPS,
                ComponentType.DISTRIBUTION_BOARD,
                ComponentType.BUSBAR,
                ComponentType.BREAKER,
                ComponentType.SWITCH,
                ComponentType.METER,
                ComponentType.LOAD
            ];

            // Sorted list by type, then by name / componentNumber
            const sortedParents = [...filteredParents].sort((a, b) => {
                const orderA = typeOrder.indexOf(a.type);
                const orderB = typeOrder.indexOf(b.type);
                const weightA = orderA === -1 ? 999 : orderA;
                const weightB = orderB === -1 ? 999 : orderB;
                if (weightA !== weightB) return weightA - weightB;
                return (a.name || '').localeCompare(b.name || '');
            });

            // Distinct types available for quick filter chips
            const availableTypesInList = Array.from(new Set(availableParents.map(p => p.type)));

            return (
            <div className="bg-slate-900/70 p-3.5 rounded-lg border border-slate-700/80 space-y-2.5 shadow-inner" ref={parentDropdownRef}>
                <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="material-icons-round text-base text-blue-400">account_tree</span>
                        {t.inputPanel.parentNode || "Parent Component (Father)"}
                    </label>
                    {selectedParentId && selectedParentId !== '__root__' ? (
                        <span className="text-[11px] text-emerald-400 bg-emerald-950/80 border border-emerald-700/50 px-2 py-0.5 rounded font-medium flex items-center gap-1 truncate max-w-[140px]" title={currentSelectedParent?.name || 'Connected'}>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                            <span className="truncate">{currentSelectedParent?.name || 'Connected'}</span>
                        </span>
                    ) : (
                        <span className="text-[11px] text-amber-400 bg-amber-950/80 border border-amber-700/50 px-2 py-0.5 rounded font-medium flex items-center gap-1 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                            {t.inputPanel.rootNodeNoParent || "Independent Root"}
                        </span>
                    )}
                </div>

                {/* Custom searchable & grouped parent selector */}
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setIsParentDropdownOpen(prev => !prev)}
                        className="w-full bg-slate-950 border border-slate-700 hover:border-slate-600 text-white rounded-lg px-3 py-2.5 text-sm flex items-center justify-between transition-colors focus:outline-none focus:border-blue-500"
                    >
                        <div className="flex items-center gap-2.5 min-w-0">
                            {selectedParentId === '__root__' || !currentSelectedParent ? (
                                <>
                                    <span className="text-amber-400 text-base">⚡</span>
                                    <span className="font-semibold text-amber-300 truncate">
                                        {t.inputPanel.rootNodeNoParent || "Independent Root (No Parent)"}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <LegendIcon 
                                        icon={COMPONENT_CONFIG[currentSelectedParent.type]?.icon || 'help'} 
                                        color={COMPONENT_CONFIG[currentSelectedParent.type]?.color || '#94a3b8'} 
                                        size={18}
                                    />
                                    <div className="flex items-center gap-1.5 truncate">
                                        <span className="font-bold text-slate-100 truncate">{currentSelectedParent.name}</span>
                                        {currentSelectedParent.componentNumber && (
                                            <span className="text-xs text-slate-400 shrink-0">({currentSelectedParent.componentNumber})</span>
                                        )}
                                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-blue-300 font-medium shrink-0">
                                            {t.componentTypes[currentSelectedParent.type] || currentSelectedParent.type}
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>
                        <span className={`material-icons-round text-slate-400 text-sm transition-transform duration-200 shrink-0 ${isParentDropdownOpen ? 'rotate-180' : ''}`}>
                            expand_more
                        </span>
                    </button>

                    {isParentDropdownOpen && (
                        <div className="absolute top-full left-0 right-0 mt-1.5 bg-slate-950 border border-slate-700 rounded-lg shadow-2xl z-50 overflow-hidden flex flex-col max-h-80">
                            {/* Search bar inside parent dropdown */}
                            <div className="p-2 border-b border-slate-800 bg-slate-900/90 space-y-2">
                                <div className="relative">
                                    <span className="material-icons-round absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-base">
                                        search
                                    </span>
                                    <input
                                        type="text"
                                        value={parentSearchQuery}
                                        onChange={(e) => setParentSearchQuery(e.target.value)}
                                        placeholder={t.inputPanel.searchParent || "Search parent by name, # or type..."}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-md pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                                        autoFocus
                                    />
                                    {parentSearchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setParentSearchQuery('')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                        >
                                            <span className="material-icons-round text-xs">close</span>
                                        </button>
                                    )}
                                </div>

                                {/* Type filter chips */}
                                {availableTypesInList.length > 1 && (
                                    <div className="flex items-center gap-1 overflow-x-auto pb-0.5 custom-scrollbar text-[11px]">
                                        <button
                                            type="button"
                                            onClick={() => setParentTypeFilter('ALL')}
                                            className={`px-2 py-0.5 rounded-full font-medium transition-colors shrink-0 ${
                                                parentTypeFilter === 'ALL'
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                                            }`}
                                        >
                                            {t.inputPanel.filterByType || "All"} ({availableParents.length})
                                        </button>
                                        {availableTypesInList.map(type => {
                                            const count = availableParents.filter(p => p.type === type).length;
                                            const isSelected = parentTypeFilter === type;
                                            return (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    onClick={() => setParentTypeFilter(type)}
                                                    className={`px-2 py-0.5 rounded-full font-medium transition-colors shrink-0 flex items-center gap-1 ${
                                                        isSelected
                                                            ? 'bg-blue-600 text-white'
                                                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                                                    }`}
                                                >
                                                    <span 
                                                        className="w-1.5 h-1.5 rounded-full" 
                                                        style={{ backgroundColor: COMPONENT_CONFIG[type]?.color || '#94a3b8' }}
                                                    />
                                                    <span>{t.componentTypes[type] || type}</span>
                                                    <span className="opacity-60">({count})</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Dropdown list */}
                            <div className="overflow-y-auto flex-1 p-1 space-y-1 custom-scrollbar">
                                {/* Independent root option */}
                                {(!parentSearchQuery || (t.inputPanel.rootNodeNoParent || 'root').toLowerCase().includes(parentSearchQuery.toLowerCase())) && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedParentId('__root__');
                                            setIsParentDropdownOpen(false);
                                        }}
                                        className={`w-full px-3 py-2 text-left rounded flex items-center justify-between text-xs transition-colors ${
                                            selectedParentId === '__root__'
                                                ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40'
                                                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-amber-400 text-base">⚡</span>
                                            <div>
                                                <div className="font-semibold">{t.inputPanel.rootNodeNoParent || "Independent Root (No Parent)"}</div>
                                                <div className="text-[10px] text-slate-400">Make component top-level independent</div>
                                            </div>
                                        </div>
                                        {selectedParentId === '__root__' && (
                                            <span className="material-icons-round text-amber-400 text-sm">check</span>
                                        )}
                                    </button>
                                )}

                                {/* Grouped and Sorted Parent List */}
                                {sortedParents.length === 0 ? (
                                    <div className="p-3 text-center text-xs text-slate-500 italic">
                                        No matching parent components found.
                                    </div>
                                ) : (
                                    sortedParents.map((parent, idx) => {
                                        const isSelected = selectedParentId === parent.id;
                                        const prevParent = idx > 0 ? sortedParents[idx - 1] : null;
                                        const showTypeHeader = !prevParent || prevParent.type !== parent.type;
                                        const config = COMPONENT_CONFIG[parent.type];

                                        return (
                                            <div key={parent.id} className="space-y-0.5">
                                                {showTypeHeader && (
                                                    <div className="px-2.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-t border-slate-800/60 mt-1 first:mt-0 first:border-0">
                                                        <span 
                                                            className="w-2 h-2 rounded-full" 
                                                            style={{ backgroundColor: config?.color || '#94a3b8' }}
                                                        />
                                                        <span>{t.componentTypes[parent.type] || parent.type}</span>
                                                    </div>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedParentId(parent.id);
                                                        setIsParentDropdownOpen(false);
                                                    }}
                                                    className={`w-full px-2.5 py-1.5 text-left rounded flex items-center justify-between text-xs transition-colors ${
                                                        isSelected
                                                            ? 'bg-blue-600/20 text-blue-300 font-semibold border border-blue-500/40'
                                                            : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <LegendIcon 
                                                            icon={config?.icon || 'help'} 
                                                            color={config?.color || '#94a3b8'} 
                                                            size={16}
                                                        />
                                                        <div className="truncate">
                                                            <span className="font-medium text-slate-100">{parent.name}</span>
                                                            {parent.componentNumber && (
                                                                <span className="text-slate-400 ml-1.5">({parent.componentNumber})</span>
                                                            )}
                                                            {parent.amps && (
                                                                <span className="text-slate-500 text-[10px] ml-1.5">[{parent.amps}A]</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {isSelected && (
                                                        <span className="material-icons-round text-blue-400 text-sm shrink-0">check</span>
                                                    )}
                                                </button>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-start gap-1.5 pt-0.5 text-[11px] text-slate-400">
                    <span className="material-icons-round text-xs text-blue-400 mt-0.5 shrink-0">info</span>
                    <span>{t.inputPanel.changeParentWarning || "Moving this component will move all its downstream child components with it."}</span>
                </div>
            </div>
            );
        })()}

        {activeTab === 'edit' && (
            <div className="space-y-4 border-b border-slate-700 pb-4 mb-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.customColor}</label>
                        <div className="flex items-center gap-2">
                            <input 
                                type="color" 
                                name="customColor"
                                value={formData.customColor || COMPONENT_CONFIG[formData.type]?.color || '#475569'}
                                onChange={handleChange}
                                className="h-8 w-12 bg-transparent border border-slate-700 rounded cursor-pointer"
                            />
                            <span className="text-xs text-slate-500">Icon</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.customBgColor}</label>
                        <div className="flex items-center gap-2">
                            <input 
                                type="color" 
                                name="customBgColor"
                                value={formData.customBgColor || '#ffffff'}
                                onChange={handleChange}
                                className="h-8 w-12 bg-transparent border border-slate-700 rounded cursor-pointer"
                            />
                            <span className="text-xs text-slate-500">Fill</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.shape}</label>
                        <select
                            name="shape"
                            value={formData.shape || 'rectangle'}
                            onChange={handleChange}
                            className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                        >
                            <option value="rectangle">{t.inputPanel.shapes.rectangle}</option>
                            <option value="circle">{t.inputPanel.shapes.circle}</option>
                            <option value="square">{t.inputPanel.shapes.square}</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.uploadIcon}</label>
                        <input 
                            type="file" 
                            accept="image/*"
                            ref={fileInputRef}
                            onChange={handleImageUpload}
                            className="hidden" 
                        />
                        <button 
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full bg-slate-700 hover:bg-slate-600 text-white rounded px-2 py-2 text-xs flex items-center justify-center gap-2"
                        >
                            <span className="material-icons-round text-sm">upload</span>
                            {formData.customImage ? t.inputPanel.removeIcon : t.inputPanel.uploadIcon}
                        </button>
                        {formData.customImage && (
                             <button type="button" onClick={handleRemoveImage} className="text-[10px] text-red-400 mt-1 hover:underline w-full text-center">
                                 {t.inputPanel.removeIcon}
                             </button>
                        )}
                    </div>
                </div>
            </div>
        )}

        <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.name}</label>
                <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Name"
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                />
            </div>
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.componentNumber}</label>
                <input
                    type="text"
                    name="componentNumber"
                    value={formData.componentNumber}
                    onChange={handleChange}
                    placeholder="e.g. CB-1"
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                />
            </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.model}</label>
          <input
            list="models"
            name="model"
            value={formData.model}
            onChange={handleChange}
            placeholder="Select or type model"
            className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
          />
          <datalist id="models">
            {COMMON_MODELS.map(model => (
                <option key={model} value={model} />
            ))}
          </datalist>
        </div>

        <div className="bg-slate-900/50 p-3 rounded border border-slate-700/50 space-y-3">
            {showMeterOptions && (
                <>
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="hasMeter"
                            name="hasMeter"
                            checked={formData.hasMeter}
                            onChange={handleChange}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 bg-slate-700 border-slate-600 cursor-pointer"
                        />
                        <label htmlFor="hasMeter" className="text-xs font-medium text-slate-300 select-none flex items-center gap-1.5 cursor-pointer">
                            <LegendIcon icon="speed" color="#3b82f6" size={16} />
                            {t.inputPanel.includesMeter}
                        </label>
                    </div>
                    
                    {formData.hasMeter && (
                        <div className="pl-6 space-y-2 border-l-2 border-blue-500/40 my-1 py-1">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.meterModel || "Meter Model"}</label>
                                <input
                                    type="text"
                                    name="meterModel"
                                    value={formData.meterModel || ''}
                                    onChange={handleChange}
                                    placeholder="e.g. ABB B23 / Schneider iEM3150"
                                    className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 focus:outline-none focus:border-blue-500 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.meterSerial || t.inputPanel.meterNumber || "Meter Serial Number"}</label>
                                <input
                                    type="text"
                                    name="meterSerial"
                                    value={formData.meterSerial || formData.meterNumber || ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setFormData(prev => ({
                                            ...prev,
                                            meterSerial: val,
                                            meterNumber: val
                                        }));
                                    }}
                                    placeholder="e.g. SN-551029 / M-001"
                                    className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 focus:outline-none focus:border-blue-500 text-sm"
                                />
                            </div>
                        </div>
                    )}
                </>
            )}

            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="isExcludedFromMeter"
                    name="isExcludedFromMeter"
                    checked={formData.isExcludedFromMeter}
                    onChange={handleChange}
                    className="w-4 h-4 text-gray-500 rounded focus:ring-gray-400 bg-slate-700 border-slate-600 cursor-pointer"
                />
                <label htmlFor="isExcludedFromMeter" className="text-xs font-medium text-slate-300 select-none flex items-center gap-1.5 cursor-pointer">
                    <LegendIcon icon="power_off" color="#64748b" size={16} />
                    {t.inputPanel.excludedFromMeter}
                </label>
            </div>

            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="hasGeneratorConnection"
                    name="hasGeneratorConnection"
                    checked={formData.hasGeneratorConnection}
                    onChange={handleChange}
                    className="w-4 h-4 text-red-600 rounded focus:ring-red-500 bg-slate-700 border-slate-600 cursor-pointer"
                />
                <label htmlFor="hasGeneratorConnection" className="text-xs font-medium text-slate-300 select-none flex items-center gap-1.5 cursor-pointer">
                    <LegendIcon icon="letter_g" color="#ef4444" size={16} />
                    {t.inputPanel.includesGenerator}
                </label>
            </div>
            {formData.hasGeneratorConnection && (
                <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.generatorName}</label>
                    <input
                    type="text"
                    name="generatorName"
                    value={formData.generatorName}
                    onChange={handleChange}
                    placeholder="e.g. Gen-1"
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                    />
                </div>
            )}

            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="isAirConditioning"
                    name="isAirConditioning"
                    checked={formData.isAirConditioning}
                    onChange={handleChange}
                    className="w-4 h-4 text-cyan-500 rounded focus:ring-cyan-400 bg-slate-700 border-slate-600 cursor-pointer"
                />
                <label htmlFor="isAirConditioning" className="text-xs font-medium text-slate-300 select-none flex items-center gap-1.5 cursor-pointer">
                    <LegendIcon icon="ac_unit" color="#06b6d4" size={16} />
                    {t.inputPanel.isAC}
                </label>
            </div>

            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="isAirBreaker"
                    name="isAirBreaker"
                    checked={formData.isAirBreaker || false}
                    onChange={handleChange}
                    className="w-4 h-4 text-sky-500 rounded focus:ring-sky-400 bg-slate-700 border-slate-600 cursor-pointer"
                />
                <label htmlFor="isAirBreaker" className="text-xs font-medium text-slate-300 select-none flex items-center gap-1.5 cursor-pointer">
                    <LegendIcon icon="air_breaker" color="#0284c7" size={16} />
                    {t.inputPanel.isAirBreaker || "Air Breaker (ACB)"}
                </label>
            </div>

            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="isReserved"
                    name="isReserved"
                    checked={formData.isReserved}
                    onChange={handleChange}
                    className="w-4 h-4 text-yellow-500 rounded focus:ring-yellow-400 bg-slate-700 border-slate-600 cursor-pointer"
                />
                <label htmlFor="isReserved" className="text-xs font-medium text-slate-300 select-none flex items-center gap-1.5 cursor-pointer">
                    <LegendIcon icon="lock" color="#eab308" size={16} />
                    {t.inputPanel.isReserved}
                </label>
            </div>

            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="hasMultimeter"
                    name="hasMultimeter"
                    checked={formData.hasMultimeter || false}
                    onChange={handleChange}
                    className="w-4 h-4 text-emerald-500 rounded focus:ring-emerald-400 bg-slate-700 border-slate-600 cursor-pointer"
                />
                <label htmlFor="hasMultimeter" className="text-xs font-medium text-slate-300 select-none flex items-center gap-1.5 cursor-pointer">
                    <LegendIcon icon="multimeter" color="#10b981" size={16} />
                    {t.inputPanel.hasMultimeter || "Has Multimeter"}
                </label>
            </div>
            {formData.hasMultimeter && (
                <div className="pl-6 space-y-2 border-l-2 border-emerald-500/40 my-1 py-1">
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.multimeterModel || "Multimeter Model"}</label>
                        <input
                            type="text"
                            name="multimeterModel"
                            value={formData.multimeterModel || ''}
                            onChange={handleChange}
                            placeholder="e.g. SATEC PM130 / Schneider PM5000"
                            className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 focus:outline-none focus:border-emerald-500 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.multimeterSerial || "Multimeter Serial Number"}</label>
                        <input
                            type="text"
                            name="multimeterSerial"
                            value={formData.multimeterSerial || ''}
                            onChange={handleChange}
                            placeholder="e.g. SN-883492"
                            className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 focus:outline-none focus:border-emerald-500 text-sm"
                        />
                    </div>
                </div>
            )}

            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="isPublicBoard"
                    name="isPublicBoard"
                    checked={formData.isPublicBoard || false}
                    onChange={handleChange}
                    className="w-4 h-4 text-teal-500 rounded focus:ring-teal-400 bg-slate-700 border-slate-600 cursor-pointer"
                />
                <label htmlFor="isPublicBoard" className="text-xs font-medium text-slate-300 select-none flex items-center gap-1.5 cursor-pointer">
                    <LegendIcon icon="public_board" color="#14b8a6" size={16} />
                    {t.inputPanel.isPublicBoard || "Public Board"}
                </label>
            </div>

            {/* Power Source Switching Controller (Dual Power Source / ATS) */}
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="hasTransferSwitch"
                    name="hasTransferSwitch"
                    checked={formData.hasTransferSwitch || false}
                    onChange={handleChange}
                    className="w-4 h-4 text-purple-500 rounded focus:ring-purple-400 bg-slate-700 border-slate-600 cursor-pointer"
                />
                <label htmlFor="hasTransferSwitch" className="text-xs font-medium text-slate-300 select-none flex items-center gap-1.5 cursor-pointer">
                    <LegendIcon icon="transfer_switch" color="#c084fc" size={16} />
                    {t.inputPanel.hasTransferSwitch || "Power Source Switching Controller (Dual Feed / ATS)"}
                </label>
            </div>
            {formData.hasTransferSwitch && (
                <div className="pl-5 space-y-2.5 border-l-2 border-purple-500/60 my-1 py-2 bg-purple-950/25 rounded-r-lg p-3">
                    <div className="text-[11px] text-purple-300 font-semibold flex items-center gap-1.5">
                        <span className="material-icons-round text-xs text-purple-400">sync_alt</span>
                        {t.inputPanel.transferSwitchHelp || "Panel is powered by two power sources (Source 1 & Source 2)"}
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                            {t.inputPanel.secondBreakerName || "Second Breaker Name"}
                        </label>
                        <input
                            type="text"
                            name="secondBreakerName"
                            value={formData.secondBreakerName || ''}
                            onChange={handleChange}
                            placeholder="e.g. Q2 / Generator Incomer / Source 2"
                            className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 focus:outline-none focus:border-purple-500 text-sm"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">
                                {t.inputPanel.secondBreakerNumber || "Second Breaker # / Code"}
                            </label>
                            <input
                                type="text"
                                name="secondBreakerNumber"
                                value={formData.secondBreakerNumber || ''}
                                onChange={handleChange}
                                placeholder="e.g. 2 / Q2 / CB-2"
                                className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 focus:outline-none focus:border-purple-500 text-sm font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">
                                {t.inputPanel.secondBreakerAmps || "Second Breaker Current (A)"}
                            </label>
                            <input
                                type="number"
                                name="secondBreakerAmps"
                                value={formData.secondBreakerAmps !== undefined ? formData.secondBreakerAmps : ''}
                                onChange={handleChange}
                                min="0"
                                step="any"
                                placeholder="e.g. 160"
                                className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 focus:outline-none focus:border-purple-500 text-sm font-mono"
                            />
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-center gap-2 pt-1 border-t border-slate-700/50">
                <input
                    type="checkbox"
                    id="isEssential"
                    name="isEssential"
                    checked={formData.isEssential || false}
                    onChange={handleChange}
                    className="w-4 h-4 text-red-600 rounded focus:ring-red-500 bg-slate-700 border-slate-600"
                />
                <label htmlFor="isEssential" className="text-xs font-medium text-slate-300 select-none flex items-center gap-1.5 cursor-pointer">
                    <LegendIcon icon="star" color="#ef4444" size={16} />
                    {t.inputPanel.isEssential}
                </label>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.amperage}</label>
            <input
              type="number"
              name="amps"
              value={formData.amps === undefined ? '' : formData.amps}
              onChange={handleChange}
              placeholder="Optional"
              className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.voltage}</label>
            <input
              type="number"
              name="voltage"
              value={formData.voltage === undefined ? '' : formData.voltage}
              onChange={handleChange}
              placeholder="Optional"
              className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>
        </div>

        {showKvaOption && (
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.kva}</label>
                <input
                type="number"
                name="kva"
                value={formData.kva === undefined ? '' : formData.kva}
                onChange={handleChange}
                placeholder="e.g. 1000"
                className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                />
            </div>
        )}

        <div className="bg-slate-900/50 p-3 rounded border border-slate-700/50 space-y-3">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.inputPanel.location}</h4>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.building}</label>
                    <input
                        type="text"
                        name="building"
                        value={formData.building}
                        onChange={handleChange}
                        className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.floor}</label>
                    <input
                        type="text"
                        name="floor"
                        value={formData.floor}
                        onChange={handleChange}
                        className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                    />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.office}</label>
                    <input
                        type="text"
                        name="office"
                        value={formData.office || ''}
                        onChange={handleChange}
                        placeholder="Optional"
                        className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.place}</label>
                    <input
                        type="text"
                        name="place"
                        value={formData.place}
                        onChange={handleChange}
                        className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                    />
                </div>
            </div>
        </div>

        <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">{t.inputPanel.description}</label>
            <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={2}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm resize-none"
            />
        </div>

        {activeTab === 'edit' && (
            <div className="mt-4 pt-4 border-t border-slate-700">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{t.inputPanel.downstreamConnections}</h4>
                {selectedNode.children.length === 0 ? (
                    <p className="text-xs text-slate-500 italic text-center py-2">{t.inputPanel.noConnections}</p>
                ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                        {selectedNode.children.map(child => (
                            <div key={child.id} className="flex items-center justify-between bg-slate-900 p-2 rounded border border-slate-700 group hover:border-slate-600 transition-colors">
                                <div 
                                    className="flex items-center gap-2 overflow-hidden cursor-pointer"
                                    onClick={() => onNavigate?.(child.id)}
                                    title="Select this component"
                                >
                                    <span className="material-icons-round text-sm text-slate-500" style={{ color: child.customColor || COMPONENT_CONFIG[child.type]?.color }}>{COMPONENT_CONFIG[child.type]?.icon}</span>
                                    <div className="flex flex-col truncate">
                                        <span className="text-xs font-medium text-slate-300 truncate">{child.name}</span>
                                        <span className="text-[10px] text-slate-500">{child.componentNumber || child.type}</span>
                                    </div>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        type="button"
                                        onClick={() => onStartConnection?.(child.id)} 
                                        title="Re-route (Link to another parent)"
                                        className="p-1 text-slate-400 hover:text-amber-400 hover:bg-amber-400/10 rounded"
                                    >
                                        <span className="material-icons-round text-sm">link</span>
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => onDetach?.(child.id)} 
                                        title="Detach (Move to Root)"
                                        className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded"
                                    >
                                        <span className="material-icons-round text-sm">link_off</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}

        <div className="pt-4 flex flex-col gap-3">
          <div className="flex gap-3">
            <button
                type="submit"
                className={`flex-1 text-white font-medium py-2 px-4 rounded transition-colors flex items-center justify-center gap-2 shadow-lg ${
                    activeTab === 'add' 
                    ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-900/20' 
                    : 'bg-yellow-600 hover:bg-yellow-700 shadow-yellow-900/20'
                }`}
            >
                <span className="material-icons-round text-lg">
                    {activeTab === 'add' ? 'add_circle' : 'save'}
                </span>
                {activeTab === 'add' ? t.inputPanel.addToDiagram : t.inputPanel.saveChanges}
            </button>
            <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
            >
                {t.inputPanel.close}
            </button>
          </div>
          
          {activeTab === 'edit' && !isSystemRoot && (
              <button
                type="button"
                onClick={() => onDelete()}
                className="w-full py-2 px-4 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 rounded transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <span className="material-icons-round text-sm">delete</span>
                {t.inputPanel.deleteComponent}
              </button>
          )}
        </div>
      </form>
    </div>
  );
};
