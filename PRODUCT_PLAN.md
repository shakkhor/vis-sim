# Spatial Operations Planning Platform — Product Plan

**Working name:** VisSim (visualize · simulate · authorize)
**Status:** Draft v1 — pre-tech-stack. Tech stack to be selected after this plan is refined.
**Date:** 2026-07-15

---

## 1. Vision

Enterprises that run physical spaces — stadiums, warehouses, pharma plants, airports, hospitals — plan complex movements of **people, materials, and equipment** using spreadsheets, PDFs, radio calls, and tribal knowledge. Plans that inherently live in space and time are trapped in documents that can't show space or time.

VisSim is a platform where operations teams:

1. **Build** a 3D model of their facility with an in-app scene builder (no CAD skills required).
2. **Choreograph** operational plans on that model — who/what moves where, when, along which path.
3. **Share and approve** plans across the teams whose zones, gates, corridors, or time windows they touch — with conflicts detected automatically.
4. **Train** staff by exporting approved plans as tutorial videos, step-by-step walkthroughs, and briefing packs.

One sentence: **"Google Docs + Figma for physical operations — draw the plan on the building, get it approved by everyone it touches, and turn the approval into training."**

### What it is NOT (v1)

- Not an analytical crowd-dynamics simulator (no physics-accurate pedestrian modeling, evacuation-time computation). Playback is choreographed, not computed. Analytical simulation is a later phase.
- Not a real-time digital twin fed by live sensors. That is a natural expansion, not v1.
- Not a CAD/BIM authoring tool. The scene builder favors speed and legibility over engineering fidelity.

---

## 2. Problem & Market Gap

Existing tools cluster into three camps, none of which do this job:

| Camp | Examples | Gap |
|---|---|---|
| Industrial simulation | FlexSim, AnyLogic, Simio, Visual Components | Analyst-grade, expensive expertise, built for throughput analysis — not for cross-team planning, approvals, or training frontline staff |

**Closest analog: Visual Components** (visualcomponents.com). Validates the core interaction model — drag-and-drop scene building from a 3,500+ component eCatalog, 3D flow simulation, "Experience" viewers for sharing to mobile/web/VR. Key divergences that define our product: (a) Windows desktop tool for a single simulation engineer vs. our web-first multiplayer; (b) sharing is one-way showcasing — no zone ownership, approval routing, conflict detection, audit trail, or training assignment/tracking; (c) actors are machines/robots (half their product is robot offline programming) vs. our people/cohorts/materials in shared spaces; (d) buyer is manufacturing engineering vs. our operations org. Positioning: *VC's scene-building ergonomics + the governance and training layer they don't have, in the browser.* Their eCatalog is the reference model for our asset library and vertical packs.
| Digital twins | Lenovo/FIFA 2026 stadium twins, InControl | Real-time monitoring of live events; requires sensors and integration projects; not a planning/approval tool |
| SOP & workflow software | Kivo, SmartProcess, generic BPM | Document-centric. Approvals exist but the plan itself is text — no spatial representation, no simulation, no conflict detection |

The gap: **no product combines an accessible 3D scene builder + choreographed operational planning + spatially-aware cross-team approvals + training export.** The approval and conflict layer on top of a shared spatial model is the moat — simulation vendors don't do governance, and workflow vendors don't do space.

Demand signal: over 1 in 3 event professionals name crowd safety and flow as their single biggest planning challenge (OnePlan 2026 report); FIFA is running all 16 World Cup 2026 stadiums on digital twins.

---

## 3. Target Users & Personas

The core is **domain-agnostic**; verticals are delivered as content packs (asset libraries + templates + terminology), not separate products.

| Persona | Role | Uses the product to… |
|---|---|---|
| **Planner** (ops manager, event manager, production planner) | Author | Build scenes, choreograph moves, submit for approval |
| **Reviewer** (team lead of an affected zone/function) | Approver | Watch the simulated plan from their team's perspective, comment, approve/reject |
| **Coordinator** (head of operations, safety officer) | Orchestrator | See the whole picture, resolve conflicts, own final sign-off, manage plan calendar |
| **Frontline staff** (steward, forklift driver, cleanroom operator) | Consumer | Watch training videos / walkthroughs of approved plans; confirm completion |
| **Admin** | IT | Tenants, SSO, roles, audit, retention |

### Vertical scenarios the core must serve

