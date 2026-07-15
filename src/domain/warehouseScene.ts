// Warehouse scene: a dock/racking slice from the warehouse vertical (PRODUCT_PLAN.md §3).
// Second scene proving the core is domain-agnostic — pure data, no code changes (plan §8.1).
import type { Move, SceneDef } from './types';

export const WAREHOUSE_SCENE: SceneDef = {
  id: 'warehouse-slice',
  name: 'Warehouse — Aisle mouth slice',
  authorTeamId: 'inbound',
  dayStart: 480, // 08:00
  dayEnd: 720, // 12:00
  teams: [
    { id: 'inbound', name: 'Inbound Ops', color: '#4f8ef7' },
    { id: 'outbound', name: 'Outbound Ops', color: '#f2a03d' },
    { id: 'safety', name: 'Safety', color: '#e05d5d' },
    { id: 'maintenance', name: 'Maintenance', color: '#a06df2' },
  ],
  resources: [
    {
      id: 'dock1',
      name: 'Dock 1 — Inbound',
      kind: 'zone',
      rect: { x: -44, z: 26, w: 26, d: 12 },
      ownerTeamIds: ['inbound'],
    },
    {
      id: 'dock2',
      name: 'Dock 2 — Outbound',
      kind: 'zone',
      rect: { x: 18, z: 26, w: 26, d: 12 },
      ownerTeamIds: ['outbound'],
    },
    {
      id: 'staging',
      name: 'Staging Zone',
      kind: 'zone',
      rect: { x: -12, z: 26, w: 24, d: 12 },
      ownerTeamIds: ['inbound'],
    },
    {
      id: 'aisleMouth',
      name: 'Aisle Mouth',
      kind: 'connector',
      rect: { x: -5, z: 16, w: 10, d: 8 },
      ownerTeamIds: ['inbound', 'outbound'],
    },
    {
      id: 'racking',
      name: 'Racking Aisle',
      kind: 'zone',
      rect: { x: -40, z: -6, w: 80, d: 18 },
      ownerTeamIds: ['maintenance'],
    },
    {
      id: 'walkway',
      name: 'Pedestrian Walkway',
      kind: 'zone',
      rect: { x: -44, z: -18, w: 88, d: 6 },
      ownerTeamIds: ['safety'],
      tags: ['pedestrian-only'],
    },
  ],
  blocks: [
    // Racking runs — two double-segment rows flanking the drive aisle inside the racking
    // zone. The north row breaks at x −6..6 so forklifts turning in from the aisle mouth
    // (which they cross at x 0) read as driving through a real rack-end gap.
    {
      id: 'blk-rack-south-w',
      kind: 'box',
      rect: { x: -38, z: -5, w: 34, d: 2.5 },
      height: 6,
      color: '#a86a2f',
    },
    {
      id: 'blk-rack-south-e',
      kind: 'box',
      rect: { x: 4, z: -5, w: 34, d: 2.5 },
      height: 6,
      color: '#a86a2f',
    },
    {
      id: 'blk-rack-north-w',
      kind: 'box',
      rect: { x: -38, z: 9, w: 32, d: 2.5 },
      height: 6,
      color: '#a86a2f',
    },
    {
      id: 'blk-rack-north-e',
      kind: 'box',
      rect: { x: 6, z: 9, w: 32, d: 2.5 },
      height: 6,
      color: '#a86a2f',
    },
    // Dock canopies — elevated slabs over each dock apron.
    {
      id: 'blk-dock1-canopy',
      kind: 'slab',
      rect: { x: -44, z: 26, w: 26, d: 12 },
      height: 0.4,
      y: 3.6,
      color: '#3a4258',
    },
    {
      id: 'blk-dock2-canopy',
      kind: 'slab',
      rect: { x: 18, z: 26, w: 26, d: 12 },
      height: 0.4,
      y: 3.6,
      color: '#3a4258',
    },
    // Perimeter walls around the overall footprint. The north wall leaves dock-door gaps
    // at x −40..−22 (Dock 1) and x 22..40 (Dock 2).
    {
      id: 'blk-wall-south',
      kind: 'wall',
      rect: { x: -46, z: -20, w: 92, d: 1 },
      height: 4,
      color: '#6b7386',
    },
    {
      id: 'blk-wall-west',
      kind: 'wall',
      rect: { x: -46, z: -19, w: 1, d: 58 },
      height: 4,
      color: '#6b7386',
    },
    {
      id: 'blk-wall-east',
      kind: 'wall',
      rect: { x: 45, z: -19, w: 1, d: 58 },
      height: 4,
      color: '#6b7386',
    },
    {
      id: 'blk-wall-north-w',
      kind: 'wall',
      rect: { x: -46, z: 39, w: 6, d: 1 },
      height: 4,
      color: '#6b7386',
    },
    {
      id: 'blk-wall-north-mid',
      kind: 'wall',
      rect: { x: -22, z: 39, w: 44, d: 1 },
      height: 4,
      color: '#6b7386',
    },
    {
      id: 'blk-wall-north-e',
      kind: 'wall',
      rect: { x: 40, z: 39, w: 6, d: 1 },
      height: 4,
      color: '#6b7386',
    },
  ],
  rules: [
    {
      id: 'warehouse-no-vehicles-on-walkway',
      description: "Vehicles may never enter zones tagged 'pedestrian-only'",
      kind: 'forbidden-entry',
      actorKinds: ['vehicle'],
      resourceTags: ['pedestrian-only'],
    },
  ],
};

export const WAREHOUSE_MOVES: Move[] = [
  {
    id: 'putaway',
    name: 'Putaway run — forklift, Dock 1 to racking',
    actorKind: 'vehicle',
    count: 1,
    teamId: 'inbound',
    path: [
      { x: -30, z: 32 },
      { x: -2, z: 30 },
      { x: 0, z: 20 },
      { x: 0, z: 8 },
      { x: 28, z: 2 },
    ],
    tStart: 540, // 09:00
    tEnd: 600, // 10:00 — holds the aisle mouth ~09:26–09:32
  },
  {
    id: 'picking',
    name: 'Picking run — forklift, racking to Dock 2',
    actorKind: 'vehicle',
    count: 1,
    teamId: 'outbound',
    path: [
      { x: -25, z: 4 },
      { x: 0, z: 6 },
      { x: 0, z: 20 },
      { x: 14, z: 25 },
      { x: 30, z: 32 },
    ],
    tStart: 535, // 08:55 — crosses the aisle mouth while putaway occupies it → blocking conflict
    tEnd: 595, // 09:55
  },
  {
    id: 'safetyWalk',
    name: 'Safety walk — pedestrian walkway',
    actorKind: 'staff',
    count: 2,
    teamId: 'safety',
    path: [
      { x: -40, z: -15 },
      { x: 0, z: -15 },
      { x: 40, z: -15 },
    ],
    tStart: 480, // 08:00
    tEnd: 530, // 08:50
  },
];
