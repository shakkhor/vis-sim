// Versioned JSON serialization for plans + scenes. Pure data in/out — no app state,
// no rendering concerns. Validation is hand-rolled (no schema dependency) and reports
// the first offending field path via SerializationError.
import type { ActorKind, Move, Rect, Resource, ResourceKind, SceneDef, Team, Vec2 } from './types';

export const PLAN_FORMAT_VERSION = 1 as const;

export interface PlanDocumentMeta {
  name: string;
  exportedAt: string;
}

/** The on-disk / on-wire envelope for a plan and the scene it runs against. */
export interface PlanDocument {
  formatVersion: typeof PLAN_FORMAT_VERSION;
  scene: SceneDef;
  moves: Move[];
  meta: PlanDocumentMeta;
}

/** Thrown by deserializePlan; the message names the first offending field path. */
export class SerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SerializationError';
  }
}

const ACTOR_KINDS: readonly ActorKind[] = ['cohort', 'staff', 'vehicle', 'material'];
const RESOURCE_KINDS: readonly ResourceKind[] = ['zone', 'connector'];

export function serializePlan(doc: PlanDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function deserializePlan(json: string): PlanDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    throw new SerializationError(`document: invalid JSON (${(error as Error).message})`);
  }

  const root = asRecord(raw, 'document');
  checkFormatVersion(root.formatVersion);

  const meta = parseMeta(root.meta);
  const scene = parseScene(root.scene);
  const teamIds = new Set(scene.teams.map((team) => team.id));
  checkTeamRef(scene.authorTeamId, teamIds, 'scene.authorTeamId');
  scene.resources.forEach((resource, i) => {
    resource.ownerTeamIds.forEach((teamId, j) => {
      checkTeamRef(teamId, teamIds, `scene.resources[${i}].ownerTeamIds[${j}]`);
    });
  });

  const moves = asArray(root.moves, 'moves').map((value, i) => parseMove(value, `moves[${i}]`));
  moves.forEach((move, i) => checkTeamRef(move.teamId, teamIds, `moves[${i}].teamId`));

  return { formatVersion: PLAN_FORMAT_VERSION, scene, moves, meta };
}

// --- field parsers ---------------------------------------------------------

function checkFormatVersion(value: unknown): void {
  if (value === undefined) {
    throw new SerializationError('formatVersion: missing');
  }
  if (value === PLAN_FORMAT_VERSION) return;
  if (typeof value === 'number' && Number.isInteger(value) && value > PLAN_FORMAT_VERSION) {
    throw new SerializationError(
      `formatVersion: unsupported version ${value} — this build reads version ` +
        `${PLAN_FORMAT_VERSION}; upgrade the app to import this document`,
    );
  }
  throw new SerializationError(
    `formatVersion: expected ${PLAN_FORMAT_VERSION}, got ${JSON.stringify(value)}`,
  );
}

function parseMeta(value: unknown): PlanDocumentMeta {
  const meta = asRecord(value, 'meta');
  return {
    name: asString(meta.name, 'meta.name'),
    exportedAt: asString(meta.exportedAt, 'meta.exportedAt'),
  };
}

function parseScene(value: unknown): SceneDef {
  const scene = asRecord(value, 'scene');
  return {
    id: asString(scene.id, 'scene.id'),
    name: asString(scene.name, 'scene.name'),
    authorTeamId: asString(scene.authorTeamId, 'scene.authorTeamId'),
    dayStart: asFiniteNumber(scene.dayStart, 'scene.dayStart'),
    dayEnd: asFiniteNumber(scene.dayEnd, 'scene.dayEnd'),
    teams: asArray(scene.teams, 'scene.teams').map((team, i) =>
      parseTeam(team, `scene.teams[${i}]`),
    ),
    resources: asArray(scene.resources, 'scene.resources').map((resource, i) =>
      parseResource(resource, `scene.resources[${i}]`),
    ),
  };
}