- **Stadium:** spectator ingress/egress per block, security patrol routes, food/water inbound logistics, waste outbound after each match, cleanup crew choreography, turf covering/uncovering, team & VIP movements. Season-long training of all staff.
- **Warehouse:** dock scheduling, material flow, forklift vs. pedestrian segregation, putaway/pick paths, safety zones, shift handover procedures.
- **Pharma plant:** unidirectional people/material flow, gowning sequences, contamination-zone transitions (airlocks, pass-throughs), waste egress that must never cross clean material ingress, line-clearance procedures. (Regulated: needs e-signatures and audit rigor — see §9.)

---

## 4. Domain Model (Ubiquitous Language)

This is the heart of the product. Everything else is UI over these concepts.

### 4.1 Spatial concepts

- **Site** — a physical facility (a stadium, a warehouse). Top-level container. A tenant has many sites.
- **Scene** — the 3D model of a site (or part of one), built in the Scene Builder. Versioned. One site can have multiple scenes (whole stadium; just the north concourse).
- **Block** — any placed object in a scene: walls, stands, gates, docks, machines, shelving, turf cover. Instantiated from the Asset Library. Blocks can be parametric (a stand with N rows, a shelf with N bays).
- **Zone** — a named volume/area painted onto the scene (Block D concourse, Gate 7 apron, Grade-C corridor, Dock 3 staging). Zones are the unit of **ownership and reservation** — every zone belongs to one or more **Teams**.
- **Connector** — a passage between zones (gate, door, airlock, dock door, corridor mouth). Connectors are first-class because they are the classic shared-resource conflict point (the Block C/D shared gate). A connector has capacity attributes and an owner set.

### 4.2 Actors & movement

- **Actor** — anything that moves: a person role (steward, cleaner, spectator cohort), a vehicle (forklift, waste truck), a material unit (pallet, water shipment, waste container). Actors have a type, an icon/3D representation, and optionally a count (a "cohort" of 4,000 Block-D spectators is one actor with count 4000, rendered as a flow).
- **Path** — a polyline route through the scene, snapped to walkable/drivable surfaces, passing through zones and connectors.
- **Move** — the atomic planning unit: *Actor + Path + time window + behavior* (walk, carry, queue, wait, operate). A move knows every zone and connector it touches and when — this is what powers conflict detection and approval routing.
- **Sequence** — an ordered/parallel group of moves with dependencies ("waste collection starts only after cleanup crew finishes section 4"). Essentially a spatial Gantt.

### 4.3 Planning & governance

- **Plan** — a named, versioned collection of sequences on a scene, for a purpose and time window ("Matchday Ops — vs. Rivals FC, Aug 12" or "Line 2 Changeover SOP"). Plans can be templates ("Standard Matchday") instantiated per event.
- **Team** — an organizational group (Block C stewarding, Waste Management, F&B Logistics, QA). Teams own zones/connectors and receive approval requests.
- **Reservation** — the derived claim a plan makes: *(zone or connector) × time window × plan*. Computed automatically from moves. Reservations are the currency of conflict detection.
- **Conflict** — two reservations on the same zone/connector with overlapping time windows from different plans (or incompatible moves within one plan), or a rule violation (see below). Conflicts block approval until resolved or explicitly waived by the owning team.
- **Rule** — a per-zone/per-vertical constraint, e.g. "waste actors may never enter zones tagged `clean` " (pharma), "forklift and pedestrian actors may not share a zone without a barrier" (warehouse), "connector capacity ≤ X actors/min" (stadium). Rules are data, not code — this is how the core stays domain-agnostic.
- **Approval Request** — routed automatically: when a plan's reservations touch a team's zones/connectors, that team becomes a required approver. Reviewers see the plan *played back from their zones' perspective*. States: draft → in review → changes requested → approved → published → archived. Approval of a new version invalidates the old.
- **Annotation** — comments pinned to a point in **space and time** in the simulation ("at 14:32 this queue blocks our service door" pinned to the exact spot and playback moment).

### 4.4 Training

- **Training Package** — generated from a *published* plan: rendered video (per-team camera perspectives), step-by-step interactive walkthrough, printable briefing (2D/isometric snapshots with callouts), optional comprehension checklist. Assignment and completion tracking per staff member.

---

## 5. Product Modules

### 5.1 Scene Builder (in-app, no imports required)

