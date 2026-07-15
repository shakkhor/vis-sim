import Viewport3D from './components/Viewport3D';
import Timeline from './components/Timeline';
import SidePanel from './components/SidePanel';
import { useVisSim } from './state/store';
import { usePlanAnalysis } from './state/selectors';
import { fmtTime } from './domain/engine';

export default function App() {
  const playhead = useVisSim((s) => s.playhead);
  const playing = useVisSim((s) => s.playing);
  const togglePlay = useVisSim((s) => s.togglePlay);
  const mode = useVisSim((s) => s.mode);
  const setMode = useVisSim((s) => s.setMode);
  const viewMode = useVisSim((s) => s.viewMode);
  const setViewMode = useVisSim((s) => s.setViewMode);
  const { conflicts, approverTeamIds } = usePlanAnalysis();

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">VisSim</span>
        <span className="muted">Phase 0 — flagship loop prototype</span>
        <div className="grow" />
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
          <Viewport3D conflicts={conflicts} />
        </div>
        <SidePanel conflicts={conflicts} approverTeamIds={approverTeamIds} />
      </div>
      <Timeline conflicts={conflicts} />
    </div>
  );
}
