"use client";

import { useEffect, useMemo, useState } from "react";

type Dashboard = {
  properties: { id: string; name: string; address: string; building_type: string }[];
  tickets: {
    id: string; building: string; floor: string; equipment: string; title: string;
    notes: string; urgency: number; risk_score: number; predicted_impact: string;
    status: string; reported_at: string;
  }[];
  energy: {
    id: string; zone: string; equipment: string; usage_kwh: number;
    baseline_kwh: number; anomaly_score: number;
  }[];
  incidents: {
    id: string; title: string; category: string; severity: string; probability: number;
    affected_zones: string[]; response_plan: string[]; status: string;
  }[];
};

const demoDashboard: Dashboard = {
  properties: [],
  tickets: [],
  energy: [],
  incidents: [],
};

export default function Home() {
  const [dashboard, setDashboard] = useState<Dashboard>(demoDashboard);
  const [activeView, setActiveView] = useState<"overview" | "tickets" | "energy" | "response">("overview");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/dashboard")
      .then(async (response) => {
        const result = (await response.json()) as Dashboard & { error?: string };
        if (!response.ok) throw new Error(result.error || "Could not load dashboard.");
        setDashboard(result);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const criticalTickets = useMemo(
    () => dashboard.tickets.filter((ticket) => ticket.risk_score >= 70).length,
    [dashboard.tickets],
  );
  const abnormalEnergy = useMemo(
    () => dashboard.energy.filter((reading) => reading.anomaly_score >= 60).length,
    [dashboard.energy],
  );

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">Zero Day · CBRE × NVIDIA</p>
          <h1>Property risk, before it spreads.</h1>
          <p className="intro">
            A commercial property intelligence cockpit that connects maintenance
            signals, energy anomalies, and catastrophe response into one action plan.
          </p>
        </div>
        <div className="hero-mark">NVIDIA<br /><span>Nemotron</span></div>
      </header>

      <nav className="tabs" aria-label="Dashboard views">
        {([
          ["overview", "Overview"], ["tickets", "Maintenance"], ["energy", "Energy"], ["response", "Response"]
        ] as const).map(([key, label]) => (
          <button className={activeView === key ? "active" : ""} key={key} onClick={() => setActiveView(key)}>
            {label}
          </button>
        ))}
      </nav>

      {error && <div className="error">Dashboard unavailable: {error}<br />Run the Supabase migrations and configure .env.local.</div>}

      {activeView === "overview" && (
        <>
          <section className="metric-grid">
            <Metric label="Properties monitored" value={dashboard.properties.length} detail="Portfolio coverage" />
            <Metric label="Escalation risks" value={criticalTickets} detail="Tickets scoring 70+" tone="warning" />
            <Metric label="Energy anomalies" value={abnormalEnergy} detail="Readings above threshold" tone="orange" />
            <Metric label="Predicted incidents" value={dashboard.incidents.length} detail="Nemotron-prioritized" tone="purple" />
          </section>
          <section className="split">
            <Panel title="Escalation radar" kicker="CBRE · Predict before it spreads">
              {dashboard.tickets.slice(0, 3).map((ticket) => <RiskRow key={ticket.id} ticket={ticket} />)}
              {!dashboard.tickets.length && <EmptyState />}
            </Panel>
            <Panel title="Nemotron action brief" kicker="NVIDIA · Beyond a chatbot">
              <div className="brief">
                <span className="signal">● LIVE ANALYSIS</span>
                <h3>Small signals are converging on the east wing.</h3>
                <p>Two Floor 4 tickets share AHU-04 and a 65-minute window. The model recommends dispatching a technician before water damage reaches Floor 5.</p>
                <button className="primary" onClick={() => setActiveView("response")}>Open response plan →</button>
              </div>
            </Panel>
          </section>
        </>
      )}

      {activeView === "tickets" && <TicketView tickets={dashboard.tickets} />}
      {activeView === "energy" && <EnergyView energy={dashboard.energy} />}
      {activeView === "response" && <ResponseView incidents={dashboard.incidents} />}

      <footer>Built for <strong>CBRE: Predict Before It Spreads</strong> + <strong>NVIDIA: Use Nemotron Beyond a Chatbot</strong></footer>
    </main>
  );
}

function Metric({ label, value, detail, tone = "" }: { label: string; value: number; detail: string; tone?: string }) {
  return <div className={`metric ${tone}`}><p>{label}</p><strong>{value}</strong><span>{detail}</span></div>;
}

function Panel({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) {
  return <section className="panel"><p className="kicker">{kicker}</p><h2>{title}</h2>{children}</section>;
}

function RiskRow({ ticket }: { ticket: Dashboard["tickets"][number] }) {
  return <article className="risk-row"><div><span className={`badge ${ticket.risk_score >= 70 ? "high" : "medium"}`}>{ticket.risk_score >= 70 ? "HIGH RISK" : "MONITOR"}</span><h3>{ticket.title}</h3><p>{ticket.building} · {ticket.floor} · {ticket.equipment}</p></div><strong>{ticket.risk_score}<small>/100</small></strong></article>;
}

function TicketView({ tickets }: { tickets: Dashboard["tickets"] }) {
  return <Panel title="Maintenance escalation queue" kicker="Connected by building · floor · equipment · time"><div className="table">{tickets.map((ticket) => <div className="table-row" key={ticket.id}><div><span className="badge high">{ticket.risk_score} RISK</span><h3>{ticket.title}</h3><p>{ticket.notes}</p></div><div><b>{ticket.equipment}</b><span>{ticket.predicted_impact}</span></div></div>)}</div>{!tickets.length && <EmptyState />}</Panel>;
}

function EnergyView({ energy }: { energy: Dashboard["energy"] }) {
  return <Panel title="Energy waste investigator" kicker="Compare usage against peer baselines"><div className="energy-grid">{energy.map((reading) => { const delta = Math.round(((reading.usage_kwh - reading.baseline_kwh) / reading.baseline_kwh) * 100); return <article className="energy-card" key={reading.id}><div className="energy-head"><span>{reading.zone}</span><b className={reading.anomaly_score >= 60 ? "orange-text" : ""}>{delta > 0 ? "+" : ""}{delta}%</b></div><h3>{reading.equipment}</h3><div className="bar"><i style={{ width: `${Math.min(reading.anomaly_score, 100)}%` }} /></div><p>{reading.usage_kwh} kWh actual · {reading.baseline_kwh} kWh baseline</p><span className="muted">{reading.anomaly_score >= 60 ? "Investigation recommended" : "Within expected range"}</span></article>; })}</div>{!energy.length && <EmptyState />}</Panel>;
}

function ResponseView({ incidents }: { incidents: Dashboard["incidents"] }) {
  return <Panel title="Catastrophe response center" kicker="Prioritized by probability × impact"><div className="response-list">{incidents.map((incident) => <article className="response-card" key={incident.id}><div className="response-title"><span className={`badge ${incident.severity === "high" ? "high" : "medium"}`}>{incident.severity.toUpperCase()}</span><strong>{incident.probability}% likely</strong></div><h3>{incident.title}</h3><p>{incident.category} · Affected: {incident.affected_zones.join(", ")}</p><ol>{incident.response_plan.map((step) => <li key={step}>{step}</li>)}</ol></article>)}</div>{!incidents.length && <EmptyState />}</Panel>;
}

function EmptyState() {
  return <p className="empty">No data yet. Apply the Supabase migrations to load the demo scenario.</p>;
}
