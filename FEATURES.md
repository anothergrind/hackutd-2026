# OpsCrew Feature Ideas

OpsCrew already provides a strong foundation:

- Nemotron agent crew with parallel specialists
- Building dependency graph and blast-radius analysis
- Cost-of-delay calculations
- Weather, tickets, sensors, leases, tenants, vendors, and parts
- Approval queue before side effects
- Work-order and tenant-notice generation
- Nightly portfolio sweep
- Post-repair verification
- Crew builder for configuring agents

The strongest direction is to make the fragmented-data-to-action story more visible and realistic.

## 1. Maintenance Ticket Escalation Predictor

Connect repeated small complaints into one emerging failure.

Example:

> “Warm hallway” + “water near CRAH” + “musty smell” → likely condensate pump failure → cooling cascade risk.

Features:

- Import or manually add tickets
- Cluster tickets by building, floor, equipment, and time
- Detect repeated complaints
- Assign escalation probability
- Explain which tickets contributed to the prediction
- Automatically start an OpsCrew investigation

Tracks: CBRE, NVIDIA, NMC²

## 2. Energy Waste Investigator

Detect abnormal energy consumption and determine the likely cause.

Features:

- Compare energy use against historical baseline
- Compare similar buildings or zones
- Detect HVAC, lighting, and equipment anomalies
- Correlate energy data with maintenance tickets and weather
- Calculate projected monthly cost
- Generate an energy-reduction work plan

Nemotron workflow:

1. Detect anomaly
2. Query building history
3. Check weather and occupancy context
4. Inspect related equipment
5. Estimate cost
6. Draft corrective actions
7. Request approval

Tracks: CBRE, NVIDIA

## 3. “What If?” Impact Simulator

Let a manager simulate failure scenarios before approving a plan.

Example scenarios:

- What if the chiller fails for four hours?
- What if the storm causes a utility outage?
- What if BMS access is compromised?
- What if the repair is delayed until tomorrow?
- What if only one technician is available?

Display:

- Affected assets
- Affected tenants
- Expected downtime
- SLA penalties
- Emergency repair cost
- Recommended mitigation
- Best- and worst-case outcomes

Tracks: CBRE, NMC²

## 4. Shift Handoff and Incident Briefing

Create an automatically generated handoff for the next facilities or data-center shift.

Include:

- What happened
- What has already been checked
- Current risk
- Pending approvals
- Work orders and vendors
- Temporary mitigations
- Exact next steps
- Items requiring human attention

Support:

- “Generate morning handoff”
- “Summarize this incident for the night team”
- “What changed since the previous shift?”

Tracks: NVIDIA, NMC²

## 5. Technician Dispatch Optimizer

Go beyond drafting a work order and optimize who should perform it.

Consider:

- Technician skills
- Current location
- Availability
- Certifications
- Parts on hand
- Vendor response times
- Repair urgency
- Travel time
- Risk of waiting

Example output:

> “Send Maria now with the condensate pump. She is certified for this equipment, already at Avon Center, and the part is in stock. Estimated risk reduction: $18,400.”

Tracks: CBRE, NVIDIA, NMC²

## 6. Parts and Vendor Readiness

Predict whether a repair can actually happen before failure.

Features:

- Check parts inventory
- Identify lead times
- Compare vendors
- Detect single-source dependencies
- Recommend substitute parts
- Flag plans that are not executable
- Automatically escalate long-lead items

Useful equipment examples:

- UPS batteries
- Chiller components
- BMS controllers
- HVAC motors
- Generator parts

Tracks: CBRE, NMC²

## 7. Data Center Resilience Score

Create a score for each building or data hall based on operational resilience.

Possible dimensions:

- Power redundancy
- Cooling redundancy
- Backup generator readiness
- UPS health
- Open maintenance tickets
- Single points of failure
- Spare-parts availability
- Weather exposure
- Tenant SLA exposure
- Recent incident history

Show:

- Current resilience score
- Top three weaknesses
- How a proposed action changes the score
- Portfolio-wide ranking

Tracks: CBRE, NMC²

## 8. Autonomous Nightly Operations Sweep

Make the existing nightly sweep more prominent and actionable.

The sweep should:

1. Score every building
2. Detect anomalies
3. Connect related weak signals
4. Prioritize issues by business impact
5. Start specialist agents automatically
6. Draft a morning action queue
7. Notify the appropriate manager

Add a “new since last sweep” view:

- New risks
- Risks getting worse
- Risks resolved
- Recommended actions
- Unacknowledged issues

Tracks: CBRE, NVIDIA, NMC²

## 9. Approval Policy Engine

Make approvals smarter than a simple queue.

Example policies:

- Auto-approve low-cost, low-risk actions
- Require manager approval for tenant communication
- Require facilities approval for shutdowns
- Require security approval for BMS or cyber incidents
- Escalate if no one responds within 15 minutes
- Require two-person approval above a cost threshold

Tracks: NVIDIA, NMC²

## 10. Tenant and Business Impact Center

Make the business impact more tangible for CBRE.

For every incident, show:

- Tenants affected
- Floors or data halls affected
- SLA penalties
- Revenue or business criticality
- Expected customer communication
- Whether the tenant or landlord pays
- Historical incidents for that tenant

