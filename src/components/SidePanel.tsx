import { useState } from 'react';
import { useVisSim } from '../state/store';
import { resourceById, teamById } from '../domain/scene';
import { fmtTime } from '../domain/engine';
import type { ActorKind, Conflict } from '../domain/types';

interface Props {
  conflicts: Conflict[];
  approverTeamIds: string[];
}

function parseTime(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function DraftForm() {
  const scene = useVisSim((s) => s.scene);
  const draftPath = useVisSim((s) => s.draftPath);
  const clearDraft = useVisSim((s) => s.clearDraft);
  const createMoveFromDraft = useVisSim((s) => s.createMoveFromDraft);
  const setMode = useVisSim((s) => s.setMode);
  const [name, setName] = useState('New move');
  const [actorKind, setActorKind] = useState<ActorKind>('staff');
  const [count, setCount] = useState(4);
  const [teamId, setTeamId] = useState(scene.authorTeamId);
  const [tStart, setTStart] = useState('13:00');
  const [tEnd, setTEnd] = useState('13:30');

  return (
    <div className="card">
      <h3>Draw a move</h3>
      <p className="muted">
        Click the ground to add waypoints ({draftPath.length} so far). Then set details and create.
      </p>
      <label>
        Name <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Actor{' '}
        <select value={actorKind} onChange={(e) => setActorKind(e.target.value as ActorKind)}>
          <option value="cohort">Spectator cohort</option>
          <option value="staff">Staff</option>
          <option value="vehicle">Vehicle</option>
          <option value="material">Material</option>
        </select>
      </label>
      <label>
        Count{' '}
        <input type="number" min={1} value={count} onChange={(e) => setCount(+e.target.value)} />
      </label>
      <label>
        Team{' '}
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          {scene.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Start{' '}
        <input value={tStart} onChange={(e) => setTStart(e.target.value)} placeholder="13:00" />
      </label>
      <label>
        End <input value={tEnd} onChange={(e) => setTEnd(e.target.value)} placeholder="13:30" />
      </label>
      <div className="row">
        <button
          className="primary"
          disabled={draftPath.length < 2 || parseTime(tEnd) <= parseTime(tStart)}
          onClick={() =>
            createMoveFromDraft({
              name,
              actorKind,
              count,
              teamId,
              tStart: parseTime(tStart),
              tEnd: parseTime(tEnd),
            })
          }
        >
          Create move
        </button>
        <button
          onClick={() => {
            clearDraft();
            setMode('select');
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function SidePanel({ conflicts, approverTeamIds }: Props) {
  const scene = useVisSim((s) => s.scene);
  const moves = useVisSim((s) => s.moves);
  const approvals = useVisSim((s) => s.approvals);
  const approve = useVisSim((s) => s.approve);
  const published = useVisSim((s) => s.published);
  const publish = useVisSim((s) => s.publish);
  const revision = useVisSim((s) => s.revision);
  const mode = useVisSim((s) => s.mode);
  const setPlayhead = useVisSim((s) => s.setPlayhead);
  const selectMove = useVisSim((s) => s.selectMove);
  const selectedMoveId = useVisSim((s) => s.selectedMoveId);
  const deleteMove = useVisSim((s) => s.deleteMove);

  const blocking = conflicts.filter((c) => c.blocking);
  const allApproved =
    approverTeamIds.length > 0 && approverTeamIds.every((t) => approvals[t] === 'approved');
  const status = published
    ? 'Published'
    : allApproved
      ? 'Ready to publish'
      : `In review · rev ${revision}`;

  const moveName = (id: string) => moves.find((m) => m.id === id)?.name ?? id;
  const authorTeam = teamById(scene, scene.authorTeamId);

  return (
    <div className="side-panel">
      <div className="card">
        <div className="row space-between">
          <h2>Matchday — Aug 12</h2>
          <span
            className={`chip ${published ? 'chip-green' : blocking.length ? 'chip-red' : 'chip-amber'}`}
          >
            {status}
          </span>
        </div>
        <p className="muted">
          Authored by <b>{authorTeam?.name}</b>. Approvers are derived automatically from the zones
          and gates this plan touches.
        </p>
      </div>

      {mode === 'draw' && <DraftForm />}

      <div className="card">
        <h3>
          Conflicts <span className="count">{conflicts.length}</span>
        </h3>
        {conflicts.length === 0 && <p className="ok">No conflicts. ✓</p>}
        {conflicts.map((c) => (
          <button
            key={c.id}
            className={`conflict-item ${c.blocking ? 'blocking' : ''}`}
            onClick={() => setPlayhead(c.t0)}
          >
            <b>{resourceById(scene, c.resourceId)?.name ?? c.resourceId}</b> · {fmtTime(c.t0)}–
            {fmtTime(c.t1)}
            <br />
            <span className="muted">
              {moveName(c.moveAId)} × {moveName(c.moveBId)}
            </span>
            <span className={`chip ${c.blocking ? 'chip-red' : 'chip-amber'}`}>
              {c.blocking ? 'blocking' : 'warning'}
            </span>
          </button>
        ))}
        {blocking.length > 0 && (
          <p className="muted">
            Resolve blocking conflicts (drag a bar on the timeline) to enable approvals.
          </p>
        )}
      </div>

      <div className="card">
        <h3>Approvals</h3>
        <p className="muted small">Prototype note: you act as every reviewer here.</p>
        {approverTeamIds.map((id) => {
          const team = teamById(scene, id);
          const approved = approvals[id] === 'approved';
          return (
            <div className="row space-between approver" key={id}>
              <span>
                <i className="swatch" style={{ background: team?.color }} /> {team?.name}
              </span>
              {approved ? (
                <span className="chip chip-green">approved</span>
              ) : (
                <button disabled={blocking.length > 0 || published} onClick={() => approve(id)}>
                  Approve
                </button>
              )}
            </div>
          );
        })}
        <button className="primary publish" disabled={!allApproved || published} onClick={publish}>
          {published ? 'Published ✓' : 'Publish plan'}
        </button>
        {published && (
          <p className="muted small">
            Next (per plan §5.6): export this as a training video / briefing pack.
          </p>
        )}
      </div>

      <div className="card">
        <h3>Moves</h3>
        {moves.map((m) => {
          const team = teamById(scene, m.teamId);
          return (
            <div
              key={m.id}
              className={`move-item ${m.id === selectedMoveId ? 'selected' : ''}`}
              onClick={() => {
                selectMove(m.id);
                setPlayhead(m.tStart);
              }}
            >
              <i className="swatch" style={{ background: team?.color }} />
              <span className="grow">{m.name}</span>
              <span className="muted">
                {fmtTime(m.tStart)}–{fmtTime(m.tEnd)}
              </span>
              <button
                className="danger small"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteMove(m.id);
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
