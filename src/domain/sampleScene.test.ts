import { describe, expect, it } from 'vitest';
import { SAMPLE_SCENE } from './sampleScene';
import type { Rect } from './types';

const blocks = SAMPLE_SCENE.blocks ?? [];
const connectors = SAMPLE_SCENE.resources.filter((r) => r.kind === 'connector');

/** Strict-inequality overlap: rects that merely share an edge do not overlap. */
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;

describe('stadium blocks', () => {
  it('defines blocks with unique ids', () => {
    expect(blocks.length).toBeGreaterThan(0);
    expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length);
  });

  it('gives every block a finite, positive footprint and height', () => {
    for (const b of blocks) {
      expect(Number.isFinite(b.rect.x), `${b.id} x is finite`).toBe(true);
      expect(Number.isFinite(b.rect.z), `${b.id} z is finite`).toBe(true);
      for (const [label, value] of [
        ['w', b.rect.w],
        ['d', b.rect.d],
        ['height', b.height],
      ] as const) {
        expect(Number.isFinite(value), `${b.id} ${label} is finite`).toBe(true);
        expect(value, `${b.id} ${label} is positive`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps ground-level block footprints clear of every connector', () => {
    for (const b of blocks) {
      if ((b.y ?? 0) > 0) continue; // elevated blocks (the gate lintel) may span connectors
      for (const c of connectors) {
        expect(overlaps(b.rect, c.rect), `${b.id} intersects ${c.id}`).toBe(false);
      }
    }
  });
});
