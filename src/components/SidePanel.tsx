import { useState } from 'react';
import { useVisSim } from '../state/store';
import { resourceById, teamById } from '../domain/scene';
import { fmtTime } from '../domain/engine';
import { generateBriefingHtml } from '../export/briefing';
import type { ActorKind, Conflict, Reservation, RuleViolation } from '../domain/types';

interface Props {
  reservations: Reservation[];
  conflicts: Conflict[];
  approverTeamIds: string[];
  violations: RuleViolation[];
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

function Inspector({ reservations }: { reservations: Reservation[] }) {
  const scene = useVisSim((s) => s.scene);
  const moves = useVisSim((s) => s.moves);
  const revision = useVisSim((s) => s.revision);
  const selectedResourceId = useVisSim((s) => s.selectedResourceId);
  const updateResourceMeta = useVisSim((s) => s.updateResourceMeta);
  const removeResource = useVisSim((s) => s.removeResource);

  const resource = selectedResourceId ? resourceById(scene, selectedResourceId) : undefined;
  if (!resource) return null;

  const toggleOwner = (teamId: string) => {
    const owners = resource.ownerTeamIds.includes(teamId)
      ? resource.ownerTeamIds.filter((id) => id !== teamId)
      : [...resource.ownerTeamIds, teamId];
    if (owners.length === 0) return; // at least one owner required
    updateResourceMeta(resource.id, { ownerTeamIds: owners });
  };

  const commitTags = (raw: string) =>
    updateResourceMeta(resource.id, {
      tags: raw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });

  const onDelete = () => {
    const affected = [
      ...new Set(reservations.filter((r) => r.resourceId === resource.id).map((r) => r.moveId)),
    ].map((id) => moves.find((m) => m.id === id)?.name ?? id);
    const message =
      affected.length === 0
        ? `Delete ${resource.name}?`
        : `${affected.length} move${affected.length === 1 ? '' : 's'} reserve ${resource.name}:\n` +
          `${affected.join(', ')}\n\n` +
          'Deleting it will recompute conflicts and approvers. Continue?';
    if (window.confirm(message)) removeResource(resource.id);
  };

  return (
    <div className="card">
      <h3>Inspector</h3>
      <label>
        Name{' '}
        <input
          value={resource.name}
          onChange={(e) => updateResourceMeta(resource.id, { name: e.target.value })}
        />
      </label>
      <p className="muted">
        <span className="chip">{resource.kind}</span> ({resource.rect.x}, {resource.rect.z}) ·{' '}
        {resource.rect.w}×{resource.rect.d}
      </p>
      <p className="muted small">Owner teams (at least one required):</p>
      {scene.teams.map((t) => {
        const checked = resource.ownerTeamIds.includes(t.id);
        return (
          <label className="row" key={t.id}>
            <input
              type="checkbox"
              checked={checked}
              disabled={checked && resource.ownerTeamIds.length === 1}
              onChange={() => toggleOwner(t.id)}
            />
            <i className="swatch" style={{ background: t.color }} /> {t.name}
          </label>
        );
      })}
      <label>
        Tags{' '}
        <input
          key={resource.id}
          defaultValue={(resource.tags ?? []).join(', ')}
          placeholder="comma, separated"
          onBlur={(e) => commitTags(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      </label>
      <div className="row">
        <button className="danger" onClick={onDelete}>
          Delete {resource.kind}
        </button>
      </div>
      <p className="muted small">Scene edits reset approvals (rev {revision}).</p>
    </div>
  );
}

export default function SidePanel({ reservations, conflicts, approverTeamIds, violations }: Props) {
  const scene = useVisSim((s) => s.scene);
  const planName = useVisSim((s) => s.planName);
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
  const approvalsGated = blocking.length > 0 || violations.length > 0;
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
          <h2>{planName}</h2>
          <span
            className={`chip ${published ? 'chip-green' : approvalsGated ? 'chip-red' : 'chip-amber'}`}
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
      {mode === 'scene' && <Inspector reservations={reservations} />}

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
        <h3>
          Rule violations <span className="count">{violations.length}</span>
        </h3>
        {violations.length === 0 && <p className="ok">No rule violations. ✓</p>}
        {violations.map((v) => {
          const rule = scene.rules?.find((r) => r.id === v.ruleId);
          return (
            <button
              key={`${v.ruleId}-${v.moveId}-${v.resourceId}-${v.t0}`}
              className="conflict-item blocking"
              onClick={() => setPlayhead(v.t0)}
            >
              <b>{rule?.description ?? v.ruleId}</b> · {fmtTime(v.t0)}–{fmtTime(v.t1)}
              <br />
              <span className="muted">
                {moveName(v.moveId)} · {resourceById(scene, v.resourceId)?.name ?? v.resourceId}
              </span>
              <span className="chip chip-red">blocking</span>
            </button>
          );
        })}
        {violations.length > 0 && (
          <p className="muted">
            Rule violations block approvals — reroute or retime the offending moves.
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
                <button disabled={approvalsGated || published} onClick={() => approve(id)}>
                  Approve
                </button>
              )}
            </div>
          );
        })}
        <div className="row">
          <button
            className="primary publish"
            disabled={!allApproved || published}
            onClick={publish}
          >
            {published ? 'Published ✓' : 'Publish plan'}
          </button>
          <button
            disabled={!published}
            onClick={() => {
              const html = generateBriefingHtml(scene, moves, planName);
              const win = window.open('', '_blank');
              if (!win) return; // popup blocked
              win.document.write(html);
              win.document.close();
            }}
          >
            Briefing pack
          </button>
        </div>
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
