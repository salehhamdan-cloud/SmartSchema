import React from 'react';
import { ElectricalNode } from '../types';
import { COMPONENT_CONFIG } from '../constants';
import { LegendIcon } from './LegendIcon';

interface ReadOnlyInspectorProps {
  selectedNode: ElectricalNode | null;
  parentNode: ElectricalNode | null;
  t: any;
  isRTL: boolean;
  onNavigateToNode?: (nodeId: string) => void;
}

export const ReadOnlyInspector: React.FC<ReadOnlyInspectorProps> = ({
  selectedNode,
  parentNode,
  t,
  isRTL,
  onNavigateToNode
}) => {
  if (!selectedNode) {
    return (
      <div className="p-6 text-center text-slate-400 space-y-3">
        <div className="w-12 h-12 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
          <span className="material-icons-round text-2xl">touch_app</span>
        </div>
        <div className="text-sm font-semibold text-slate-300">
          {t.readOnly?.selectNodePrompt || "Select a component to inspect details"}
        </div>
        <p className="text-xs text-slate-500 max-w-[240px] mx-auto">
          {t.readOnly?.selectNodeDesc || "Click on any node in the single-line diagram to view its technical specifications, electrical parameters, and location."}
        </p>
      </div>
    );
  }

  const config = COMPONENT_CONFIG[selectedNode.type];
  const typeName = t.componentTypes[selectedNode.type] || selectedNode.type;

  // Calculate downstream statistics
  const countChildren = (n: ElectricalNode): number => {
    return n.children.reduce((acc, c) => acc + 1 + countChildren(c), 0);
  };
  const totalSubNodes = countChildren(selectedNode);

  const calculateSubLoad = (n: ElectricalNode): { kva: number; amps: number } => {
    let kva = parseFloat(String(n.kva || '0')) || 0;
    let amps = parseFloat(String(n.amps || '0')) || 0;
    for (const c of n.children) {
      const sub = calculateSubLoad(c);
      kva += sub.kva;
      amps += sub.amps;
    }
    return { kva, amps };
  };
  const subLoads = calculateSubLoad(selectedNode);

  return (
    <div className="space-y-4 text-slate-200">
      {/* Header Info */}
      <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700/80 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md shrink-0"
              style={{ backgroundColor: `${config?.color || '#3b82f6'}20`, border: `1px solid ${config?.color || '#3b82f6'}50` }}
            >
              <LegendIcon icon={config?.icon || 'help'} color={config?.color || '#94a3b8'} size={22} />
            </div>
            <div>
              <div className="text-base font-bold text-white leading-tight">{selectedNode.name}</div>
              <div className="text-xs text-blue-400 font-semibold mt-0.5 flex items-center gap-1.5">
                <span>{typeName}</span>
                {selectedNode.componentNumber && (
                  <>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-300 font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">
                      {selectedNode.componentNumber}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-slate-900 text-slate-400 border border-slate-700">
            {t.readOnly?.badge || "Viewer"}
          </span>
        </div>

        {selectedNode.model && (
          <div className="text-xs text-slate-400 italic bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-slate-500 font-normal">{t.inputPanel.model}: </span>
            {selectedNode.model}
          </div>
        )}

        {selectedNode.description && (
          <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/70">
            {selectedNode.description}
          </p>
        )}
      </div>

      {/* Electrical Specifications */}
      <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-2.5">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <span className="material-icons-round text-sm text-yellow-400">bolt</span>
          {t.inputPanel.electricalParams || "Electrical Specifications"}
        </h4>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-700/70">
            <div className="text-[10px] text-slate-500 font-medium uppercase">{t.inputPanel.amps}</div>
            <div className="text-sm font-bold text-emerald-400">{selectedNode.amps ? `${selectedNode.amps}A` : '—'}</div>
          </div>
          <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-700/70">
            <div className="text-[10px] text-slate-500 font-medium uppercase">{t.inputPanel.voltage}</div>
            <div className="text-sm font-bold text-amber-400">{selectedNode.voltage ? `${selectedNode.voltage}V` : '—'}</div>
          </div>
          <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-700/70">
            <div className="text-[10px] text-slate-500 font-medium uppercase">{t.inputPanel.kva}</div>
            <div className="text-sm font-bold text-cyan-400">{selectedNode.kva ? `${selectedNode.kva} kVA` : '—'}</div>
          </div>
        </div>
      </div>

      {/* Upstream Parent / Feeding Connection */}
      <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-2">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <span className="material-icons-round text-sm text-blue-400">account_tree</span>
          {t.inputPanel.parentNode || "Parent Component (Father)"}
        </h4>
        {parentNode ? (
          <button
            type="button"
            onClick={() => onNavigateToNode && onNavigateToNode(parentNode.id)}
            className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800/90 border border-slate-700 hover:border-blue-500/50 transition-colors group text-left"
          >
            <div className="flex items-center gap-2.5">
              <LegendIcon
                icon={COMPONENT_CONFIG[parentNode.type]?.icon || 'help'}
                color={COMPONENT_CONFIG[parentNode.type]?.color || '#94a3b8'}
                size={18}
              />
              <div>
                <div className="text-xs font-bold text-slate-200 group-hover:text-blue-300 transition-colors">
                  {parentNode.name}
                </div>
                <div className="text-[10px] text-slate-400">
                  {t.componentTypes[parentNode.type] || parentNode.type} {parentNode.componentNumber ? `• ${parentNode.componentNumber}` : ''}
                </div>
              </div>
            </div>
            <span className="material-icons-round text-slate-500 group-hover:text-blue-400 text-sm">
              visibility
            </span>
          </button>
        ) : (
          <div className="text-xs text-amber-400 bg-amber-950/40 border border-amber-800/40 p-2 rounded-lg flex items-center gap-2">
            <span>⚡</span>
            <span>{t.inputPanel.rootNodeNoParent || "Independent Root (No Parent)"}</span>
          </div>
        )}
      </div>

      {/* Location Details */}
      {(selectedNode.building || selectedNode.floor || selectedNode.office || selectedNode.place) && (
        <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-2">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <span className="material-icons-round text-sm text-purple-400">place</span>
            {t.inputPanel.location || "Location Details"}
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {selectedNode.building && (
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px] uppercase">{t.inputPanel.building}</span>
                <span className="font-semibold text-slate-200">{selectedNode.building}</span>
              </div>
            )}
            {selectedNode.floor && (
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px] uppercase">{t.inputPanel.floor}</span>
                <span className="font-semibold text-slate-200">{selectedNode.floor}</span>
              </div>
            )}
            {selectedNode.office && (
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px] uppercase">{t.inputPanel.office}</span>
                <span className="font-semibold text-slate-200">{selectedNode.office}</span>
              </div>
            )}
            {selectedNode.place && (
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px] uppercase">{t.inputPanel.place}</span>
                <span className="font-semibold text-slate-200">{selectedNode.place}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Badges / Attribute Flags */}
      <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-2">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <span className="material-icons-round text-sm text-cyan-400">verified</span>
          {t.readOnly?.attributes || "Features & Attributes"}
        </h4>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {selectedNode.isEssential && (
            <span className="px-2.5 py-1 rounded-full bg-red-950/80 border border-red-700/60 text-red-300 font-medium flex items-center gap-1">
              <span className="material-icons-round text-xs">star</span>
              {t.inputPanel.essential}
            </span>
          )}
          {selectedNode.hasGeneratorConnection && (
            <span className="px-2.5 py-1 rounded-full bg-orange-950/80 border border-orange-700/60 text-orange-300 font-medium flex items-center gap-1">
              <span className="material-icons-round text-xs">settings_power</span>
              {t.inputPanel.generatorBackup} {selectedNode.generatorName ? `(${selectedNode.generatorName})` : ''}
            </span>
          )}
          {selectedNode.hasMeter && (
            <span className="px-2.5 py-1 rounded-full bg-blue-950/80 border border-blue-700/60 text-blue-300 font-medium flex items-center gap-1">
              <span className="material-icons-round text-xs">speed</span>
              {t.inputPanel.hasMeter} {selectedNode.meterNumber ? `(#${selectedNode.meterNumber})` : ''}
            </span>
          )}
          {selectedNode.isPublicBoard && (
            <span className="px-2.5 py-1 rounded-full bg-teal-950/80 border border-teal-700/60 text-teal-300 font-medium flex items-center gap-1">
              <span className="material-icons-round text-xs">public</span>
              {t.inputPanel.isPublicBoard}
            </span>
          )}
          {selectedNode.hasMultimeter && (
            <span className="px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 font-medium flex items-center gap-1">
              <span className="material-icons-round text-xs">electric_meter</span>
              {t.inputPanel.hasMultimeter}
            </span>
          )}
          {selectedNode.isAirConditioning && (
            <span className="px-2.5 py-1 rounded-full bg-cyan-950/80 border border-cyan-700/60 text-cyan-300 font-medium flex items-center gap-1">
              <span className="material-icons-round text-xs">ac_unit</span>
              {t.inputPanel.airConditioner || t.inputPanel.isAC}
            </span>
          )}
          {selectedNode.isAirBreaker && (
            <span className="px-2.5 py-1 rounded-full bg-sky-950/80 border border-sky-700/60 text-sky-300 font-medium flex items-center gap-1">
              <LegendIcon icon="air_breaker" color="#38bdf8" size={14} />
              {t.inputPanel.isAirBreaker || "Air Breaker (ACB)"}
            </span>
          )}
          {selectedNode.isReserved && (
            <span className="px-2.5 py-1 rounded-full bg-yellow-950/80 border border-yellow-700/60 text-yellow-300 font-medium flex items-center gap-1">
              <span className="material-icons-round text-xs">lock</span>
              {t.inputPanel.reserved}
            </span>
          )}
          {selectedNode.hasTransferSwitch && (
            <div className="w-full p-2.5 rounded-lg bg-purple-950/60 border border-purple-700/60 text-purple-200 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-purple-300">
                <LegendIcon icon="transfer_switch" color="#c084fc" size={14} />
                <span>{t.inputPanel?.hasTransferSwitch || "Power Source Switching Controller (ATS)"}</span>
              </div>
              {(selectedNode.secondBreakerName || selectedNode.secondBreakerNumber || selectedNode.secondBreakerAmps !== undefined) && (
                <div className="text-[11px] text-purple-300/90 pl-5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono">
                  {selectedNode.secondBreakerName && (
                    <span><strong className="text-purple-200">{t.inputPanel?.secondBreakerName || "Second Breaker"}:</strong> {selectedNode.secondBreakerName}</span>
                  )}
                  {selectedNode.secondBreakerNumber && (
                    <span><strong className="text-purple-200">{t.inputPanel?.secondBreakerNumber || "Breaker #"}:</strong> #{selectedNode.secondBreakerNumber}</span>
                  )}
                  {selectedNode.secondBreakerAmps !== undefined && (
                    <span><strong className="text-purple-200">{t.inputPanel?.secondBreakerAmps || "Current"}:</strong> {selectedNode.secondBreakerAmps}A</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Downstream Sub-branch Summary */}
      {selectedNode.children && selectedNode.children.length > 0 && (
        <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-2">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <span className="material-icons-round text-sm text-indigo-400">schema</span>
            {t.readOnly?.downstreamTree || "Downstream Circuits"}
          </h4>
          <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">{t.readOnly?.directChildren || "Direct Circuits / Feeders"}:</span>
            <span className="font-bold text-slate-200">{selectedNode.children.length}</span>
          </div>
          <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">{t.readOnly?.totalDownstream || "Total Sub-components"}:</span>
            <span className="font-bold text-blue-400">{totalSubNodes}</span>
          </div>
        </div>
      )}
    </div>
  );
};
