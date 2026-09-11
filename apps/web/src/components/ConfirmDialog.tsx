import { useEffect, useRef } from "react";
import type { ConfirmationPrompt } from "../simulator-context";

export function ConfirmDialog({ prompt, onConfirm, onCancel }: { prompt?: ConfirmationPrompt; onConfirm(): void; onCancel(): void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!prompt) return;
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, prompt]);
  if (!prompt) return null;
  return <div className="modal-backdrop confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message"><span className="confirm-dialog__mark">!</span><h2 id="confirm-title">{prompt.title}</h2><p id="confirm-message">{prompt.message}</p><div className="confirm-dialog__actions"><button className="button button--quiet" onClick={onCancel}>Cancel</button><button ref={confirmRef} className={`button ${prompt.danger ? "button--danger" : "button--signal"}`} onClick={onConfirm}>{prompt.confirmLabel ?? "Confirm"}</button></div></section></div>;
}
