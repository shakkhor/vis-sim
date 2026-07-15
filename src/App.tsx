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
  const { conflicts, approverTeamIds } = usePlanAnalysis();

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">VisSim</span>
        <span className="muted">Phase 0 — flagship loop prototype</span>
        <div className="grow" />
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