- Ground plane with snapping grid; draw walls/floors/levels; place parametric blocks from the library; paint zones; drop connectors.
- **View modes: 3D perspective, 2D top-down floor plan, isometric** — all views are projections of one model; users build in whichever is comfortable. All are exportable.
- Layers (structure / zones / equipment / annotations) with per-layer visibility.
- Deliberately low-poly, legible visual style (SimCity-like clarity beats photorealism for communication and keeps rendering cheap on enterprise laptops).
- Scene versioning: plans pin to a scene version; scene edits produce new versions with impact warnings ("3 published plans reference the old Gate 7").
- **AI/MCP-assisted import (later, not v1):** rather than building fragile IFC/DWG import pipelines, expose the Scene Builder's operations as a tool API (MCP server: `create_wall`, `place_block`, `paint_zone`, …). An AI agent can then *reconstruct* a scene from an uploaded floor-plan image or CAD file by driving the same builder a human uses. Import becomes an agent skill, not an interchange-format project. The human reviews/fixes the result in the builder. This also enables "describe your warehouse in text and get a draft scene."

### 5.2 Asset & Template Library

- Core library: primitives, architectural elements, generic vehicles/people/materials.
- **Vertical packs:** Stadium (stands, turnstiles, turf cover, concession stands…), Warehouse (racking, docks, forklifts, conveyors…), Pharma (isolators, airlocks, pass-through hatches, gowning stations…). Packs also ship zone-type presets, rule presets, actor types, and plan templates.
- Tenant-private libraries: an org saves its own blocks, actors, and plan templates. (Long-term: a marketplace.)

### 5.3 Planning Studio

- Timeline editor (horizontal tracks per team/actor) synchronized with the 3D viewport: scrub time, see everything move.
- Draw a path in the scene → assign actor → set timing → move created. Drag on timeline to retime.
- Dependencies between moves/sequences (finish-to-start etc.).
- Live reservation ribbon: as you plan, the affected zones/teams light up ("this plan currently requires approval from: Block C, Security, F&B").
- Scenario branches: duplicate a plan to compare variants ("Route A vs Route B for waste trucks").

### 5.4 Simulation & Playback

