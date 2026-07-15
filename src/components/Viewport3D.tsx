import { useMemo, useRef } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import { Vector3 } from 'three';
import { useVisSim } from '../state/store';
import { teamColor } from '../domain/scene';
import { pathLength, pointAlong } from '../domain/engine';
import type { Conflict, Move, Resource, SceneDef } from '../domain/types';

function ResourceMesh({
  scene,
  resource,
  conflictActive,
}: {
  scene: SceneDef;
  resource: Resource;
  conflictActive: boolean;
}) {
  const { rect, kind } = resource;
  const color = kind === 'connector' ? '#e8c34a' : teamColor(scene, resource.ownerTeamIds[0]);
  return (
    <group position={[rect.x + rect.w / 2, 0, rect.z + rect.d / 2]}>
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[rect.w, 0.3, rect.d]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={kind === 'connector' ? 0.55 : 0.28}
        />
      </mesh>
      {conflictActive && (
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[rect.w + 0.6, 0.3, rect.d + 0.6]} />
          <meshStandardMaterial color="#ff3b3b" transparent opacity={0.55} />
        </mesh>
      )}
      <Html center distanceFactor={90} position={[0, 1.4, 0]} style={{ pointerEvents: 'none' }}>
        <div className="zone-label">{resource.name}</div>
      </Html>
    </group>
  );
}

function GatePillars() {
  return (
    <group>
      {[-4.5, 4.5].map((x) => (
        <mesh key={x} position={[x, 2.5, 11]}>
          <boxGeometry args={[1, 5, 6]} />
          <meshStandardMaterial color="#5a6478" />
        </mesh>
      ))}
      <mesh position={[0, 5.2, 11]}>
        <boxGeometry args={[10, 0.8, 6]} />
        <meshStandardMaterial color="#5a6478" />
      </mesh>
    </group>
  );
}

function Stands() {
  const steps = [0, 1, 2, 3];
  return (
    <group>
      {steps.map((i) => (
        <mesh key={`d${i}`} position={[16, 0.75 + i * 1.5, -10.5 - i * 2.5]}>
          <boxGeometry args={[28, 1.5, 2.5]} />
          <meshStandardMaterial color={i % 2 ? '#3d4660' : '#46506e'} />
        </mesh>
      ))}
      {steps.map((i) => (
        <mesh key={`c${i}`} position={[-16, 0.75 + i * 1.5, -10.5 - i * 2.5]}>
          <boxGeometry args={[28, 1.5, 2.5]} />
          <meshStandardMaterial color={i % 2 ? '#3d4660' : '#46506e'} />
        </mesh>
      ))}
      <mesh position={[0, 0.05, -32]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[70, 22]} />
        <meshStandardMaterial color="#2e7d4f" />
      </mesh>
    </group>
  );
}

/** Actors of one move at the current playhead, staggered along the window. */
function MoveActors({ scene, move, t }: { scene: SceneDef; move: Move; t: number }) {
  const total = useMemo(() => pathLength(move.path), [move.path]);
  const dur = move.tEnd - move.tStart;
  if (t < move.tStart || t > move.tEnd || total === 0 || dur <= 0) return null;

  const isCohort = move.actorKind === 'cohort';
  const dots = isCohort ? 24 : Math.min(move.count, 8);
  const staggerSpan = isCohort ? 0.6 : 0.1;
  const travelSpan = 1 - staggerSpan;
  const elapsed = (t - move.tStart) / dur;
  const color = teamColor(scene, move.teamId);

  const items: { x: number; z: number; key: number }[] = [];
  for (let i = 0; i < dots; i++) {
    const offset = dots > 1 ? (i / (dots - 1)) * staggerSpan : 0;
    const frac = (elapsed - offset) / travelSpan;
    if (frac < 0 || frac > 1) continue;
    const p = pointAlong(move.path, frac * total);
    items.push({ x: p.x, z: p.z, key: i });
  }

  return (
    <group>
      {items.map((p) =>
        move.actorKind === 'vehicle' ? (
          <mesh key={p.key} position={[p.x, 0.8, p.z]}>
            <boxGeometry args={[2.2, 1.4, 1.2]} />
            <meshStandardMaterial color={color} />
          </mesh>
        ) : (
          <mesh key={p.key} position={[p.x, 0.7, p.z]}>
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

export default function Viewport3D({ conflicts }: { conflicts: Conflict[] }) {
  const scene = useVisSim((s) => s.scene);
  const moves = useVisSim((s) => s.moves);
  const playhead = useVisSim((s) => s.playhead);
  const mode = useVisSim((s) => s.mode);
  const draftPath = useVisSim((s) => s.draftPath);
  const addDraftPoint = useVisSim((s) => s.addDraftPoint);
  const selectedMoveId = useVisSim((s) => s.selectedMoveId);
  const groundRef = useRef(null);

  const activeConflictResourceIds = useMemo(
    () =>
      new Set(
        conflicts.filter((c) => playhead >= c.t0 && playhead <= c.t1).map((c) => c.resourceId),
      ),
    [conflicts, playhead],
  );

  const onGroundClick = (e: ThreeEvent<MouseEvent>) => {
    if (mode !== 'draw') return;
    if (e.delta > 4) return; // ignore orbit drags
    e.stopPropagation();
    addDraftPoint({ x: Math.round(e.point.x * 2) / 2, z: Math.round(e.point.z * 2) / 2 });
  };

  return (
    <Canvas camera={{ position: [0, 52, 58], fov: 45 }} shadows={false}>
      <color attach="background" args={['#161a24']} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[30, 50, 20]} intensity={1.1} />
      <Playback />

      <mesh
        ref={groundRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 4]}
        onClick={onGroundClick}
      >
        <planeGeometry args={[130, 90]} />
        <meshStandardMaterial color="#232939" />
      </mesh>

      {scene.resources.map((r) => (
        <ResourceMesh
          key={r.id}
          scene={scene}
          resource={r}
          conflictActive={activeConflictResourceIds.has(r.id)}
        />
      ))}
      <GatePillars />
      <Stands />

      {moves.map((m) => (
        <group key={m.id}>
          <PathLine scene={scene} move={m} selected={m.id === selectedMoveId} />
          <MoveActors scene={scene} move={m} t={playhead} />
        </group>
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

      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.2} />
    </Canvas>
  );
}
