import Icon, { type IconName } from "@/components/ui/Icon";
import type { Stage } from "@/lib/view";
import s from "./Stepper.module.css";

const ICON: Record<Stage["key"], IconName> = { signal: "zap", investigate: "radar", price: "scale", approve: "inbox", fixed: "badge" };

/** Five steps of the workflow. Clickable during a run; the current one is raised. */
export default function Stepper({ stages, live, current, onPick }: { stages: Stage[]; live: boolean; current?: number; onPick?: (i: number) => void }) {
  return (
    <ol className={s.steps}>
      {stages.map((st, i) => (
        <li key={st.key}>
          <button type="button" className={s.step} data-phase={live ? st.phase : "intro"} aria-current={current === i ? "step" : undefined} disabled={!onPick} onClick={() => onPick?.(i)}>
            <span className={s.ico}><Icon name={ICON[st.key]} size={15} /></span>
            <span className={s.txt}>
              <b><i>{i + 1}</i>{st.title}</b>
              <em>{live && st.phase !== "idle" ? st.live : st.idle}</em>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
