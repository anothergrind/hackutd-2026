import s from "./PageHeader.module.css";

export default function PageHeader({ title, sub, actions, crumbs }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; crumbs?: React.ReactNode }) {
  return (
    <header className={`${s.head} console-head`}>
      <div className={s.l}>
        {crumbs && <div className={s.crumbs}>{crumbs}</div>}
        <h1>{title}</h1>
        {sub && <p className={s.sub}>{sub}</p>}
      </div>
      {actions && <div className={s.r}>{actions}</div>}
    </header>
  );
}
