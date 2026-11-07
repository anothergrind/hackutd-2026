import Icon, { type IconName } from "@/components/ui/Icon";
import type { Stage } from "@/lib/view";
import s from "./Stepper.module.css";

const ICON: Record<string, IconName> = { signal: "zap", investigate: "radar", price: "scale", approve: "inbox", fixed: "badge" };

/** The product in five steps. With no run it explains; during a run each step lights up with its live result. */
export default function Stepper({ stages, live }: { stages: Stage[]; live: boolean }) {
  return (
    <ol className={s.steps}>
      {stages.map((st, i) => (
        <li key={st.key} className={s.step} data-phase={live ? st.phase : "intro"}>
          <div className={s.top}>
            <span className={s.ico}><Icon name={ICON[st.key]} size={16} /></span>
            <span className={s.num}>{i + 1}</span>
            <b>{st.title}</b>
          </div>
          <p>{live && st.phase !== "idle" ? st.live : st.idle}</p>
        </li>
      ))}
    </ol>
  );
}
