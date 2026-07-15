import { describe, expect, it } from 'vitest';
import { INITIAL_MOVES, SAMPLE_SCENE } from './sampleScene';
import { deserializePlan, SerializationError, serializePlan } from './serialization';
import type { PlanDocument } from './serialization';
import type { Block, Rule } from './types';

const baseDoc: PlanDocument = {
  formatVersion: 1,
  scene: SAMPLE_SCENE,
  moves: INITIAL_MOVES,
  meta: { name: 'Gate 7 rehearsal', exportedAt: '2026-07-15T09:00:00.000Z' },
};

/** Clone the base document, apply a mutation, and return its JSON. */
const mutated = (mutate: (doc: PlanDocument) => void): string => {
  const doc = structuredClone(baseDoc);
  mutate(doc);
  return serializePlan(doc);
};

/** Escape hatch for mutations the domain types forbid. */
const loosen = (value: object): Record<string, unknown> => value as Record<string, unknown>;

describe('round-trip', () => {
  it('serialize → deserialize is lossless for the sample plan', () => {
    const restored = deserializePlan(serializePlan(baseDoc));
    expect(restored).toEqual(baseDoc);
  });

  it('is stable across a second round-trip', () => {
    const once = deserializePlan(serializePlan(baseDoc));
    const twice = deserializePlan(serializePlan(once));
    expect(twice).toEqual(once);
    expect(serializePlan(twice)).toBe(serializePlan(once));
  });

  it('round-trips optional resource tags and omits them when absent', () => {
    const json = mutated((doc) => {
      doc.scene.resources[0].tags = ['clean', 'indoor'];
    });
    const restored = deserializePlan(json);
    expect(restored.scene.resources[0].tags).toEqual(['clean', 'indoor']);
    expect(restored.scene.resources[1].tags).toBeUndefined();
  });

  it('round-trips scene rules of both kinds and omits the key when absent', () => {
    const rules: Rule[] = [
      {
        id: 'rule-1',
        description: 'No vehicles in clean zones',
        kind: 'forbidden-entry',
        actorKinds: ['vehicle', 'material'],
        resourceTags: ['clean'],
      },
      {
        id: 'rule-2',
        description: 'Waste and clean flows never share sterile space',
        kind: 'separation',
        teamIdsA: [SAMPLE_SCENE.teams[0].id],
        teamIdsB: [SAMPLE_SCENE.teams[1].id],
        resourceTags: ['sterile'],
      },
    ];
    const json = mutated((doc) => {
      doc.scene.rules = rules;
    });
    const restored = deserializePlan(json);
    expect(restored.scene.rules).toEqual(rules);

    const bare = deserializePlan(mutated((doc) => delete doc.scene.rules));
    expect('rules' in bare.scene).toBe(false);
  });

  it('round-trips scene blocks including optional y/color and omits absent optionals', () => {
    const blocks: Block[] = [
      { id: 'block-1', kind: 'wall', rect: { x: 0, z: 0, w: 10, d: 0.5 }, height: 3 },
      {
        id: 'block-2',
        kind: 'slab',
        rect: { x: 2, z: 2, w: 4, d: 4 },
        height: 0.2,
        y: 3,
        color: '#8899aa',
      },
    ];
    const json = mutated((doc) => {
      doc.scene.blocks = blocks;
    });
    const restored = deserializePlan(json);
    expect(restored.scene.blocks).toEqual(blocks);
    expect(restored.scene.blocks?.[0]).not.toHaveProperty('y');
    expect(restored.scene.blocks?.[0]).not.toHaveProperty('color');

    const bare = deserializePlan(mutated((doc) => delete doc.scene.blocks));
    expect('blocks' in bare.scene).toBe(false);
  });
});

