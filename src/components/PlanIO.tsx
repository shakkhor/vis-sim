// Export/import toolbar: serializes the current plan to a versioned JSON file and
// loads moves back from one. v0 imports moves only — the scene stays fixed, so we
// reject documents exported against a different scene.
import { useEffect, useRef, useState } from 'react';
import { useVisSim } from '../state/store';
import {
  deserializePlan,
  PLAN_FORMAT_VERSION,
  serializePlan,
  SerializationError,
} from '../domain/serialization';
import type { PlanDocument } from '../domain/serialization';

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'plan';
}

export default function PlanIO() {
  const scene = useVisSim((s) => s.scene);
  const moves = useVisSim((s) => s.moves);
  const planName = useVisSim((s) => s.planName);
  const loadMoves = useVisSim((s) => s.loadMoves);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => clearTimeout(errorTimerRef.current), []);

  const showError = (message: string) => {
    setError(message);
    clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), 8000);
  };

  const handleExport = () => {
    const doc: PlanDocument = {
      formatVersion: PLAN_FORMAT_VERSION,
      scene,
      moves,
      meta: { name: planName, exportedAt: new Date().toISOString() },
    };
    const blob = new Blob([serializePlan(doc)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slugify(planName)}.vissim.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    let doc: PlanDocument;
    try {
      doc = deserializePlan(await file.text());
    } catch (err) {
      if (err instanceof SerializationError) {
        showError(`Import failed — ${err.message}`);
      } else {
        showError('Import failed — could not read the file.');
      }
      return;
    }
    if (doc.scene.id !== scene.id) {
      showError(
        `Import failed — this plan was exported for scene '${doc.scene.name}', ` +
          `but the current scene is '${scene.name}'. Moves reference zones of their own scene.`,
      );
      return;
    }
    setError(null);
    clearTimeout(errorTimerRef.current);
    loadMoves(doc.moves);
  };

  return (
    <div className="planio">
      <button title="Export plan as JSON" onClick={handleExport}>
        Export
      </button>
      <button title="Import a plan JSON file" onClick={() => fileInputRef.current?.click()}>
        Import
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void handleFile(file);
        }}
      />
      {error && (
        <div role="alert" className="planio-error">
          {error}
        </div>
      )}
    </div>
  );
}
