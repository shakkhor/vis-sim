import { useEffect } from 'react';
import { useVisSim } from '../state/store';

/** True when the event originates from a form control or editable region. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Global keyboard shortcuts. Reads the store imperatively via `getState()`
 * so the listener registers once and never goes stale.
 *
 * - Space: play/pause
 * - Escape: cancel draw (clear draft, back to select)
 * - 1 / 2 / 3: view mode 3d / top / iso
 * - Delete / Backspace: delete selected move
 */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      const state = useVisSim.getState();

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          state.togglePlay();
          break;
        case 'Escape':
          if (state.mode === 'draw') {
            state.clearDraft();
            state.setMode('select');
          }
          break;
        case 'Digit1':
          state.setViewMode('3d');
          break;
        case 'Digit2':
          state.setViewMode('top');
          break;
        case 'Digit3':
          state.setViewMode('iso');
          break;
        case 'Delete':
        case 'Backspace':
          if (state.selectedMoveId) {
            state.deleteMove(state.selectedMoveId);
          }
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
