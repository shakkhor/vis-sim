import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useVisSim } from '../state/store';
import { teamById } from '../domain/scene';
import { fmtTime } from '../domain/engine';
import type { Conflict } from '../domain/types';

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
                title={`${m.name}  ${fmtTime(m.tStart)}–${fmtTime(m.tEnd)} — drag to retime`}
              >
                <span className="bar-time">
                  {fmtTime(m.tStart)}–{fmtTime(m.tEnd)}
                </span>
              </div>
              {moveConflicts.map((c) => (
                <div
                  key={c.id}
                  className={`conflict-band ${c.blocking ? 'blocking' : ''}`}
                  style={{
                    left: `${pct(c.t0)}%`,
                    width: `${Math.max(0.4, pct(c.t1) - pct(c.t0))}%`,
                  }}
                  title={`Conflict ${fmtTime(c.t0)}–${fmtTime(c.t1)}`}
                />
              ))}
            </div>
          );
        })}
        <div className="playhead" style={{ left: `${pct(playhead)}%` }} />
      </div>
    </div>
  );
}
