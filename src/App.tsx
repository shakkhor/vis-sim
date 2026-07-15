import Viewport3D from './components/Viewport3D';
import Timeline from './components/Timeline';
import SidePanel from './components/SidePanel';
import PlanIO from './components/PlanIO';
import { useShortcuts } from './hooks/useShortcuts';
import { useVisSim } from './state/store';
import { usePlanAnalysis } from './state/selectors';
import { fmtTime } from './domain/engine';
import { SCENES } from './domain/scenes';

export default function App() {
  useShortcuts();
  const scene = useVisSim((s) => s.scene);
  const setScene = useVisSim((s) => s.setScene);
  const planName = useVisSim((s) => s.planName);
  const playhead = useVisSim((s) => s.playhead);
  const playing = useVisSim((s) => s.playing);
  const togglePlay = useVisSim((s) => s.togglePlay);
  const mode = useVisSim((s) => s.mode);
  const setMode = useVisSim((s) => s.setMode);
  const viewMode = useVisSim((s) => s.viewMode);
  const setViewMode = useVisSim((s) => s.setViewMode);
  const { conflicts, approverTeamIds, violations } = usePlanAnalysis();

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
        </select>
        <span className="muted">{planName}</span>
        <div className="grow" />
        <PlanIO />
        <button className={viewMode === '3d' ? 'active' : ''} onClick={() => setViewMode('3d')}>
          3D
        </button>
        <button className={viewMode === 'top' ? 'active' : ''} onClick={() => setViewMode('top')}>
          2D
        </button>
        <button className={viewMode === 'iso' ? 'active' : ''} onClick={() => setViewMode('iso')}>
          Iso
        </button>
        <button className={mode === 'select' ? 'active' : ''} onClick={() => setMode('select')}>
          Select
        </button>
        <button className={mode === 'draw' ? 'active' : ''} onClick={() => setMode('draw')}>
          + Draw move
        </button>
        <button className="primary" onClick={togglePlay}>
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <span className="clock">{fmtTime(playhead)}</span>
      </header>
      <div className="main">
        <div className="viewport">
          <Viewport3D conflicts={conflicts} violations={violations} />
        </div>
        <SidePanel
          conflicts={conflicts}
          approverTeamIds={approverTeamIds}
          violations={violations}
        />
      </div>
      <Timeline conflicts={conflicts} />
    </div>
  );
}