describe('format version', () => {
  it('rejects documents with no formatVersion', () => {
    const json = mutated((doc) => {
      delete loosen(doc).formatVersion;
    });
    expect(() => deserializePlan(json)).toThrow(SerializationError);
    expect(() => deserializePlan(json)).toThrow(/formatVersion: missing/);
  });

  it('rejects a wrong formatVersion value', () => {
    const json = mutated((doc) => {
      loosen(doc).formatVersion = '1';
    });
    expect(() => deserializePlan(json)).toThrow(SerializationError);
    expect(() => deserializePlan(json)).toThrow(/formatVersion: expected 1/);
  });

  // Forward-compat note: version 2 documents do not exist yet. When they do, this
  // build must fail loudly (naming the version) rather than half-import them —
  // migration logic belongs in the writer of version 2, not here.
  it('rejects formatVersion 2 with a clear unsupported-version error', () => {
    const json = mutated((doc) => {
      loosen(doc).formatVersion = 2;
    });
    expect(() => deserializePlan(json)).toThrow(SerializationError);
    expect(() => deserializePlan(json)).toThrow(/formatVersion: unsupported version 2/);
  });
});

describe('structural validation', () => {
  it('rejects input that is not valid JSON', () => {
    expect(() => deserializePlan('{not json')).toThrow(SerializationError);
    expect(() => deserializePlan('{not json')).toThrow(/document: invalid JSON/);
  });

  it('rejects a non-object root', () => {
    expect(() => deserializePlan('[]')).toThrow(/document: expected object/);
  });

  it('rejects non-array moves', () => {
    const json = mutated((doc) => {
      loosen(doc).moves = 'not-moves';
    });
    expect(() => deserializePlan(json)).toThrow(SerializationError);
    expect(() => deserializePlan(json)).toThrow(/moves: expected array/);
  });

  it('rejects a move whose window ends before it starts', () => {
    const json = mutated((doc) => {
      doc.moves[1].tEnd = doc.moves[1].tStart - 5;
    });
    expect(() => deserializePlan(json)).toThrow(SerializationError);
    expect(() => deserializePlan(json)).toThrow(/moves\[1\]\.tEnd: expected value greater than/);
  });

  it('rejects a zero-length move window (tEnd === tStart)', () => {
    const json = mutated((doc) => {
      doc.moves[0].tEnd = doc.moves[0].tStart;
    });
    expect(() => deserializePlan(json)).toThrow(/moves\[0\]\.tEnd/);
  });

  it('rejects a move whose path has fewer than 2 points', () => {
    const json = mutated((doc) => {
      doc.moves[0].path = [{ x: 0, z: 0 }];
    });
    expect(() => deserializePlan(json)).toThrow(SerializationError);
    expect(() => deserializePlan(json)).toThrow(/moves\[0\]\.path: expected at least 2 points/);
  });

  it('rejects a path point with a non-numeric coordinate', () => {
    const json = mutated((doc) => {
      loosen(doc.moves[0].path[1]).x = 'east';
    });
    expect(() => deserializePlan(json)).toThrow(/moves\[0\]\.path\[1\]\.x: expected finite number/);
  });

  it('rejects a resource rect with a missing field', () => {
    const json = mutated((doc) => {
      delete loosen(doc.scene.resources[0].rect).w;
    });
    expect(() => deserializePlan(json)).toThrow(SerializationError);
    expect(() => deserializePlan(json)).toThrow(
      /scene\.resources\[0\]\.rect\.w: expected finite number/,
    );
  });

  it('rejects a resource rect with a non-positive size', () => {
    const json = mutated((doc) => {
      doc.scene.resources[2].rect.d = -4;
    });
    expect(() => deserializePlan(json)).toThrow(
      /scene\.resources\[2\]\.rect\.d: expected positive depth/,
    );
  });

  it('rejects a non-string resource tag', () => {
    const json = mutated((doc) => {
      loosen(doc.scene.resources[0]).tags = ['clean', 7];
    });
    expect(() => deserializePlan(json)).toThrow(SerializationError);
    expect(() => deserializePlan(json)).toThrow(
      /scene\.resources\[0\]\.tags\[1\]: expected string/,
    );
  });

  it('rejects an unknown resource kind', () => {
    const json = mutated((doc) => {
      loosen(doc.scene.resources[0]).kind = 'portal';
    });
    expect(() => deserializePlan(json)).toThrow(/scene\.resources\[0\]\.kind: expected one of/);
  });

  it('rejects malformed meta', () => {
    const json = mutated((doc) => {
      loosen(doc.meta).name = 42;
    });
    expect(() => deserializePlan(json)).toThrow(/meta\.name: expected string/);
  });

  it('rejects an unknown rule kind', () => {
    const json = mutated((doc) => {
      loosen(doc.scene).rules = [
        { id: 'rule-1', description: 'bad', kind: 'curfew', resourceTags: [] },
      ];
    });
    expect(() => deserializePlan(json)).toThrow(SerializationError);
    expect(() => deserializePlan(json)).toThrow(
      /scene\.rules\[0\]\.kind: expected one of forbidden-entry \| separation/,
    );
  });

  it('rejects a forbidden-entry rule with a bad actor kind', () => {
    const json = mutated((doc) => {
      loosen(doc.scene).rules = [
        {
          id: 'rule-1',
          description: 'bad',
          kind: 'forbidden-entry',
          actorKinds: ['vehicle', 'drone'],
          resourceTags: ['clean'],
        },
      ];
    });
    expect(() => deserializePlan(json)).toThrow(
      /scene\.rules\[0\]\.actorKinds\[1\]: expected one of/,
    );
  });

  it('rejects a separation rule missing its team lists', () => {
    const json = mutated((doc) => {
      loosen(doc.scene).rules = [
        { id: 'rule-1', description: 'bad', kind: 'separation', resourceTags: [] },
      ];
    });
    expect(() => deserializePlan(json)).toThrow(/scene\.rules\[0\]\.teamIdsA: expected array/);
  });

  it('rejects non-array rules', () => {
    const json = mutated((doc) => {
      loosen(doc.scene).rules = 'no-rules';
    });
    expect(() => deserializePlan(json)).toThrow(/scene\.rules: expected array/);
  });

  it('rejects a block with a non-positive height', () => {
    const json = mutated((doc) => {
      loosen(doc.scene).blocks = [
        { id: 'block-1', kind: 'wall', rect: { x: 0, z: 0, w: 10, d: 0.5 }, height: 0 },
      ];
    });
    expect(() => deserializePlan(json)).toThrow(SerializationError);
    expect(() => deserializePlan(json)).toThrow(
      /scene\.blocks\[0\]\.height: expected positive height/,
    );
  });

  it('rejects a block with an unknown kind', () => {
    const json = mutated((doc) => {
      loosen(doc.scene).blocks = [
        { id: 'block-1', kind: 'ramp', rect: { x: 0, z: 0, w: 2, d: 2 }, height: 1 },
      ];
    });
    expect(() => deserializePlan(json)).toThrow(
      /scene\.blocks\[0\]\.kind: expected one of wall \| pillar \| box \| slab/,
    );
  });

  it('rejects a block whose rect has a non-positive size', () => {
    const json = mutated((doc) => {
      loosen(doc.scene).blocks = [
        { id: 'block-1', kind: 'box', rect: { x: 0, z: 0, w: -2, d: 2 }, height: 1 },
      ];
    });
    expect(() => deserializePlan(json)).toThrow(/scene\.blocks\[0\]\.rect\.w: expected positive/);
  });

  it('rejects non-array blocks', () => {
    const json = mutated((doc) => {
      loosen(doc.scene).blocks = { 'block-1': {} };
    });
    expect(() => deserializePlan(json)).toThrow(SerializationError);
    expect(() => deserializePlan(json)).toThrow(/scene\.blocks: expected array/);
  });
});

describe('team references', () => {
  it('rejects a move executed by an unknown team', () => {
    const json = mutated((doc) => {
      doc.moves[1].teamId = 'ghostTeam';
    });
    expect(() => deserializePlan(json)).toThrow(SerializationError);
    expect(() => deserializePlan(json)).toThrow(/moves\[1\]\.teamId: unknown teamId 'ghostTeam'/);
  });

  it('rejects a resource owned by an unknown team', () => {
    const json = mutated((doc) => {
      doc.scene.resources[1].ownerTeamIds[1] = 'ghostTeam';
    });
    expect(() => deserializePlan(json)).toThrow(
      /scene\.resources\[1\]\.ownerTeamIds\[1\]: unknown teamId 'ghostTeam'/,
    );
  });

  it('rejects an unknown scene authorTeamId', () => {
    const json = mutated((doc) => {
      doc.scene.authorTeamId = 'ghostTeam';
    });
    expect(() => deserializePlan(json)).toThrow(/scene\.authorTeamId: unknown teamId 'ghostTeam'/);
  });
});
