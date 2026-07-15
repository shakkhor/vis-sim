// Pharma scene: an oral-solids production slice for the pharma vertical (PRODUCT_PLAN.md §3).
// Layout is a faithful-but-simplified take on a real GMP personnel/material-flow floor plan
// (Incepta Pharmaceuticals, Unit-17): two parallel corridor spines with the blending/dispensing
// block between them, every room entered through an airlock, stores to the east, packaging and
// interim store to the north, and a waste disposal room tucked in the south-west. The reference
// drawing's flow legend — material routes vs. primary/secondary personnel routes — maps onto the
// five moves below. The waste/material blending handoff is a deliberate demo violation.
//
// Geometry convention: +z is north. Corridor-1 is the south spine, Corridor-2 the north spine.
import type { Move, SceneDef } from './types';

export const PHARMA_SCENE: SceneDef = {
  id: 'pharma-line2',
  name: 'Pharma — Unit 17 oral solids slice',
  authorTeamId: 'production',
  dayStart: 480, // 08:00
  dayEnd: 720, // 12:00
  teams: [
    { id: 'production', name: 'Production', color: '#4f8ef7' },
    { id: 'qa', name: 'Quality Assurance', color: '#2fbfa3' },
    { id: 'materials', name: 'Materials', color: '#f2a03d' },
    { id: 'waste', name: 'Waste Ops', color: '#e05d5d' },
    { id: 'maintenance', name: 'Maintenance', color: '#a06df2' },
  ],
  resources: [
    {
      id: 'changeRooms',
      name: 'Change Rooms',
      kind: 'zone',
      rect: { x: -20, z: -40, w: 24, d: 14 },
      ownerTeamIds: ['production'],
    },
    {
      id: 'corridor1',
      name: 'Corridor-1 (south spine)',
      kind: 'zone',
      rect: { x: -50, z: -12, w: 100, d: 8 },
      ownerTeamIds: ['production', 'qa'],
      tags: ['clean', 'grade-d'],
    },
    {
      id: 'corridor2',
      name: 'Corridor-2 (north spine)',
      kind: 'zone',
      rect: { x: -50, z: 16, w: 100, d: 8 },
      ownerTeamIds: ['production', 'qa'],
      tags: ['clean', 'grade-d'],
    },
    {
      id: 'pal1',
      name: 'Personnel Airlock PAL-1',
      kind: 'connector',
      rect: { x: -6, z: -2, w: 8, d: 4 },
      ownerTeamIds: ['production', 'qa'],
      tags: ['airlock'],
    },
    {
      id: 'mal1',
      name: 'Material Airlock MAL-1',
      kind: 'connector',
      rect: { x: 24, z: 4, w: 8, d: 6 },
      ownerTeamIds: ['materials', 'production'],
      tags: ['airlock'],
    },
    {
      id: 'wal1',
      name: 'Waste Airlock WAL-1',
      kind: 'connector',
      rect: { x: -52, z: -22, w: 8, d: 8 },
      ownerTeamIds: ['waste', 'production'],
      tags: ['airlock'],
    },
    {
      id: 'dispensing',
      name: 'Dispensing (LAF + holding)',
      kind: 'zone',
      rect: { x: -44, z: 0, w: 24, d: 14 },
      ownerTeamIds: ['production', 'qa'],
      tags: ['clean', 'grade-c'],
    },
    {
      id: 'blending',
      name: 'Blending (drum blender)',
      kind: 'zone',
      rect: { x: -14, z: 6, w: 22, d: 8 },
      ownerTeamIds: ['production'],
      tags: ['clean', 'grade-c'],
    },
    {
      id: 'interimStore',
      name: 'Interim Store',
      kind: 'zone',
      rect: { x: -48, z: 28, w: 20, d: 12 },
      ownerTeamIds: ['materials'],
      tags: ['clean'],
    },
    {
      id: 'packaging',
      name: 'Packaging Area-01',
      kind: 'zone',
      rect: { x: 26, z: 28, w: 28, d: 14 },
      ownerTeamIds: ['production'],
    },
    {
      id: 'storeRooms',
      name: 'Store Rooms (east)',
      kind: 'zone',
      rect: { x: 38, z: -2, w: 20, d: 16 },
      ownerTeamIds: ['materials'],
    },
    {
      id: 'wasteRoom',
      name: 'Waste Disposal Room',
      kind: 'zone',
      rect: { x: -56, z: -40, w: 18, d: 14 },
      ownerTeamIds: ['waste'],
      tags: ['dirty'],
    },
  ],
  blocks: [
    // White-model walls (GMP reference-render look). Perimeter hugs the facility footprint
    // (resources span x −56..58, z −40..42) with a 1–2 unit margin; the south run sits flush
    // against the change/waste rooms (their south edges are at z −40) and leaves a gap at
    // x −14..−2 for the change-room entry (the gowning move starts at x −2).
    {
      id: 'blk-wall-perim-n',
      kind: 'wall',
      rect: { x: -58, z: 43, w: 118, d: 1 },
      height: 3.5,
      color: '#e8ebf2',
    },
    {
      id: 'blk-wall-perim-w',
      kind: 'wall',
      rect: { x: -58, z: -40, w: 1, d: 83 },
      height: 3.5,
      color: '#e8ebf2',
    },
    {
      id: 'blk-wall-perim-e',
      kind: 'wall',
      rect: { x: 59, z: -40, w: 1, d: 83 },
      height: 3.5,
      color: '#e8ebf2',
    },
    {
      id: 'blk-wall-perim-s-w',
      kind: 'wall',
      rect: { x: -58, z: -41, w: 44, d: 1 },
      height: 3.5,
      color: '#e8ebf2',
    },
    {
      id: 'blk-wall-perim-s-e',
      kind: 'wall',
      rect: { x: -2, z: -41, w: 61, d: 1 },
      height: 3.5,
      color: '#e8ebf2',
    },
    // Interior walls between corridor-1 and the production block, in the 4-unit strip
    // between the corridor's north edge (z −4) and dispensing (z 0). The opening at
    // x −13..4 clears PAL-1 (x −6..2) and the waste-egress crossing at x −10.
    {
      id: 'blk-wall-int-c1-w',
      kind: 'wall',
      rect: { x: -46, z: -4, w: 33, d: 1 },
      height: 3.5,
      color: '#e8ebf2',
    },
    {
      id: 'blk-wall-int-c1-e',
      kind: 'wall',
      rect: { x: 4, z: -4, w: 44, d: 1 },
      height: 3.5,
      color: '#e8ebf2',
    },
    // Interior wall between the production block and corridor-2, on the corridor's south
    // edge (z 15..16). No airlock sits on this side — MAL-1 (z 4..10) routes east–west
    // between the two interior walls — so the run is continuous.
    {
      id: 'blk-wall-int-c2',
      kind: 'wall',
      rect: { x: -46, z: 15, w: 94, d: 1 },
      height: 3.5,
      color: '#e8ebf2',
    },
  ],
  rules: [
    {
      id: 'pharma-no-vehicles-clean',
      description: "Vehicles may never enter zones tagged 'clean'",
      kind: 'forbidden-entry',
      actorKinds: ['vehicle'],
      resourceTags: ['clean'],
    },
    {
      id: 'pharma-waste-material-segregation',
      description: 'Waste flows may never share clean zones or airlocks with material flows',
      kind: 'separation',
      teamIdsA: ['waste'],
      teamIdsB: ['materials'],
      resourceTags: ['clean', 'airlock'],
    },
  ],
};

