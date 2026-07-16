import { useState } from 'react';
import type { ReactNode } from 'react';
import Viewport3D from './components/Viewport3D';
import TimelineDock from './components/Timeline';
import SidePanel from './components/SidePanel';
import PlanIO from './components/PlanIO';
import ConfirmDialog from './components/ConfirmDialog';
import { Icon } from './components/icons';
import type { IconName } from './components/icons';
import { useShortcuts } from './hooks/useShortcuts';
import { listPersistedCustomScenes, nextLeftRail, useVisSim } from './state/store';
import type { Mode } from './state/store';
import { usePlanAnalysis, useTeamFocus } from './state/selectors';
import { SCENES } from './domain/scenes';
import type { Conflict, RuleViolation } from './domain/types';

// ---------------------------------------------------------------------------
// Left tool rail: global tools always, scene tools only while editing the scene.
// ---------------------------------------------------------------------------

/** Everything the armed-add tools need per kind: icon, label, placement hint. */
type PendingAddKind = 'zone' | 'connector' | 'wall' | 'box';

function ToolRail() {
  const mode = useVisSim((s) => s.mode);
  const toggleMode = useVisSim((s) => s.toggleMode);
  const pendingAdd = useVisSim((s) => s.pendingAdd);
  const setPendingAdd = useVisSim((s) => s.setPendingAdd);
  const selectedResourceId = useVisSim((s) => s.selectedResourceId);
  const duplicateSelectedResource = useVisSim((s) => s.duplicateSelectedResource);
  const resetSceneToDefault = useVisSim((s) => s.resetSceneToDefault);
  const leftRail = useVisSim((s) => s.ui.leftRail);
  const setUi = useVisSim((s) => s.setUi);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const tool = (m: Mode, icon: IconName, label: string, key: string, hint: string): ReactNode => (
    <button
      className={`tool-btn ${mode === m ? 'active' : ''}`}
      title={`${label} (${key}) — ${hint}`}
      aria-pressed={mode === m}
      onClick={() => toggleMode(m)}
    >
      <Icon name={icon} />
      <span className="tool-label">{label}</span>
      <span className="tool-key">{key}</span>
    </button>
  );

  const addTool = (
    kind: PendingAddKind,
    icon: IconName,
    label: string,
    hint: string,
  ): ReactNode => (
    <button
      className={`tool-btn ${pendingAdd === kind ? 'active' : ''}`}
      title={`${label} — ${hint}`}
      aria-pressed={pendingAdd === kind}
      onClick={() => setPendingAdd(pendingAdd === kind ? null : kind)}
    >
      <Icon name={icon} />
      <span className="tool-label">{label}</span>
    </button>
  );

  return (
    <>
      <div className={`tool-rail rail-${leftRail}`}>
        <div className="rail-section">Tools</div>
        {tool('select', 'select', 'Select', 'V', 'pick moves and set the playhead')}
        {tool('draw', 'draw', 'Draw move', 'M', 'click the ground to add waypoints')}
        {tool(
          'scene',
          'scene',
          'Edit scene',
          'E',
          'move, resize and manage zones; click again to exit',
        )}
        {mode === 'scene' && (
          <>
            <div className="rail-divider" />
            <div className="rail-section">Scene tools</div>
            {addTool('zone', 'zone', 'Add zone', 'click two corners on the ground')}
            {addTool('connector', 'connector', 'Add connector', 'click two corners on the ground')}
            {addTool('wall', 'wall', 'Add wall', 'click two corners — visual only, not reservable')}
            {addTool('box', 'box', 'Add box', 'click two corners — visual only, not reservable')}
            <button
              className="tool-btn"
              title="Duplicate selected resource (Ctrl/Cmd+D)"
              disabled={!selectedResourceId}
              onClick={duplicateSelectedResource}
            >
              <Icon name="duplicate" />
              <span className="tool-label">Duplicate</span>
            </button>
            <button
              className="tool-btn"
              title="Reset scene to its default layout and plan"
              onClick={() => setConfirmingReset(true)}
            >
              <Icon name="reset" />
              <span className="tool-label">Reset scene</span>
            </button>
            <ConfirmDialog
              open={confirmingReset}
              title="Reset scene"
              body="Reset this scene to its default layout and plan? Current edits are discarded."
              confirmLabel="Reset scene"
              onConfirm={() => {
                setConfirmingReset(false);
                resetSceneToDefault();
              }}
              onCancel={() => setConfirmingReset(false)}
            />
          </>
        )}
      </div>
      <button
        className="edge-tab edge-tab-left"
        title={`Tool rail: ${leftRail} — click to ${
          leftRail === 'expanded' ? 'shrink to icons' : leftRail === 'slim' ? 'hide' : 'expand'
        } ([)`}
        aria-label="Cycle left tool rail"
        onClick={() => setUi({ leftRail: nextLeftRail(leftRail) })}
      >
        <Icon name={leftRail === 'hidden' ? 'chevronRight' : 'chevronLeft'} size={12} />
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Status/hint bar: contextual instructions left, plan health readout right.
// ---------------------------------------------------------------------------

/** Natural-language noun per armed-add kind; Record keeps this exhaustive. */
const PENDING_ADD_NOUN: Record<PendingAddKind, string> = {
  zone: 'a zone',
  connector: 'a connector',
  wall: 'a wall block',
  box: 'a box block',
};

function modeHint(mode: Mode, pendingAdd: PendingAddKind | null): string {
  if (mode === 'draw') {
    return 'Draw move — click the ground to add waypoints · finish in the right panel · Esc to cancel';
  }
  if (mode === 'scene') {
    if (pendingAdd) {
      return `Add ${PENDING_ADD_NOUN[pendingAdd]} — click the ground for the first corner, click again to place · Esc to disarm`;
    }
    return 'Edit scene — click a resource to select · drag to move, handles to resize · Ctrl/Cmd+D duplicate · Esc to exit';
  }
  return 'Select — click a move or drag bars on the timeline · V/M/E tools · Space play · [ ] \\ panels';
}

function StatusBar({
  conflicts,
  violations,
}: {
  conflicts: Conflict[];
  violations: RuleViolation[];
}) {
  const mode = useVisSim((s) => s.mode);
  const pendingAdd = useVisSim((s) => s.pendingAdd);
  const revision = useVisSim((s) => s.revision);
  const blocking = conflicts.filter((c) => c.blocking).length;
  return (
    <footer className="status-bar">
      <span className="status-hint">{modeHint(mode, pendingAdd)}</span>
      <div className="grow" />
      <span className="chip-mini chip-neutral">rev {revision}</span>
      <span
        className={`chip-mini ${
          blocking > 0 ? 'chip-red' : conflicts.length > 0 ? 'chip-amber' : 'chip-green'
        }`}
      >
        {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}
      </span>
      <span className={`chip-mini ${violations.length > 0 ? 'chip-red' : 'chip-green'}`}>
        {violations.length} violation{violations.length === 1 ? '' : 's'}
      </span>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// App shell: topbar / (rail | viewport | right dock) / bottom dock / status bar.
// ---------------------------------------------------------------------------

export default function App() {
  useShortcuts();
  const scene = useVisSim((s) => s.scene);
  const setScene = useVisSim((s) => s.setScene);
  const planName = useVisSim((s) => s.planName);
  const viewMode = useVisSim((s) => s.viewMode);
  const setViewMode = useVisSim((s) => s.setViewMode);
  const canUndo = useVisSim((s) => s.canUndo);
  const canRedo = useVisSim((s) => s.canRedo);
  const undo = useVisSim((s) => s.undo);
  const redo = useVisSim((s) => s.redo);
  const newScene = useVisSim((s) => s.newScene);
  const ui = useVisSim((s) => s.ui);
  const setUi = useVisSim((s) => s.setUi);
  const { reservations, conflicts, approverTeamIds, violations } = usePlanAnalysis();
  const teamFocus = useTeamFocus(reservations);

  // Custom scenes (not in the built-in registry): the active one plus any persisted
  // ones, deduped by id so the <select> always has an option matching scene.id.
  const registryIds = new Set(SCENES.map((entry) => entry.scene.id));
  const customScenes: { id: string; name: string }[] = [];
  const seenCustomIds = new Set<string>();
  if (!registryIds.has(scene.id)) {
    customScenes.push({ id: scene.id, name: scene.name });
    seenCustomIds.add(scene.id);
  }
  for (const persisted of listPersistedCustomScenes()) {
    if (!registryIds.has(persisted.id) && !seenCustomIds.has(persisted.id)) {
      customScenes.push(persisted);
      seenCustomIds.add(persisted.id);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">VisSim</span>
        <select aria-label="Scene" value={scene.id} onChange={(e) => setScene(e.target.value)}>
          {SCENES.map((entry) => (
            <option key={entry.scene.id} value={entry.scene.id}>
              {entry.scene.name}
            </option>
          ))}
          {customScenes.map((custom) => (
            <option key={custom.id} value={custom.id}>
              {custom.name}
            </option>
          ))}
        </select>
        <button title="Create a new blank scene" onClick={newScene}>
          New
        </button>
        <span className="plan-name muted" title={planName}>
          {planName}
        </span>
        <div className="grow" />
        <PlanIO />
        <span className="tb-divider" />
        <button
          className="icon-btn"
          title="Undo (Ctrl/Cmd+Z)"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={undo}
        >
          <Icon name="undo" size={15} />
        </button>
        <button
          className="icon-btn"
          title="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)"
          aria-label="Redo"
          disabled={!canRedo}
          onClick={redo}
        >
          <Icon name="redo" size={15} />
        </button>
        <span className="tb-divider" />
        <div className="seg" role="group" aria-label="View mode">
          <button
            className={viewMode === '3d' ? 'active' : ''}
            title="Perspective view (1)"
            onClick={() => setViewMode('3d')}
          >
            3D
          </button>
          <button
            className={viewMode === 'top' ? 'active' : ''}
            title="Top-down view (2)"
            onClick={() => setViewMode('top')}
          >
            2D
          </button>
          <button
            className={viewMode === 'iso' ? 'active' : ''}
            title="Isometric view (3)"
            onClick={() => setViewMode('iso')}
          >
            Iso
          </button>
        </div>
        <span className="tb-divider" />
        <button
          className={`icon-btn ${ui.rightOpen ? 'active' : ''}`}
          title="Toggle right panel (])"
          aria-label="Toggle right panel"
          aria-pressed={ui.rightOpen}
          onClick={() => setUi({ rightOpen: !ui.rightOpen })}
        >
          <Icon name="panelRight" size={15} />
        </button>
        <button
          className={`icon-btn ${ui.bottomOpen ? 'active' : ''}`}
          title="Toggle timeline (\)"
          aria-label="Toggle timeline"
          aria-pressed={ui.bottomOpen}
          onClick={() => setUi({ bottomOpen: !ui.bottomOpen })}
        >
          <Icon name="panelBottom" size={15} />
        </button>
      </header>
      <div className="workbench">
        <ToolRail />
        <div className="viewport">
          <Viewport3D conflicts={conflicts} violations={violations} focus={teamFocus} />
        </div>
        <button
          className="edge-tab edge-tab-right"
          title={`${ui.rightOpen ? 'Hide' : 'Show'} right panel (])`}
          aria-label="Toggle right panel"
          onClick={() => setUi({ rightOpen: !ui.rightOpen })}
        >
          <Icon name={ui.rightOpen ? 'chevronRight' : 'chevronLeft'} size={12} />
        </button>
        <div className={`right-dock ${ui.rightOpen ? '' : 'closed'}`}>
          <SidePanel
            reservations={reservations}
            conflicts={conflicts}
            approverTeamIds={approverTeamIds}
            violations={violations}
          />
        </div>
      </div>
      <TimelineDock conflicts={conflicts} />
      <StatusBar conflicts={conflicts} violations={violations} />
    </div>
  );
}
