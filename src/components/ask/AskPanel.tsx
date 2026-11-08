"use client";

import { useEffect, useRef, useState } from "react";
import SidePanel from "@/components/ui/SidePanel";
import Icon from "@/components/ui/Icon";
import Md from "@/components/ui/Md";
import { api } from "@/lib/client";
import s from "./AskPanel.module.css";

type Turn = { q: string; a: string; via?: string };
const SUGGESTED = [
  "Which building is riskiest right now?",
  "What should I approve first tonight?",
  "How much are we saving by repairing early?",
  "Which buildings have nothing to worry about?",
];

/** Ask Canary: questions about the portfolio, answered by Nemotron from the live data. */
export default function AskPanel({ onClose }: { onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, busy]);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setBusy(true); setErr(""); setQ("");
    try {
      const r = await api<{ answer: string; via: string }>("/api/ask", { method: "POST", json: { question, history: turns.slice(-3) } });
      setTurns((t) => [...t, { q: question, a: r.answer, via: r.via }]);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setQ(question); }
    finally { setBusy(false); }
  }

  return (
    <SidePanel eyebrow="Ask Canary" label="Ask Canary" onClose={onClose}
      footer={
        <form className={s.form} onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
          <textarea ref={input} className="input" rows={1} value={q} placeholder="Ask about your buildings, incidents or costs…" onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(q); } }} />
          <button type="submit" className="btn accent" disabled={busy || !q.trim()}><Icon name="arrow-right" size={15} />Ask</button>
        </form>
      }>
      <div className={s.body}>
        <header className={s.head}>
          <h2>What would you like to know?</h2>
          <p>Answers come from Nemotron, using your live buildings, incidents and approvals.</p>
        </header>
        {!turns.length && !busy && (
          <ul className={s.suggest}>
            {SUGGESTED.map((x) => <li key={x}><button type="button" onClick={() => { void ask(x); }}>{x}<Icon name="arrow-right" size={14} /></button></li>)}
          </ul>
        )}
        <ol className={s.turns}>
          {turns.map((t, i) => (
            <li key={i}>
              <p className={s.q}>{t.q}</p>
              <p className={s.a}><Md text={t.a} /></p>
              {t.via && <span className={s.via}>{t.via === "gpu" ? "Nemotron Nano 9B on our Brev GPU" : "Nemotron, hosted by NVIDIA"}</span>}
            </li>
          ))}
          {busy && <li><p className={s.thinking}><i /><i /><i />Checking the portfolio</p></li>}
        </ol>
        {err && <p className="c-err">{err}</p>}
        <div ref={end} />
      </div>
    </SidePanel>
  );
}