export const PHARMA_MOVES: Move[] = [
  {
    // Primary-area personnel route (yellow in the reference legend).
    id: 'gowningToBlending',
    name: 'Operators — gowning to blending',
    actorKind: 'staff',
    count: 6,
    teamId: 'production',
    path: [
      { x: -2, z: -34 }, // change rooms
      { x: -2, z: 10 }, // straight north: corridor-1 → PAL-1 → blending
    ],
    tStart: 490, // 08:10 — leaving the change rooms
    tEnd: 534, // 08:54 — at the blender (corridor 08:32–08:40, PAL-1 08:42–08:46)
  },
  {
    // Material route (green in the reference legend): stores → MAL-1 → dispensing → blending.
    id: 'dispensedToBlending',
    name: 'Dispensed materials to blending',
    actorKind: 'material',
    count: 1,
    teamId: 'materials',
    path: [
      { x: 48, z: 5 }, // store rooms
      { x: -32, z: 5 }, // west through MAL-1, skirting south of blending, into dispensing
      { x: -32, z: 10 }, // dispensing dwell (LAF weigh-out)
      { x: 3, z: 10 }, // east into blending for charge-in
    ],
    tStart: 540, // 09:00 — MAL-1 09:16–09:24, dispensing 10:08–10:37
    tEnd: 660, // 11:00 — holds blending 10:43–11:00 for charge-in
  },
  {
    // Waste egress: blending → corridor-1 → WAL-1 → waste disposal room. Leaves while the
    // dispensed batch is still charging in → separation violation in blending 10:48–10:50.
    id: 'wasteEgress',
    name: 'Waste egress to disposal room',
    actorKind: 'material',
    count: 1,
    teamId: 'waste',
    path: [
      { x: -10, z: 10 }, // blending (west of PAL-1's x-band)
      { x: -10, z: -8 }, // south into corridor-1
      { x: -48, z: -8 }, // west along the spine
      { x: -48, z: -32 }, // south through WAL-1 into the waste disposal room
    ],
    tStart: 648, // 10:48 — still in blending until 10:50, corridor-1 10:55–11:18
    tEnd: 688, // 11:28 — WAL-1 11:19–11:23, disposal room 11:25–11:28
  },
  {
    // Secondary-area personnel route (red in the reference legend). Enters blending while the
    // operators are still settling in → cross-team warning, but clears PAL-1 after them.
    id: 'qaLineClearance',
    name: 'QA line clearance — dispensing',
    actorKind: 'staff',
    count: 2,
    teamId: 'qa',
    path: [
      { x: 0, z: -8 }, // corridor-1
      { x: 0, z: 10 }, // north through PAL-1 into blending
      { x: -30, z: 10 }, // west across blending into dispensing
    ],
    tStart: 524, // 08:44 — PAL-1 08:47–08:49 (after the operators leave it at 08:46)
    tEnd: 548, // 09:08 — blending 08:51–09:00, dispensing 09:03–09:08
  },
  {
    // Conflict-free changeover walk on the north spine.
    id: 'packagingChangeover',
    name: 'Packaging changeover',
    actorKind: 'staff',
    count: 3,
    teamId: 'production',
    path: [
      { x: -9, z: 20 }, // corridor-2
      { x: 36, z: 20 }, // east along the spine
      { x: 36, z: 35 }, // north into Packaging Area-01
    ],
    tStart: 560, // 09:20 — corridor-2 until 10:09
    tEnd: 620, // 10:20 — packaging area 10:13–10:20
  },
];
