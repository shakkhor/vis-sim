import { useEffect, useRef } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Inline confirm dialog (PRD §4: delete confirms are inline dialogs, never
 * browser `confirm()`). Fully controlled: the parent owns `open` and both
 * outcome callbacks. Keyboard: Escape cancels, Enter confirms, and the
 * confirm button autofocuses on open (focus trap-lite — enough to keep the
 * keyboard in the dialog for the common path without a full focus cage).
 * Newlines in `body` render as line breaks (`white-space: pre-line`).
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="dialog-overlay"
      onClick={onCancel}
      onKeyDown={(e) => {
        // stopPropagation keeps dialog keys away from the global shortcut
        // listener (Escape would otherwise also fire the layered scene exit).
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        } else if (e.key === 'Enter') {
          e.stopPropagation();
          // A focused button handles Enter natively as a click (so Enter on
          // Cancel cancels); only confirm when Enter lands anywhere else.
          if (!(e.target instanceof HTMLButtonElement)) {
            e.preventDefault();
            onConfirm();
          }
        }
      }}
    >
      <div
        className="dialog-card"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>
        <p className="dialog-body">{body}</p>
        <div className="dialog-actions">
          <button onClick={onCancel}>Cancel</button>
          <button ref={confirmRef} className="danger-solid" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
