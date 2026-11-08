import s from "./MathTip.module.css";

/** Wraps a number; hovering or focusing it shows how it was calculated, line by line. */
export default function MathTip({ lines, children }: { lines: (string | null | false | undefined)[]; children: React.ReactNode }) {
  const rows = lines.filter(Boolean) as string[];
  if (!rows.length) return <>{children}</>;
  return (
    <span className={s.wrap} tabIndex={0}>
      <span className={s.value}>{children}</span>
      <span className={s.pop} role="tooltip">
        <b>How this is calculated</b>
        {rows.map((r) => <span key={r}>{r}</span>)}
      </span>
    </span>
  );
}
