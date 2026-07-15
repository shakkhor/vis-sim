import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  Grid,
  OrbitControls,
  Html,
  Line,
  OrthographicCamera,
  PerspectiveCamera,
} from '@react-three/drei';
import { Vector3 } from 'three';
import { useVisSim } from '../state/store';
import { teamColor } from '../domain/scene';
import { actorPositions } from '../domain/actors';
import { snap, snapRectToNeighbors } from '../domain/sceneEdit';
import type {
  Block,
  BlockKind,
  Conflict,
  Move,
  Rect,
  Resource,
  RuleViolation,
  SceneDef,
  Vec2,
} from '../domain/types';

/** Mirrors the domain-side minimum footprint (sceneEdit's MIN_SIZE) so the
 * viewport never requests a rect the domain would clamp differently. */
const MIN_SIZE = 2;

/** Ground plane footprint: 130×90 centered on (0, 4). Guides/grid span it. */
const GROUND = { minX: -65, maxX: 65, minZ: -41, maxZ: 49 } as const;

/** Alignment guide reported by the domain snapper, rendered while dragging. */
type SnapGuide = { axis: 'x' | 'z'; value: number };

/** One in-flight drag gesture. Pointer-down on an editable object arms this;
 * the large ground mesh supplies ground-plane intersections on pointer-move. */
type DragState =
  | { kind: 'move'; id: string; start: Vec2; startRect: Rect; last: Rect | null }
  | { kind: 'resize'; id: string; min: Vec2; last: Rect | null }
  | { kind: 'waypoint'; moveId: string; index: number; last: Vec2 | null };

function rectFromPoints(a: Vec2, b: Vec2): Rect {
  return {
    x: Math.min(a.x, b.x),
    z: Math.min(a.z, b.z),
    w: Math.abs(a.x - b.x),
    d: Math.abs(a.z - b.z),
  };
}

