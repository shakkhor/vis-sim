import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useVisSim } from '../state/store';
import { resourceById, teamById } from '../domain/scene';
import { fmtTime } from '../domain/engine';
import { generateBriefingHtml } from '../export/briefing';
import { SCENES } from '../domain/scenes';
import ConfirmDialog from './ConfirmDialog';
import { Icon } from './icons';
import type {
  ActorKind,
  BlockKind,
  Conflict,
  Move,
  Reservation,
  Rule,
  RuleViolation,
  SceneDef,
  UnidirectionalRule,
} from '../domain/types';

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

/** Shared commit-on-Enter behavior for commit-on-blur inputs. */
function blurOnEnter(e: KeyboardEvent<HTMLInputElement>): void {
  if (e.key === 'Enter') e.currentTarget.blur();
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

/** Lowercased, hyphen-separated team id derived from a display name. */
function slugifyTeamId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Why `teamId` cannot be removed from the scene right now, or null if it can. */
function removalBlocker(scene: SceneDef, moves: Move[], teamId: string): string | null {
  if (teamId === scene.authorTeamId) return 'the authoring team cannot be removed';
  const owned = scene.resources.find(
    (r) => r.ownerTeamIds.length === 1 && r.ownerTeamIds[0] === teamId,
  );
  if (owned) return `sole owner of ${owned.name} — reassign it first`;
  const move = moves.find((m) => m.teamId === teamId);
  if (move) return `executes ${move.name} — reassign or delete that move first`;
  return null;
}

function SceneCard() {
  const scene = useVisSim((s) => s.scene);
  const moves = useVisSim((s) => s.moves);
  const renameActiveScene = useVisSim((s) => s.renameActiveScene);
  const addTeamToScene = useVisSim((s) => s.addTeamToScene);
  const updateTeamInScene = useVisSim((s) => s.updateTeamInScene);
  const removeTeamFromScene = useVisSim((s) => s.removeTeamFromScene);
  const deleteCustomScene = useVisSim((s) => s.deleteCustomScene);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('#4f8ef7');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isCustom = !SCENES.some((entry) => entry.scene.id === scene.id);

  const commitRename = (raw: string) => {
    const name = raw.trim();
    if (name && name !== scene.name) renameActiveScene(name);
  };

  const addTeam = () => {
    const name = newTeamName.trim();
    if (!name) return;
    const base = slugifyTeamId(name) || 'team';
    let id = base;
    let n = 2;
    while (scene.teams.some((t) => t.id === id)) id = `${base}-${n++}`;
    addTeamToScene({ id, name, color: newTeamColor });
    setNewTeamName('');
  };

  return (
    <div className="card">
      <h3>Scene</h3>
      <label>
        Name{' '}
        <input
          key={scene.id}
          defaultValue={scene.name}
          onBlur={(e) => commitRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      </label>
      <p className="muted small">Teams (own resources, execute moves, grant approvals):</p>
      {scene.teams.map((t) => {
        const blocker = removalBlocker(scene, moves, t.id);
        return (
          <div className="row" key={t.id}>
            <input
              type="color"
              value={t.color}
              title={`${t.name} color`}
              aria-label={`${t.name} color`}
              onChange={(e) => updateTeamInScene(t.id, { color: e.target.value })}
            />
            <input
              className="grow"
              defaultValue={t.name}
              aria-label={`${t.name} name`}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== t.name) updateTeamInScene(t.id, { name });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
            <button
              className="danger small"
              disabled={blocker !== null}
              title={blocker ? `Cannot remove: ${blocker}` : `Remove ${t.name}`}
              onClick={() => removeTeamFromScene(t.id)}
            >
              ✕
            </button>
          </div>
        );
      })}
      <div className="row">
        <input
          type="color"
          value={newTeamColor}
          title="New team color"
          aria-label="New team color"
          onChange={(e) => setNewTeamColor(e.target.value)}
        />
        <input
          className="grow"
          placeholder="New team name"
          value={newTeamName}
          onChange={(e) => setNewTeamName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addTeam();
          }}
        />
        <button disabled={!newTeamName.trim()} onClick={addTeam}>
          Add
        </button>
      </div>
      {isCustom && (
        <div className="row">
          <button className="danger" onClick={() => setConfirmingDelete(true)}>
            Delete scene
          </button>
        </div>
      )}
      <ConfirmDialog
        open={confirmingDelete}
        title="Delete scene"
        body={`Delete scene "${scene.name}" and its plan? This cannot be undone.`}
        confirmLabel="Delete scene"
        onConfirm={() => {
          setConfirmingDelete(false);
          deleteCustomScene(scene.id);
        }}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}

/** Next unused `rule-${n}` id (existing scenes may already use this scheme). */
function nextRuleId(rules: Rule[]): string {
  let n = rules.length + 1;
  while (rules.some((r) => r.id === `rule-${n}`)) n++;
  return `rule-${n}`;
}

const ACTOR_KIND_OPTIONS: { value: ActorKind; label: string }[] = [
  { value: 'cohort', label: 'Spectator cohort' },
  { value: 'staff', label: 'Staff' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'material', label: 'Material' },
];

const DIRECTION_OPTIONS: { value: UnidirectionalRule['direction']; label: string }[] = [
  { value: '+x', label: '+x (east)' },
  { value: '-x', label: '-x (west)' },
  { value: '+z', label: '+z (south)' },
  { value: '-z', label: '-z (north)' },
];

function RulesCard() {
  const scene = useVisSim((s) => s.scene);
  const setSceneRules = useVisSim((s) => s.setSceneRules);
  const rules = scene.rules ?? [];

  const [kind, setKind] = useState<Rule['kind']>('forbidden-entry');
  const [description, setDescription] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [actorKinds, setActorKinds] = useState<ActorKind[]>([]);
  const [teamIdsA, setTeamIdsA] = useState<string[]>([]);
  const [teamIdsB, setTeamIdsB] = useState<string[]>([]);
  const [direction, setDirection] = useState<UnidirectionalRule['direction']>('+x');

  const resourceTags = tagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const valid =
    description.trim().length > 0 &&
    resourceTags.length > 0 &&
    (kind === 'forbidden-entry'
      ? actorKinds.length > 0
      : kind === 'separation'
        ? teamIdsA.length > 0 && teamIdsB.length > 0
        : true);

  const toggleActorKind = (value: ActorKind) =>
    setActorKinds((prev) =>
      prev.includes(value) ? prev.filter((k) => k !== value) : [...prev, value],
    );

  const selectedIds = (options: HTMLSelectElement['selectedOptions']) =>
    Array.from(options, (o) => o.value);

  const addRule = () => {
    if (!valid) return;
    const base = { id: nextRuleId(rules), description: description.trim(), resourceTags };
    const rule: Rule =
      kind === 'forbidden-entry'
        ? { ...base, kind, actorKinds }
        : kind === 'separation'
          ? { ...base, kind, teamIdsA, teamIdsB }
          : { ...base, kind, direction };
    setSceneRules([...rules, rule]);
    setDescription('');
    setTagsRaw('');
    setActorKinds([]);
    setTeamIdsA([]);
    setTeamIdsB([]);
  };

  const teamSelect = (label: string, value: string[], onChange: (ids: string[]) => void) => (
    <label>
      {label}{' '}
      <select
        multiple
        size={Math.min(Math.max(scene.teams.length, 2), 4)}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(selectedIds(e.target.selectedOptions))}
      >
        {scene.teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="card">
      <h3>
        Rules <span className="count">{rules.length}</span>
      </h3>
      {rules.length === 0 && (
        <p className="muted small">No rules. Rules constrain moves via resource tags.</p>
      )}
      {rules.map((r) => (
        <div className="rule-item" key={r.id}>
          <span className="chip chip-neutral">{r.kind}</span>
          <span className="rule-desc">{r.description}</span>
          <button
            className="danger small"
            title={`Remove rule: ${r.description}`}
            onClick={() => setSceneRules(rules.filter((existing) => existing.id !== r.id))}
          >
            ✕
          </button>
        </div>
      ))}
      <p className="muted small">Add rule:</p>
      <label>
        Kind{' '}
        <select value={kind} onChange={(e) => setKind(e.target.value as Rule['kind'])}>
          <option value="forbidden-entry">Forbidden entry</option>
          <option value="separation">Separation</option>
          <option value="unidirectional">Unidirectional</option>
        </select>
      </label>
      {kind === 'forbidden-entry' && (
        <>
          <p className="muted small">Actors barred from tagged resources:</p>
          {ACTOR_KIND_OPTIONS.map((opt) => (
            <label className="row" key={opt.value}>
              <input
                type="checkbox"
                checked={actorKinds.includes(opt.value)}
                onChange={() => toggleActorKind(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </>
      )}
      {kind === 'separation' && (
        <>
          {teamSelect('Side A teams', teamIdsA, setTeamIdsA)}
          {teamSelect('Side B teams', teamIdsB, setTeamIdsB)}
        </>
      )}
      {kind === 'unidirectional' && (
        <label>
          Direction{' '}
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as UnidirectionalRule['direction'])}
          >
            {DIRECTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Resource tags{' '}
        <input
          value={tagsRaw}
          placeholder="comma, separated"
          onChange={(e) => setTagsRaw(e.target.value)}
        />
      </label>
      <label>
        Description{' '}
        <input
          value={description}
          placeholder="Shown on violations"
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="row">
        <button disabled={!valid} onClick={addRule}>
          Add rule
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
  // Track *which* resource is pending deletion so a selection change while the
  // dialog is open can never delete the newly selected resource by accident.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

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

  const affected = [
    ...new Set(reservations.filter((r) => r.resourceId === resource.id).map((r) => r.moveId)),
  ].map((id) => moves.find((m) => m.id === id)?.name ?? id);
  const deleteBody =
    affected.length === 0
      ? `Delete ${resource.name}?`
      : `${affected.length} move${affected.length === 1 ? '' : 's'} reserve ${resource.name}:\n` +
        `${affected.join(', ')}\n\n` +
        'Deleting it will recompute conflicts and approvers. Continue?';

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
        <button className="danger" onClick={() => setConfirmingId(resource.id)}>
          Delete {resource.kind}
        </button>
      </div>
      <p className="muted small">Scene edits reset approvals (rev {revision}).</p>
      <ConfirmDialog
        open={confirmingId === resource.id}
        title={`Delete ${resource.kind}`}
        body={deleteBody}
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmingId(null);
          removeResource(resource.id);
        }}
        onCancel={() => setConfirmingId(null)}
      />
    </div>
  );
}

const BLOCK_KINDS: { value: BlockKind; label: string }[] = [
  { value: 'wall', label: 'Wall' },
  { value: 'pillar', label: 'Pillar' },
  { value: 'box', label: 'Box' },
  { value: 'slab', label: 'Slab' },
];

/** Renderer defaults per kind, mirrored so the color input always has a value. */
const BLOCK_FALLBACK_COLOR: Record<BlockKind, string> = {
  wall: '#8892aa',
  pillar: '#8892aa',
  box: '#46506e',
  slab: '#46506e',
};

function BlockInspector() {
  const scene = useVisSim((s) => s.scene);
  const selectedBlockId = useVisSim((s) => s.selectedBlockId);
  const updateBlockMeta = useVisSim((s) => s.updateBlockMeta);
  const removeBlock = useVisSim((s) => s.removeBlock);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const block = selectedBlockId
    ? (scene.blocks ?? []).find((b) => b.id === selectedBlockId)
    : undefined;
  if (!block) return null;

  const commitNumber = (raw: string, apply: (v: number) => void) => {
    const v = Number(raw);
    if (Number.isFinite(v)) apply(v);
  };

  return (
    <div className="card">
      <h3>Block</h3>
      <label>
        Kind{' '}
        <select
          value={block.kind}
          onChange={(e) => updateBlockMeta(block.id, { kind: e.target.value as BlockKind })}
        >
          {BLOCK_KINDS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Height{' '}
        <input
          key={`${block.id}-height`}
          type="number"
          min={0.1}
          step={0.5}
          defaultValue={block.height}
          onBlur={(e) =>
            commitNumber(e.target.value, (height) => {
              if (height > 0) updateBlockMeta(block.id, { height });
            })
          }
          onKeyDown={blurOnEnter}
        />
      </label>
      <label>
        Elevation{' '}
        <input
          key={`${block.id}-y`}
          type="number"
          step={0.5}
          defaultValue={block.y ?? 0}
          onBlur={(e) => commitNumber(e.target.value, (y) => updateBlockMeta(block.id, { y }))}
          onKeyDown={blurOnEnter}
        />
      </label>
      <label>
        Color{' '}
        <input
          type="color"
          value={block.color ?? BLOCK_FALLBACK_COLOR[block.kind]}
          onChange={(e) => updateBlockMeta(block.id, { color: e.target.value })}
        />
      </label>
      <p className="muted">
        <span className="chip">{block.kind}</span> ({block.rect.x}, {block.rect.z}) · {block.rect.w}
        ×{block.rect.d}
      </p>
      <div className="row">
        <button className="danger" onClick={() => setConfirmingId(block.id)}>
          Delete block
        </button>
      </div>
      <p className="muted small">Blocks are visual context only — never reservable.</p>
      <ConfirmDialog
        open={confirmingId === block.id}
        title="Delete block"
        body={`Delete this ${block.kind}? Blocks are visual context only, so no moves are affected.`}
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmingId(null);
          removeBlock(block.id);
        }}
        onCancel={() => setConfirmingId(null)}
      />
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
  const focusTeamId = useVisSim((s) => s.focusTeamId);
  const setFocusTeam = useVisSim((s) => s.setFocusTeam);

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
  const focusedTeam = focusTeamId ? teamById(scene, focusTeamId) : undefined;

  /** Eye toggle: per-team perspective playback (plan §5.4). Click again to exit. */
  const focusButton = (teamId: string) => {
    const active = focusTeamId === teamId;
    const name = teamById(scene, teamId)?.name ?? teamId;
    const label = active ? 'Exit team view' : `View as ${name}`;
    return (
      <button
        className={`icon-btn ${active ? 'active' : ''}`}
        title={label}
        aria-label={label}
        aria-pressed={active}
        onClick={() => setFocusTeam(active ? null : teamId)}
      >
        <Icon name="eye" size={14} />
      </button>
    );
  };

  return (
    <div className="side-panel">
      {focusTeamId && (
        <div className="focus-banner">
          <i className="swatch" style={{ background: focusedTeam?.color }} />
          <span className="grow">
            Viewing as <b>{focusedTeam?.name ?? focusTeamId}</b>
          </span>
          <button onClick={() => setFocusTeam(null)}>Exit view</button>
        </div>
      )}
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
      {mode === 'scene' && <SceneCard />}
      {mode === 'scene' && <RulesCard />}
      {mode === 'scene' && <Inspector reservations={reservations} />}
      {mode === 'scene' && <BlockInspector />}

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
        <div className="row space-between approver">
          <span>
            <i className="swatch" style={{ background: authorTeam?.color }} /> {authorTeam?.name}
          </span>
          <span className="row">
            {focusButton(scene.authorTeamId)}
            <span className="chip chip-neutral">author</span>
          </span>
        </div>
        {approverTeamIds.map((id) => {
          const team = teamById(scene, id);
          const approved = approvals[id] === 'approved';
          return (
            <div className="row space-between approver" key={id}>
              <span>
                <i className="swatch" style={{ background: team?.color }} /> {team?.name}
              </span>
              <span className="row">
                {focusButton(id)}
                {approved ? (
                  <span className="chip chip-green">approved</span>
                ) : (
                  <button disabled={approvalsGated || published} onClick={() => approve(id)}>
                    Approve
                  </button>
                )}
              </span>
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