Add generated communication variants:

- Technical facilities notice
- Executive summary
- Tenant-facing email
- Internal status update

Tracks: CBRE, NVIDIA

## 11. Incident Timeline and Root-Cause Replay

After an incident, show how it developed.

Example:

```text
09:12 — First temperature anomaly
09:28 — First tenant ticket
10:03 — Repeat ticket detected
10:15 — Chiller trend crossed warning threshold
10:17 — OpsCrew started investigation
10:19 — Work order drafted
```

Add:

- Contributing signals
- Missed warning opportunities
- Root cause
- Response time
- Money saved
- Recommended monitoring rule

Tracks: CBRE, NMC²

## 12. Operational Memory and Learning

Extend the existing memory feature into a learning loop.

After each incident, ask the manager to confirm:

- Was the diagnosis correct?
- Was the estimated cost accurate?
- Was the vendor recommendation useful?
- Did the mitigation work?
- Should this asset receive more sensitive monitoring?

Use that feedback to improve:

- Future prioritization
- Agent prompts
- Risk scores
- Recommended vendors
- Maintenance intervals

Tracks: NVIDIA, NMC²

## 13. Real Data Instead of Demo Data

Today only three inputs are real: the Nemotron agents, the Open-Meteo forecast and NWS weather alerts.
Buildings, equipment, sensor readings, tickets, tenants, leases, vendors, parts and energy readings are seeded
demo data (`src/lib/supabase/memory.ts` and `supabase/migrations/`). Replace them in this order.

### Step 1: Persist data (prerequisite)

- Set `SUPABASE_SERVICE_ROLE_KEY` and run migrations `001`–`007`, so data survives restarts and deploys.
- Without this, any real data loaded is lost when the server restarts.

### Step 2: Bring-your-own-data import

Real tickets, sensor readings and leases are private to each operator, so there is no public source for them.
The honest path is an importer:

- CSV/JSON upload for tickets (`maintenance_tickets`), sensor readings (`telemetry_events`), assets and dependencies, tenants and leases
- Validate every row server-side (types, lengths, known asset ids) and reject the file on errors
- Keep the demo seed as a "Load demo portfolio" button so judging still works with one click
- Use CBRE's provided dataset, if available, as the first real import

### Step 3: Free public data that fits the story

| Source | What it adds | Access |
|---|---|---|
| Open-Meteo forecast | Heat and wind risk | Already live, no key |
| NWS active alerts (api.weather.gov) | Heat advisories, storms, floods | Already live, no key |
| OpenFEMA API | Disaster declarations for a building's county | Free, no key |
| EIA Open Data API | Regional electricity prices and grid demand, for real energy costs | Free key |
| City energy benchmarking (e.g. NYC LL84, Chicago, on Socrata open-data portals) | Real building energy use and size for a public portfolio | Free, no key for low volume |

### Step 4: Live building systems (after the hackathon)

- Sensor feeds through a BMS gateway (BACnet / Modbus) or tagging standards such as Project Haystack and Brick
- Ticket sync from a CMMS (for example ServiceNow, Maximo) through its API
- Treat all of it as untrusted input: validated, length-capped, and never able to trigger an action without human approval

### Rules

- Never present demo data as real on stage: label the demo portfolio as demo data.
- Every new source goes through the same validation and approval flow as the existing tools.

Tracks: CBRE ("connects fragmented real estate data"), NVIDIA ("using external APIs and services"), NMC²

# Recommended Combined Product Story

## OpsCrew Early Warning and Response

### Core flow

1. **Ingest fragmented signals**
   - Tickets
   - Sensors
   - Energy
   - Weather
   - BMS/security alerts
   - Lease/SLA data

2. **Detect a hidden issue**
   - Cluster related signals
   - Identify the likely root asset
   - Calculate probability and time-to-failure

3. **Explain the blast radius**
   - Affected equipment
   - Tenants
   - Data halls
   - SLA exposure
   - Cost of waiting

4. **Plan and execute**
   - Nemotron delegates to specialist agents
   - Checks parts and vendors
   - Creates mitigation and repair plans
   - Drafts communications
   - Waits for approval
   - Executes approved actions

5. **Close the loop**
   - Verify sensor recovery
   - Generate shift handoff
   - Save lessons learned
   - Update building resilience score

## Track Alignment

### CBRE

- Connects fragmented real estate data
- Predicts operational failures
- Quantifies business impact
- Executes solutions before disruptions spread

### NVIDIA

- Uses Nemotron for tool-using specialist agents
- Demonstrates multi-step planning and execution
- Integrates external APIs and operational services
- Solves a real-world facilities problem instead of acting as a chatbot

### NMC²

- Improves data-center reliability
- Surfaces warnings before failures
- Supports clear shift handoffs
- Keeps teams informed with the right information at the right time

# Recommended Build Priority

If time is limited, prioritize:

1. **Ticket clustering and escalation prediction**
2. **Visible dependency graph with blast-radius animation**
3. **What-if impact simulator**
4. **Automatic shift handoff**
5. **Incident timeline showing money and time saved**

These features make the existing system feel less like a scripted incident dashboard and more like an operational product that genuinely keeps facilities running.