function ResourceMesh({
  scene,
  resource,
  conflictActive,
  selected,
  hovered,
  onSelect,
  onDragStart,
  onHoverChange,
}: {
  scene: SceneDef;
  resource: Resource;
  conflictActive: boolean;
  selected: boolean;
  hovered: boolean;
  onSelect?: (e: ThreeEvent<MouseEvent>) => void;
  onDragStart?: (e: ThreeEvent<PointerEvent>) => void;
  onHoverChange?: (hovering: boolean) => void;
}) {
  const viewMode = useVisSim((s) => s.viewMode);
  const labelDistanceFactor = viewMode === '3d' ? 90 : undefined;
  const { rect, kind } = resource;
  const color = kind === 'connector' ? '#e8c34a' : teamColor(scene, resource.ownerTeamIds[0]);
  const baseOpacity = kind === 'connector' ? 0.55 : 0.28;
  const opacity = selected
    ? Math.min(1, baseOpacity + 0.3)
    : hovered
      ? Math.min(1, baseOpacity + 0.14)
      : baseOpacity;
  return (
    <group
      position={[rect.x + rect.w / 2, 0, rect.z + rect.d / 2]}
      onClick={onSelect}
      onPointerDown={onDragStart}
      onPointerOver={onHoverChange ? () => onHoverChange(true) : undefined}
      onPointerOut={onHoverChange ? () => onHoverChange(false) : undefined}
    >
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[rect.w, 0.3, rect.d]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} />
      </mesh>
      {selected && (
        <Line
          points={[
            [-rect.w / 2, 0.42, -rect.d / 2],
            [rect.w / 2, 0.42, -rect.d / 2],
            [rect.w / 2, 0.42, rect.d / 2],
            [-rect.w / 2, 0.42, rect.d / 2],
            [-rect.w / 2, 0.42, -rect.d / 2],
          ]}
          color="#ffffff"
          lineWidth={2.5}
        />
      )}
      {conflictActive && (
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[rect.w + 0.6, 0.3, rect.d + 0.6]} />
          <meshStandardMaterial color="#ff3b3b" transparent opacity={0.55} />
        </mesh>
      )}
      {/* distanceFactor only works under a perspective camera; under the orthographic
          2D/Iso cameras it inflates labels to screen size, so use fixed CSS sizing there. */}
      <Html
        center
        distanceFactor={labelDistanceFactor}
        position={[0, 1.4, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div className="zone-label">
          {resource.name}
          {resource.tags && resource.tags.length > 0 && (
            <div>
              {resource.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: 9,
                    background: 'rgba(232,195,74,0.25)',
                    borderRadius: 6,
                    padding: '0 5px',
                    marginRight: 3,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

/** Renderer defaults when a block does not carry an explicit color. */
const BLOCK_COLORS: Record<BlockKind, string> = {
  wall: '#8892aa',
  pillar: '#5a6478',
  box: '#46506e',
  slab: '#3a4257',
};

/** Passive scene structure (walls, pillars, ...). Never interactive: raycast is
 * disabled so blocks can never intercept or occlude resource pointer events. */
function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <group>
      {blocks.map((b) => (
        <mesh
          key={b.id}
          position={[b.rect.x + b.rect.w / 2, (b.y ?? 0) + b.height / 2, b.rect.z + b.rect.d / 2]}
          raycast={() => null}
        >
          <boxGeometry args={[b.rect.w, b.height, b.rect.d]} />
          <meshStandardMaterial color={b.color ?? BLOCK_COLORS[b.kind]} />
        </mesh>
      ))}
    </group>
  );
}

/** Actors of one move at the current playhead, staggered along the window. */
function MoveActors({ scene, move, t }: { scene: SceneDef; move: Move; t: number }) {
  const positions = actorPositions(move, t);
  if (positions.length === 0) return null;

  const isCohort = move.actorKind === 'cohort';
  const color = teamColor(scene, move.teamId);

  return (
    <group>
      {positions.map((p, i) =>
        move.actorKind === 'vehicle' ? (
          <mesh key={i} position={[p.x, 0.8, p.z]}>
            <boxGeometry args={[2.2, 1.4, 1.2]} />
            <meshStandardMaterial color={color} />
          </mesh>
        ) : (
          <mesh key={i} position={[p.x, 0.7, p.z]}>
            <sphereGeometry args={[isCohort ? 0.45 : 0.55, 12, 12]} />
            <meshStandardMaterial color={color} />
          </mesh>
        ),
      )}
    </group>
  );
}

function PathLine({ scene, move, selected }: { scene: SceneDef; move: Move; selected: boolean }) {
  const points = move.path.map((p) => new Vector3(p.x, 0.5, p.z));
  return (
    <Line
      points={points}
      color={teamColor(scene, move.teamId)}
      lineWidth={selected ? 4 : 2}
      dashed={!selected}
      dashSize={1}
      gapSize={0.6}
    />
  );
}

const PLAYBACK_MINUTES_PER_SECOND = 6;

function Playback() {
  const playing = useVisSim((s) => s.playing);
  useFrame((_, delta) => {
    if (!playing) return;
    const { playhead, scene, setPlayhead, togglePlay } = useVisSim.getState();
    const next = playhead + delta * PLAYBACK_MINUTES_PER_SECOND;
    if (next >= scene.dayEnd) {
      setPlayhead(scene.dayEnd);
      togglePlay();
    } else {
      setPlayhead(next);
    }
  });
  return null;
}

/** Everything that renders from (or edits) the plan/scene. Lives inside the
 * Canvas so it can reach the default OrbitControls via useThree. */
function SceneBody({
  conflicts,
  violations,
}: {
  conflicts: Conflict[];
  violations: RuleViolation[];
}) {
  const scene = useVisSim((s) => s.scene);
  const moves = useVisSim((s) => s.moves);
  const playhead = useVisSim((s) => s.playhead);
  const mode = useVisSim((s) => s.mode);
  const draftPath = useVisSim((s) => s.draftPath);
  const addDraftPoint = useVisSim((s) => s.addDraftPoint);
  const selectedMoveId = useVisSim((s) => s.selectedMoveId);
  const selectedResourceId = useVisSim((s) => s.selectedResourceId);
  const pendingAdd = useVisSim((s) => s.pendingAdd);
  const selectResource = useVisSim((s) => s.selectResource);
  const resizeResourceTo = useVisSim((s) => s.resizeResourceTo);
  const addResourceAt = useVisSim((s) => s.addResourceAt);
  const moveMoveWaypoint = useVisSim((s) => s.moveMoveWaypoint);

  // Camera orbit is disabled while a drag gesture is live (PRD §4). The drei
  // OrbitControls below is makeDefault, so it is reachable as state.controls.
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  const controlsRef = useRef(controls);
  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  const dragRef = useRef<DragState | null>(null);
  // Two-click create gesture (US-5): first click anchors, move previews.
  const [drawAnchor, setDrawAnchor] = useState<Vec2 | null>(null);
  const [drawCursor, setDrawCursor] = useState<Vec2 | null>(null);
  // Alignment guides from the domain edge-snapper; only live during a drag.
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  // Hovered resource (scene-edit affordance); cleared when leaving the mode.
  const [hoveredResourceId, setHoveredResourceId] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'scene') setHoveredResourceId(null);
  }, [mode]);

  const beginDrag = useCallback((state: DragState) => {
    dragRef.current = state;
    if (controlsRef.current) controlsRef.current.enabled = false;
  }, []);

  const endDrag = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setGuides([]);
    if (controlsRef.current) controlsRef.current.enabled = true;
  }, []);

  // Window-level fallback: pointer-up outside the ground mesh still ends the drag.
  useEffect(() => {
    window.addEventListener('pointerup', endDrag);
    return () => window.removeEventListener('pointerup', endDrag);
  }, [endDrag]);

  // ESC / tool disarm elsewhere clears pendingAdd — drop any half-drawn preview.
  useEffect(() => {
    if (!pendingAdd) {
      setDrawAnchor(null);
      setDrawCursor(null);
    }
  }, [pendingAdd]);

  const activeConflictResourceIds = useMemo(() => {
    const ids = new Set(
      conflicts.filter((c) => playhead >= c.t0 && playhead <= c.t1).map((c) => c.resourceId),
    );
    for (const v of violations) {
      if (playhead >= v.t0 && playhead <= v.t1) ids.add(v.resourceId);
    }
    return ids;
  }, [conflicts, violations, playhead]);

  const onGroundClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return; // ignore orbit/edit drags
    if (mode === 'draw') {
      e.stopPropagation();
      addDraftPoint({ x: snap(e.point.x), z: snap(e.point.z) });
      return;
    }
    if (mode !== 'scene') return;
    e.stopPropagation();
    const p = { x: snap(e.point.x), z: snap(e.point.z) };
    if (pendingAdd) {
      if (!drawAnchor) {
        setDrawAnchor(p);
        setDrawCursor(p);
      } else {
        addResourceAt(pendingAdd, rectFromPoints(drawAnchor, p));
        setDrawAnchor(null);
        setDrawCursor(null);
      }
      return;
    }
    selectResource(null); // empty-ground click clears selection (US-1)
  };

  // All drag gestures resolve against the ground plane here. Move/resize both
  // compute an absolute target rect, run it through the domain edge-snapper
  // (grid + neighbor magnetism), and apply via resizeResourceTo — guarded by a
  // last-applied check so the store is only hit when the snapped rect changes.
  const onGroundPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current;
    if (drag) {
      const p = { x: e.point.x, z: e.point.z };
      if (drag.kind === 'move') {
        const target: Rect = {
          x: drag.startRect.x + (p.x - drag.start.x),
          z: drag.startRect.z + (p.z - drag.start.z),
          w: drag.startRect.w,
          d: drag.startRect.d,
        };
        const snapped = snapRectToNeighbors(scene.resources, drag.id, target);
        const next = snapped.rect;
        if (!drag.last || next.x !== drag.last.x || next.z !== drag.last.z) {
          resizeResourceTo(drag.id, next);
          drag.last = next;
          setGuides(snapped.guides);
        }
      } else if (drag.kind === 'resize') {
        const target: Rect = {
          x: drag.min.x,
          z: drag.min.z,
          w: Math.max(MIN_SIZE, snap(p.x) - drag.min.x),
          d: Math.max(MIN_SIZE, snap(p.z) - drag.min.z),
        };
        const snapped = snapRectToNeighbors(scene.resources, drag.id, target);
        const next = snapped.rect;
        if (
          !drag.last ||
          next.x !== drag.last.x ||
          next.z !== drag.last.z ||
          next.w !== drag.last.w ||
          next.d !== drag.last.d
        ) {
          resizeResourceTo(drag.id, next);
          drag.last = next;
          setGuides(snapped.guides);
        }
      } else {
        const sp = { x: snap(p.x), z: snap(p.z) };
        if (!drag.last || sp.x !== drag.last.x || sp.z !== drag.last.z) {
          moveMoveWaypoint(drag.moveId, drag.index, sp);
          drag.last = sp;
        }
      }
      return;
    }
    if (pendingAdd && drawAnchor) {
      setDrawCursor({ x: snap(e.point.x), z: snap(e.point.z) });
    }
  };

  const editable = mode === 'scene' && !pendingAdd;
  const selectedResource =
    mode === 'scene' && selectedResourceId
      ? (scene.resources.find((r) => r.id === selectedResourceId) ?? null)
      : null;
  const selectedMove =
    (mode === 'select' || mode === 'scene') && selectedMoveId
      ? (moves.find((m) => m.id === selectedMoveId) ?? null)
      : null;
  const previewRect = drawAnchor && drawCursor ? rectFromPoints(drawAnchor, drawCursor) : null;

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 4]}
        onClick={onGroundClick}
        onPointerMove={onGroundPointerMove}
        onPointerUp={endDrag}
      >
        <planeGeometry args={[130, 90]} />
        <meshStandardMaterial color="#232939" />
      </mesh>

      {mode === 'scene' && (
        <Grid
          position={[0, 0.02, 4]}
          args={[130, 90]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#323a54"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#3d476a"
          fadeDistance={400}
          fadeStrength={0}
          infiniteGrid={false}
          followCamera={false}
        />
      )}

      {scene.resources.map((r) => (
        <ResourceMesh
          key={r.id}
          scene={scene}
          resource={r}
          conflictActive={activeConflictResourceIds.has(r.id)}
          selected={mode === 'scene' && r.id === selectedResourceId}
          hovered={mode === 'scene' && r.id === hoveredResourceId}
          onSelect={
            editable
              ? (e) => {
                  if (e.delta > 4) return; // ignore orbit/edit drags
                  e.stopPropagation();
                  selectResource(r.id);
                }
              : undefined
          }
          onDragStart={
            editable && r.id === selectedResourceId
              ? (e) => {
                  e.stopPropagation();
                  beginDrag({
                    kind: 'move',
                    id: r.id,
                    start: { x: e.point.x, z: e.point.z },
                    startRect: { ...r.rect },
                    last: null,
                  });
                }
              : undefined
          }
          onHoverChange={
            mode === 'scene'
              ? (hovering) =>
                  setHoveredResourceId((prev) => (hovering ? r.id : prev === r.id ? null : prev))
              : undefined
          }
        />
      ))}

      {guides.map((g) => (
        <Line
          key={`${g.axis}-${g.value}`}
          points={
            g.axis === 'x'
              ? [
                  [g.value, 0.05, GROUND.minZ],
                  [g.value, 0.05, GROUND.maxZ],
                ]
              : [
                  [GROUND.minX, 0.05, g.value],
                  [GROUND.maxX, 0.05, g.value],
                ]
          }
          color="#9db8ff"
          lineWidth={1.5}
        />
      ))}

      {editable && selectedResource && (
        <mesh
          position={[
            selectedResource.rect.x + selectedResource.rect.w,
            0.35,
            selectedResource.rect.z + selectedResource.rect.d,
          ]}
          onPointerDown={(e) => {
            e.stopPropagation();
            beginDrag({
              kind: 'resize',
              id: selectedResource.id,
              min: { x: selectedResource.rect.x, z: selectedResource.rect.z },
              last: null,
            });
          }}
        >
          <boxGeometry args={[0.9, 0.6, 0.9]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      )}

      {previewRect && (
        <mesh
          position={[
            previewRect.x + Math.max(previewRect.w, 0.1) / 2,
            0.15,
            previewRect.z + Math.max(previewRect.d, 0.1) / 2,
          ]}
        >
          <boxGeometry args={[Math.max(previewRect.w, 0.1), 0.3, Math.max(previewRect.d, 0.1)]} />
          <meshBasicMaterial
            color={pendingAdd === 'connector' ? '#e8c34a' : '#7aa2ff'}
            transparent
            opacity={0.35}
          />
        </mesh>
      )}

      <Blocks blocks={scene.blocks ?? []} />

      {moves.map((m) => (
        <group key={m.id}>
          <PathLine scene={scene} move={m} selected={m.id === selectedMoveId} />
          <MoveActors scene={scene} move={m} t={playhead} />
        </group>
      ))}

      {selectedMove &&
        selectedMove.path.map((p, i) => (
          <mesh
            key={i}
            position={[p.x, 0.6, p.z]}
            onPointerDown={(e) => {
              e.stopPropagation();
              beginDrag({ kind: 'waypoint', moveId: selectedMove.id, index: i, last: null });
            }}
          >
            <sphereGeometry args={[0.6, 12, 12]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.9} />
          </mesh>
        ))}

      {draftPath.length > 0 && (
        <group>
          {draftPath.length >= 2 && (
            <Line
              points={draftPath.map((p) => new Vector3(p.x, 0.6, p.z))}
              color="#ffffff"
              lineWidth={3}
            />
          )}
          {draftPath.map((p, i) => (
            <mesh key={i} position={[p.x, 0.6, p.z]}>
              <sphereGeometry args={[0.5, 10, 10]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

export default function Viewport3D({
  conflicts,
  violations = [],
}: {
  conflicts: Conflict[];
  violations?: RuleViolation[];
}) {
  const viewMode = useVisSim((s) => s.viewMode);
  const pendingAdd = useVisSim((s) => s.pendingAdd);

  return (
    <Canvas shadows={false} style={{ cursor: pendingAdd ? 'crosshair' : 'default' }}>
      <color attach="background" args={['#161a24']} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[30, 50, 20]} intensity={1.1} />
      <Playback />

      {viewMode === '3d' && <PerspectiveCamera makeDefault position={[0, 52, 58]} fov={45} />}
      {viewMode === 'top' && (
        <OrthographicCamera
          makeDefault
          position={[0, 120, 4]}
          up={[0, 0, -1]}
          zoom={9}
          near={0.1}
          far={600}
        />
      )}
      {viewMode === 'iso' && (
        <OrthographicCamera makeDefault position={[90, 90, 90]} zoom={9} near={0.1} far={600} />
      )}

      <SceneBody conflicts={conflicts} violations={violations} />

      <OrbitControls
        key={viewMode}
        makeDefault
        enableRotate={viewMode === '3d'}
        maxPolarAngle={Math.PI / 2.2}
        target={viewMode === 'top' ? [0, 0, 4] : [0, 0, 0]}
      />
    </Canvas>
  );
}