function parseTeam(value: unknown, path: string): Team {
  const team = asRecord(value, path);
  return {
    id: asString(team.id, `${path}.id`),
    name: asString(team.name, `${path}.name`),
    color: asString(team.color, `${path}.color`),
  };
}

function parseResource(value: unknown, path: string): Resource {
  const resource = asRecord(value, path);
  const parsed: Resource = {
    id: asString(resource.id, `${path}.id`),
    name: asString(resource.name, `${path}.name`),
    kind: asOneOf(resource.kind, RESOURCE_KINDS, `${path}.kind`),
    rect: parseRect(resource.rect, `${path}.rect`),
    ownerTeamIds: asArray(resource.ownerTeamIds, `${path}.ownerTeamIds`).map((teamId, i) =>
      asString(teamId, `${path}.ownerTeamIds[${i}]`),
    ),
  };
  if (resource.tags !== undefined) {
    parsed.tags = asArray(resource.tags, `${path}.tags`).map((tag, i) =>
      asString(tag, `${path}.tags[${i}]`),
    );
  }
  return parsed;
}

function parseRect(value: unknown, path: string): Rect {
  const rect = asRecord(value, path);
  const parsed: Rect = {
    x: asFiniteNumber(rect.x, `${path}.x`),
    z: asFiniteNumber(rect.z, `${path}.z`),
    w: asFiniteNumber(rect.w, `${path}.w`),
    d: asFiniteNumber(rect.d, `${path}.d`),
  };
  if (parsed.w <= 0) {
    throw new SerializationError(`${path}.w: expected positive width, got ${parsed.w}`);
  }
  if (parsed.d <= 0) {
    throw new SerializationError(`${path}.d: expected positive depth, got ${parsed.d}`);
  }
  return parsed;
}

function parseMove(value: unknown, path: string): Move {
  const move = asRecord(value, path);
  const parsed: Move = {
    id: asString(move.id, `${path}.id`),
    name: asString(move.name, `${path}.name`),
    actorKind: asOneOf(move.actorKind, ACTOR_KINDS, `${path}.actorKind`),
    count: asFiniteNumber(move.count, `${path}.count`),
    teamId: asString(move.teamId, `${path}.teamId`),
    path: asArray(move.path, `${path}.path`).map((point, i) =>
      parseVec2(point, `${path}.path[${i}]`),
    ),
    tStart: asFiniteNumber(move.tStart, `${path}.tStart`),
    tEnd: asFiniteNumber(move.tEnd, `${path}.tEnd`),
  };
  if (parsed.path.length < 2) {
    throw new SerializationError(
      `${path}.path: expected at least 2 points, got ${parsed.path.length}`,
    );
  }
  if (parsed.tEnd <= parsed.tStart) {
    throw new SerializationError(
      `${path}.tEnd: expected value greater than tStart (${parsed.tStart}), got ${parsed.tEnd}`,
    );
  }
  return parsed;
}

function parseVec2(value: unknown, path: string): Vec2 {
  const point = asRecord(value, path);
  return {
    x: asFiniteNumber(point.x, `${path}.x`),
    z: asFiniteNumber(point.z, `${path}.z`),
  };
}

// --- primitive guards ------------------------------------------------------

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  return typeof value;
}

function fail(path: string, expected: string, value: unknown): never {
  throw new SerializationError(`${path}: expected ${expected}, got ${describeValue(value)}`);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'object', value);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'array', value);
  return value;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, 'string', value);
  return value;
}

function asFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'finite number', value);
  return value;
}

function asOneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    fail(path, `one of ${allowed.join(' | ')}`, value);
  }
  return value as T;
}

function checkTeamRef(teamId: string, teamIds: ReadonlySet<string>, path: string): void {
  if (!teamIds.has(teamId)) {
    throw new SerializationError(
      `${path}: unknown teamId '${teamId}' — known teams: ${[...teamIds].join(', ')}`,
    );
  }
}
