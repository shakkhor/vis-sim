import { useEffect } from 'react';
import { nextLeftRail, useVisSim } from '../state/store';

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
 * - Escape: layered cancel — team focus clears first (any mode); then
 *   draw: clear draft + back to select;
 *   scene: disarm add tool, else clear selection, else back to select (PRD §4)
 * - V / M / E: tools — select / draw move / edit scene (M and E toggle back to select)
 * - 1 / 2 / 3: view mode 3d / top / iso
 * - [ : cycle left tool rail (expanded → slim → hidden); ] : right panel; \ : bottom panel
 * - Delete / Backspace: delete selected resource (scene mode) or selected move
 * - Ctrl/Cmd+Z: undo; Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y: redo
 * - Ctrl/Cmd+D (scene mode): duplicate selected resource
 */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      const state = useVisSim.getState();

      // Modifier chords (check metaKey for mac, ctrlKey elsewhere).
      if (e.metaKey || e.ctrlKey) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            state.redo();
          } else {
            state.undo();
          }
          return;
        }
        if (key === 'y') {
          e.preventDefault();
          state.redo();
          return;
        }
        if (key === 'd' && state.mode === 'scene') {
          // preventDefault: Ctrl/Cmd+D would otherwise bookmark the page.
          e.preventDefault();
          state.duplicateSelectedResource();
          return;
        }
      }

      // Unhandled modifier chords (browser shortcuts) must not trip plain keys.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          state.togglePlay();
          break;
        case 'Escape':
          // "View as team" focus is the outermost layer: exit it before any
          // pendingAdd/selection/mode handling, regardless of mode.
          if (state.focusTeamId) {
            state.setFocusTeam(null);
            break;
          }
          if (state.mode === 'draw') {
            state.clearDraft();
            state.setMode('select');
          } else if (state.mode === 'scene') {
            // Layered exit (PRD §4): armed tool → selection → mode.
            if (state.pendingAdd) {
              state.setPendingAdd(null);
            } else if (state.selectedResourceId) {
              state.selectResource(null);
            } else {
              state.setMode('select');
            }
          }
          break;
        case 'KeyV':
          state.setMode('select');
          break;
        case 'KeyM':
          state.toggleMode('draw');
          break;
        case 'KeyE':
          state.toggleMode('scene');
          break;
        case 'BracketLeft':
          state.setUi({ leftRail: nextLeftRail(state.ui.leftRail) });
          break;
        case 'BracketRight':
          state.setUi({ rightOpen: !state.ui.rightOpen });
          break;
        case 'Backslash':
          state.setUi({ bottomOpen: !state.ui.bottomOpen });
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
          // PRD US-6: in scene mode a selected resource takes precedence over a
          // selected move — deleting the thing the user is looking at.
          if (state.mode === 'scene' && state.selectedResourceId) {
            state.removeResource(state.selectedResourceId);
          } else if (state.selectedMoveId) {
            state.deleteMove(state.selectedMoveId);
          }
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