- Deterministic choreographed playback of a plan: actors move along paths on schedule; cohort flows render as animated streams with density coloring.
- Camera presets: overview, follow-an-actor, **per-team perspective** (auto-framed on that team's zones), 2D and isometric playback.
- **Conflict engine** runs continuously: spatio-temporal reservation overlaps, rule violations, connector capacity breaches. Conflicts are listed, ranked, and clickable — jump the playhead to the exact moment and place.
- (Phase 3+) Analytical layer: pluggable crowd-flow/queueing computation to *derive* timings instead of hand-authoring them.

### 5.5 Collaboration & Approvals

- Auto-computed approver set from reservations + manually added approvers.
- Reviewer experience: open request → watch playback from own perspective → annotate in space-time → request changes or approve. Approvals can be scoped ("approved for our gate, 13:00–15:00 only").
- Full audit trail: who changed what, who approved which version, when (event-sourced — see §8).
- Cross-plan calendar: all published/in-review plans for a site on one timeline; the coordinator sees season-level load.
- Notifications & integrations (email, Slack/Teams) for review requests and conflicts.
- Real-time co-editing of scenes and plans (multiplayer cursors) — strongly desired, drives architecture choice (§8).

### 5.6 Training & Export

- One-click Training Package from a published plan:
  - **Video render** — narrated, per-team cuts, chaptered by sequence; auto-generated captions from move metadata ("14:30 — open Gate 7; stewards take positions A1–A4").
  - **Interactive walkthrough** — step-through in browser, mobile-friendly for frontline staff.
  - **Briefing PDF** — 2D/iso snapshots with numbered callouts.
- Assignment & tracking: assign packages to teams/individuals, completion status, optional acknowledgment ("I have read and understood") — which in pharma doubles as training records.
- Exports: MP4, PDF, PNG (any view), shareable read-only web link.

### 5.7 Enterprise & Admin

- Multi-tenant; org → sites → teams → members.
- SSO (SAML/OIDC), SCIM provisioning.
- RBAC: builder, planner, reviewer, viewer, admin — scoped per site/team/zone.
- Audit log export; data retention policies.
- Compliance track (pharma, later phase): 21 CFR Part 11 / EU Annex 11 e-signatures on approvals, validation documentation pack (IQ/OQ/PQ support), immutable records.

---

## 6. Flagship Workflow — the Block D / Block C gate example

1. Planner opens scene "Stadium — Full Bowl v12", creates plan "Matchday Aug 12" from the "Standard Matchday" template.
2. Edits the "Block D ingress" sequence: draws spectator-cohort path from the transit plaza through **Gate 7** (a connector owned by both Block C and Block D teams) into Block D concourse, 13:00–14:45.
3. Reservation engine flags: *Gate 7 reserved 13:00–14:45 → Block C team is a required approver.* It also detects a conflict: F&B's restock plan has a supply cart crossing Gate 7 apron at 13:30.
4. Planner retimes the F&B crossing dependency or reroutes; conflict clears. Submits for review.
5. Block C lead gets a notification, opens the request, watches the ingress playback auto-framed on Gate 7 and Block C concourse, pins one annotation ("queue barrier needed at this pillar from 13:15"), requests changes.
6. Planner adds a barrier-setup move for the stewarding team (which adds Stewarding as an approver), resubmits. Block C, F&B, Security, Stewarding approve. Coordinator publishes.
7. One click: Training Packages generated — video cut for Block D stewards, one for Block C, briefing PDF for the security shift. Assigned; completion tracked before matchday.
8. Post-match, the same plan's "egress + waste egress + cleanup + turf cover" sequences run the same lifecycle. Next season, the whole plan is a template again.

Every product decision should be tested against this loop, and its warehouse/pharma equivalents.

---

## 7. Phased Roadmap

**Phase 0 — Concept prototype (4–6 wks).** Clickable web prototype: hardcoded stadium scene, one plannable sequence, fake approval flow, canned playback. Goal: sell the vision internally/to design partners; validate the reservation/approval model on paper with 2–3 real ops teams. *No production code expected to survive.*

**Phase 1 — MVP (single vertical content, generic core) (~2 quarters).**
Scene Builder (3D+2D, core library, zones, connectors) · Planning Studio (paths, moves, timeline) · deterministic playback · reservation-based approval routing with basic conflict detection (overlap only) · comments (not yet space-time pinned) · single-tenant-ish auth, basic roles · shareable read-only link. Ship with the **stadium pack** to design partners, but keep every concept generic.

**Phase 2 — Governance & training (v1 GA) (~1–2 quarters).**
Rules engine (data-driven constraints) · space-time annotations · plan versioning/invalidations · cross-plan calendar · Training Packages (video render, walkthrough, PDF, assignment tracking) · SSO, RBAC, audit trail · warehouse pack · MCP tool API over the Scene Builder (enables AI-assisted scene drafting).

**Phase 3 — Scale & regulated (v2).**
Real-time multiplayer editing · pharma pack + Part 11 e-signature track · analytical simulation plug-ins (crowd flow, queueing) · template/asset marketplace · live-ops mode (day-of execution checklist against the plan; groundwork for sensor-fed digital twin).

---

## 8. Architecture Considerations (tech-agnostic, decisions deferred)

Principles first, candidates second. The stack decision should be made after Phase 0 validates the model.

### 8.1 Shape of the system

- **Web-first.** Reviewers and frontline staff will not install software. The builder/studio is a browser app; training consumption must work on mobile browsers.
- **One document model, many projections.** Scene = structured document (blocks, zones, connectors as data, not meshes). 3D/2D/isometric are renderers over the same data. Store geometry parametrically; derive meshes.
- **Entity-Component style scene schema** with glTF for the visual layer of library assets. Custom JSON schema for the semantic layer (zones, ownership, rules) — semantics are the product; don't bury them in a 3D format.
- **Event sourcing for plans and approvals.** The audit trail, versioning, "who approved what when", and Part 11 ambitions all fall out naturally if plan/approval state is an append-only event log with projections. Decide this early; retrofitting is painful.
- **Reservations as a first-class computed index.** Conflict detection is interval overlap on (resource × time) — cheap and deterministic. Keep it synchronous and instant in the editor; this immediacy is a signature UX.
- **Rules as data.** A rule DSL/JSON (zone tags, actor types, predicates) evaluated by the conflict engine. New verticals = new content, not new code.
- **Approval workflow: start with an explicit state machine in the core domain** (states are few and product-specific). Adopt a workflow engine (Temporal/Camunda) only if/when escalations, delegations, SLAs get hairy.
- **Video rendering:** deterministic playback means renders are reproducible. Two options to evaluate: client-side capture (cheap, good enough for MVP) vs. server-side headless GPU rendering (consistent quality, needed at scale). Design playback to be headless-runnable from day one.
- **Real-time collaboration:** if multiplayer editing is a Phase 3 must, consider CRDT-based document state (e.g. Yjs-style) early, since it constrains the document model. At minimum: optimistic locking + presence in MVP.

### 8.2 Candidate stacks (to evaluate after Phase 0)

| Layer | Candidates | Notes |
|---|---|---|
| 3D engine | **Three.js/React-Three-Fiber**, Babylon.js, PlayCanvas | Web-native, low-poly style keeps perf easy. Unity/Unreal WebGL likely overkill and hurts web UX/hiring |
| Frontend | React + R3F, or Vue/Svelte + engine-native | Timeline UI is heavy custom work regardless |
| Backend | TypeScript (Node/Nest), Go, or JVM (Kotlin) | Event-sourced core; strong typing valuable for domain model |
| Data | Postgres (+ event tables), object storage for assets/renders | Interval indexes (GiST) handle reservation queries well |
| Realtime | WebSocket layer; Yjs/Automerge if CRDT route | |
| Video | Headless Chromium/WebGL capture farm, or native renderer | Evaluate in Phase 2 |
| AI import | MCP server exposing builder ops; LLM with vision for floor-plan → scene drafting | Phase 2 |

### 8.3 Non-functional targets

Scene scale: a full stadium at legible low-poly fidelity should run 60 fps on a mid-range corporate laptop — budget ~100k–500k triangles, aggressive instancing (stands, seats, racking are ideal instancing cases). Plans: hundreds of moves, dozens of teams, seasons of ~50 plan instances per site. Tenancy isolation, SOC 2 from GA, data residency options for EU pharma.

---

## 9. Risks & Open Questions

1. **Scope gravity.** This plan spans a 3D editor, an animation timeline, a workflow system, and a video pipeline — each is a product. Mitigation: the domain model (§4) is the product; every module is the thinnest UI that serves the flagship loop (§6). Cut fidelity, never cut the loop.
2. **"Good enough" scene building.** If building a stadium takes a week, adoption dies. Mitigation: parametric blocks (a whole stand from 6 parameters), vertical packs, and the AI-assisted drafting path. Measure time-to-first-scene relentlessly.
3. **Choreographed ≠ realistic.** Hand-authored timings may not survive contact with reality; a plan can be approved and still wrong. Mitigation: position as communication/coordination/training (where the bar is "better than PDFs and radio"), add analytical checks later; capture post-event feedback on plans (Phase 3 live-ops).
4. **Approval fatigue.** Auto-routing could spam teams with requests for trivial touches. Needs: approval thresholds (e.g. transit through a zone < 5 min may be notify-only), delegation, and template pre-approval ("Standard Matchday" deltas only re-approve what changed).
5. **Pharma compliance cost.** Part 11 validation is expensive; do not let it leak into the core early. Keep it an explicit Phase 3 track behind a compliance edition.
6. **Open questions for design partners:** What plan granularity do stadium ops actually work at (per-gate? per-block? per-shift?)? Who legally *must* sign off (safety officer statutory duties vary by country)? Is video or interactive walkthrough the training format staff actually complete? What's the minimum scene fidelity reviewers trust?

---

## 10. Success Metrics

- **Activation:** time from signup to first playable plan on own scene (< 1 day with a vertical pack).
- **Core loop:** plans reaching *published* per site per month; % of approval requests decided < 48 h; conflicts auto-detected before human review (target: majority).
- **Training:** package completion rate; time-to-trained for a new staff cohort vs. baseline.
- **Retention proof:** % of plans created from templates (season 2 = the moat); # teams per tenant actively approving (cross-team usage is the defensibility signal).

---

## 11. Immediate Next Steps

1. Refine this plan (you + stakeholders); stress-test §4 and §6 against one real warehouse and one pharma scenario in writing.
2. Recruit 2–3 design partners (one venue, one warehouse) for Phase 0 interviews.
3. Build the Phase 0 clickable prototype to validate the reservation → approval routing UX.
4. Only then: tech-stack decision workshop using §8 criteria.
