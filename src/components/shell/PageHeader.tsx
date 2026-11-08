import s from "./PageHeader.module.css";

/** Page title with an (i) button: the page description appears in a small pop-up on hover, focus or tap. */
export default function PageHeader({ title, sub, actions, crumbs }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; crumbs?: React.ReactNode }) {
  return (
    <header className={s.head}>
      <div className={s.l}>
        {crumbs && <div className={s.crumbs}>{crumbs}</div>}
        <h1>
          {title}
          {sub && (
            <span className={s.info}>
              <button type="button" className={s.i} aria-label="About this page">i</button>
              <span className={s.pop} role="tooltip">{sub}</span>
            </span>
          )}
        </h1>
      </div>
      {actions && <div className={s.r}>{actions}</div>}
    </header>
  );
}
