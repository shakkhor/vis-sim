import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useVisSim } from '../state/store';
import { teamById } from '../domain/scene';
import { fmtTime } from '../domain/engine';
import type { Conflict } from '../domain/types';

const MIN_DURATION = 5;

const edgeHandleStyle = (side: 'left' | 'right'): CSSProperties => ({
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 8,
  ...(side === 'left' ? { left: 0 } : { right: 0 }),
  cursor: 'ew-resize',
  touchAction: 'none',
});

export default function Timeline({ conflicts }: { conflicts: Conflict[] }) {
  const scene = useVisSim((s) => s.scene);
  const moves = useVisSim((s) => s.moves);
  const playhead = useVisSim((s) => s.playhead);
  const setPlayhead = useVisSim((s) => s.setPlayhead);
  const retimeMove = useVisSim((s) => s.retimeMove);
  const selectMove = useVisSim((s) => s.selectMove);
  const selectedMoveId = useVisSim((s) => s.selectedMoveId);
  const lanesRef = useRef<HTMLDivElement>(null);

  const span = scene.dayEnd - scene.dayStart;
  const pct = (t: number) => ((t - scene.dayStart) / span) * 100;

  const timeFromClientX = (clientX: number) => {
    const el = lanesRef.current;
    if (!el) return scene.dayStart;
    const r = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return scene.dayStart + f * span;
  };

  const onBarPointerDown = (e: ReactPointerEvent, moveId: string) => {
    e.preventDefault();
    e.stopPropagation();
    selectMove(moveId);
    const move = moves.find((m) => m.id === moveId);
    const el = lanesRef.current;
    if (!move || !el) return;
    const startX = e.clientX;
    const { tStart, tEnd } = move;
    const width = el.getBoundingClientRect().width;

    const onMove = (ev: PointerEvent) => {
      const dMin = ((ev.clientX - startX) / width) * span;
      let ns = tStart + dMin;
      let ne = tEnd + dMin;
      if (ns < scene.dayStart) {
        ne += scene.dayStart - ns;
        ns = scene.dayStart;
      }
      if (ne > scene.dayEnd) {
        ns -= ne - scene.dayEnd;
        ne = scene.dayEnd;
      }
      retimeMove(moveId, Math.round(ns), Math.round(ne));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onEdgePointerDown = (e: ReactPointerEvent, moveId: string, edge: 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    selectMove(moveId);
    const move = moves.find((m) => m.id === moveId);
    const el = lanesRef.current;
    if (!move || !el) return;
    const startX = e.clientX;
    const { tStart, tEnd } = move;
    const width = el.getBoundingClientRect().width;

    const onMove = (ev: PointerEvent) => {
      const dMin = ((ev.clientX - startX) / width) * span;
      if (edge === 'start') {
        const ns = Math.round(
          Math.min(tEnd - MIN_DURATION, Math.max(scene.dayStart, tStart + dMin)),
        );
        retimeMove(moveId, ns, tEnd);
      } else {
        const ne = Math.round(Math.max(tStart + MIN_DURATION, Math.min(scene.dayEnd, tEnd + dMin)));
        retimeMove(moveId, tStart, ne);
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const hours: number[] = [];
  for (let t = scene.dayStart; t <= scene.dayEnd; t += 60) hours.push(t);

  return (
    <div className="timeline">
      <div className="tl-labels">
        <div className="tl-label tl-label-header">Moves</div>
        {moves.map((m) => (
          <div className="tl-label" key={m.id} title={m.name}>
            {m.name}
          </div>
        ))}
      </div>
      <div
        className="tl-right"
        ref={lanesRef}
        onPointerDown={(e) => setPlayhead(timeFromClientX(e.clientX))}
      >
        <div className="tl-ruler">
          {hours.map((t) => (
            <span key={t} className="tick" style={{ left: `${pct(t)}%` }}>
              {fmtTime(t)}
            </span>
          ))}
        </div>
        {moves.map((m) => {
          const team = teamById(scene, m.teamId);
          const moveConflicts = conflicts.filter((c) => c.moveAId === m.id || c.moveBId === m.id);
          return (
            <div className="tl-lane" key={m.id}>
              <div
                className={`bar ${m.id === selectedMoveId ? 'selected' : ''}`}
                style={{
                  left: `${pct(m.tStart)}%`,
                  width: `${pct(m.tEnd) - pct(m.tStart)}%`,
                  background: team?.color ?? '#888',
                }}
                onPointerDown={(e) => onBarPointerDown(e, m.id)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setPlayhead(m.tStart);
                }}
                title={`${m.name}  ${fmtTime(m.tStart)}–${fmtTime(m.tEnd)} — drag to retime`}
              >
                <span className="bar-time">
                  {fmtTime(m.tStart)}–{fmtTime(m.tEnd)}
                </span>
                <div
                  style={edgeHandleStyle('left')}
                  onPointerDown={(e) => onEdgePointerDown(e, m.id, 'start')}
                  title={`${m.name} — drag to change start time`}
                />
                <div
                  style={edgeHandleStyle('right')}
                  onPointerDown={(e) => onEdgePointerDown(e, m.id, 'end')}
                  title={`${m.name} — drag to change end time`}
                />
              </div>
              {moveConflicts.map((c) => (
                <div
                  key={c.id}
                  className={`conflict-band ${c.blocking ? 'blocking' : ''}`}
                  style={{
                    left: `${pct(c.t0)}%`,
                    width: `${Math.max(0.4, pct(c.t1) - pct(c.t0))}%`,
                    pointerEvents: 'auto',
                    cursor: 'pointer',
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setPlayhead(c.t0);
                  }}
                  title={`Conflict ${fmtTime(c.t0)}–${fmtTime(c.t1)}`}
                />
              ))}
            </div>
          );
        })}
        <div className="playhead" style={{ left: `${pct(playhead)}%` }}>
          <span
            style={{
              position: 'absolute',
              top: 0,
              transform: 'translateX(-50%)',
              background: '#ff4d6d',
              color: '#0d1017',
              fontSize: 10,
              fontWeight: 700,
              padding: '0 4px',
              borderRadius: 3,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {fmtTime(playhead)}
          </span>
        </div>
      </div>
    </div>
  );
}
