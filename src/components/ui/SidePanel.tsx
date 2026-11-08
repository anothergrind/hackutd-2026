"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import s from "./SidePanel.module.css";

const OUT_MS = 220;

/** A panel that slides in from the right while the page behind is softly blurred.
 *  Closing (X, Esc or a click outside) plays the same fade and slide in reverse before it unmounts. */
export default function SidePanel({ eyebrow, label, onClose, onKey, footer, children }: {
  eyebrow?: React.ReactNode; label: string; onClose: () => void; onKey?: (e: KeyboardEvent) => void; footer?: React.ReactNode; children: React.ReactNode;
}) {
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = useCallback(() => {
    if (timer.current) return;
    setLeaving(true);
    timer.current = setTimeout(onClose, OUT_MS);
  }, [onClose]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); else onKey?.(e); };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [close, onKey]);
  return (
    <>
      <div className={s.scrim} data-leaving={leaving || undefined} onClick={close} />
      <aside className={`${s.panel} side-panel`} data-leaving={leaving || undefined} role="dialog" aria-label={label}>
        <header className={s.head}>
          <span className="eyebrow">{eyebrow}</span>
          <button type="button" className="ibtn" onClick={close} aria-label="Close"><Icon name="x" size={18} /></button>
        </header>
        <div className={s.body}>{children}</div>
        {footer && <footer className={s.foot}>{footer}</footer>}
      </aside>
    </>
  );
}
