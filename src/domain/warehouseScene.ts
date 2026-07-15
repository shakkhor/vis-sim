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
