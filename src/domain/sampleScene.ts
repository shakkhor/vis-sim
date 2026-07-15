// Sample scene: the flagship Block C / Block D shared-gate slice (PRODUCT_PLAN.md §6).
// This is content, not code — it must stay expressible as plain data (plan §8.1).
import type { Move, SceneDef } from './types';

export const SAMPLE_SCENE: SceneDef = {
  id: 'stadium-slice',
  name: 'Stadium — Gate 7 slice',
  authorTeamId: 'blockD',
  dayStart: 720, // 12:00
  dayEnd: 960, // 16:00
  teams: [
    { id: 'blockD', name: 'Block D Ops', color: '#4f8ef7' },
    { id: 'blockC', name: 'Block C Ops', color: '#2fbfa3' },
    { id: 'fnb', name: 'F&B Logistics', color: '#f2a03d' },
    { id: 'security', name: 'Security', color: '#a06df2' },
  ],
  resources: [
    {
      id: 'plaza',
      name: 'South Plaza',
      kind: 'zone',
      rect: { x: -30, z: 14, w: 60, d: 20 },
      ownerTeamIds: ['security'],
    },
    {
      id: 'gate7',
      name: 'Gate 7',
      kind: 'connector',
      rect: { x: -4, z: 8, w: 8, d: 6 },
      ownerTeamIds: ['blockC', 'blockD'],
    },
    {
      id: 'dconc',
      name: 'Block D Concourse',
      kind: 'zone',
      rect: { x: 2, z: -8, w: 28, d: 16 },
      ownerTeamIds: ['blockD'],
    },
    {
      id: 'cconc',
      name: 'Block C Concourse',
      kind: 'zone',
      rect: { x: -30, z: -8, w: 28, d: 16 },
      ownerTeamIds: ['blockC'],
    },
    {
      id: 'fnbstore',
      name: 'F&B Store',
      kind: 'zone',
      rect: { x: -44, z: 6, w: 12, d: 10 },
      ownerTeamIds: ['fnb'],
    },
    {
      id: 'kioskd',
      name: 'Kiosk D',
      kind: 'zone',
      rect: { x: 32, z: 6, w: 12, d: 10 },
      ownerTeamIds: ['fnb'],
    },
  ],
  blocks: [
    // Gate 7 structure — the previously hardcoded viewport pillars/lintel, now data.
    // Pillars sit flush against the connector edges (x ±4..±5) so the gate stays open.
    {
      id: 'blk-gate-pillar-w',
      kind: 'pillar',
      rect: { x: -5, z: 8, w: 1, d: 6 },
      height: 5,
      color: '#5a6478',
    },
    {
      id: 'blk-gate-pillar-e',
      kind: 'pillar',
      rect: { x: 4, z: 8, w: 1, d: 6 },
      height: 5,
      color: '#5a6478',
    },
    {
      // Elevated slab spanning the gate: its footprint covers Gate 7 but it floats at y 4.8,
      // well above head height, so the connector underneath stays walkable.
      id: 'blk-gate-lintel',
      kind: 'slab',
      rect: { x: -5, z: 8, w: 10, d: 6 },
      height: 0.8,
      y: 4.8,
      color: '#5a6478',
    },
    // Stepped stand rows behind the Block D concourse (row tops climb 1.5 → 6).
    {
      id: 'blk-stand-d-1',
      kind: 'box',
      rect: { x: 2, z: -11.75, w: 28, d: 2.5 },
      height: 1.5,
      color: '#46506e',
    },
    {
      id: 'blk-stand-d-2',
      kind: 'box',
      rect: { x: 2, z: -14.25, w: 28, d: 2.5 },
      height: 1.5,
      y: 1.5,
      color: '#3d4660',
    },
    {
      id: 'blk-stand-d-3',
      kind: 'box',
      rect: { x: 2, z: -16.75, w: 28, d: 2.5 },
      height: 1.5,
      y: 3,
      color: '#46506e',
    },
    {
      id: 'blk-stand-d-4',
      kind: 'box',
      rect: { x: 2, z: -19.25, w: 28, d: 2.5 },
      height: 1.5,
      y: 4.5,
      color: '#3d4660',
    },
    // Stepped stand rows behind the Block C concourse.
    {
      id: 'blk-stand-c-1',
      kind: 'box',
      rect: { x: -30, z: -11.75, w: 28, d: 2.5 },
      height: 1.5,
      color: '#46506e',
    },
    {
      id: 'blk-stand-c-2',
      kind: 'box',
      rect: { x: -30, z: -14.25, w: 28, d: 2.5 },
      height: 1.5,
      y: 1.5,
      color: '#3d4660',
    },
    {
      id: 'blk-stand-c-3',
      kind: 'box',
      rect: { x: -30, z: -16.75, w: 28, d: 2.5 },
      height: 1.5,
      y: 3,
      color: '#46506e',
    },
    {
      id: 'blk-stand-c-4',
      kind: 'box',
      rect: { x: -30, z: -19.25, w: 28, d: 2.5 },
      height: 1.5,
      y: 4.5,
      color: '#3d4660',
    },
    // The pitch, beyond the stands.
    {
      id: 'blk-pitch',
      kind: 'slab',
      rect: { x: -35, z: -43, w: 70, d: 22 },
      height: 0.1,
      color: '#2e7d4f',
    },
  ],
};

export const INITIAL_MOVES: Move[] = [
  {
    id: 'ingressD',
    name: 'Block D ingress — spectators',
    actorKind: 'cohort',
    count: 4000,
    teamId: 'blockD',
    path: [
      { x: 12, z: 28 },
      { x: 4, z: 18 },
      { x: 0, z: 11 },
      { x: 6, z: 4 },
      { x: 18, z: 0 },
    ],
    tStart: 780, // 13:00
    tEnd: 885, // 14:45
  },
  {
    id: 'fnbRestock',
    name: 'F&B restock — cart to Kiosk D',
    actorKind: 'vehicle',
    count: 1,
    teamId: 'fnb',
    path: [
      { x: -38, z: 11 },
      { x: -12, z: 11 },
      { x: 0, z: 11 },
      { x: 20, z: 11 },
      { x: 36, z: 10 },
    ],
    tStart: 820, // 13:40 — crosses Gate 7 while ingress occupies it → blocking conflict
    tEnd: 850, // 14:10
  },
  {
    id: 'secSweep',
    name: 'Security sweep — plaza',
    actorKind: 'staff',
    count: 6,
    teamId: 'security',
    path: [
      { x: -24, z: 18 },
      { x: -24, z: 30 },
      { x: 24, z: 30 },
      { x: 24, z: 18 },
      { x: 0, z: 16 },
    ],
    tStart: 750, // 12:30
    tEnd: 800, // 13:20
  },
];
