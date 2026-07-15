// Domain model — the semantic layer. No rendering concerns here.
// See PRODUCT_PLAN.md §4.

export interface Vec2 {
  x: number;
  z: number;
}

/** Axis-aligned footprint on the ground plane (min corner + size). */
export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface Team {
  id: string;
  name: string;
  color: string;
}

export type ResourceKind = 'zone' | 'connector';

/** A zone or connector: the unit of ownership and reservation. */
export interface Resource {
  id: string;
  name: string;
  kind: ResourceKind;
  rect: Rect;
  ownerTeamIds: string[];
  /** Optional semantic tags (e.g. 'clean', 'sterile') consumed by the rules engine. */
  tags?: string[];
}

export type ActorKind = 'cohort' | 'staff' | 'vehicle' | 'material';

/** The atomic planning unit: actor + path + time window. Times in minutes-of-day. */
export interface Move {
  id: string;
  name: string;
  actorKind: ActorKind;
  count: number;
  teamId: string; // executing team
  path: Vec2[];
  tStart: number;
  tEnd: number;
}

/** Derived claim: (resource × time window) computed from a move's path. */
export interface Reservation {
  resourceId: string;
  moveId: string;
  t0: number;
  t1: number;
}

export interface Conflict {
  id: string;
  resourceId: string;
  moveAId: string;
  moveBId: string;
  t0: number;
  t1: number;
  blocking: boolean;
}

export type ApprovalStatus = 'pending' | 'approved';

/**
 * A complete scene definition: the spatial + organizational context a plan
 * runs against. Data, not globals — the app must support many scenes (plan §4.1).
 */
export interface SceneDef {
  id: string;
  name: string;
  teams: Team[];
  resources: Resource[];
  authorTeamId: string;
  dayStart: number;
  dayEnd: number;
}
