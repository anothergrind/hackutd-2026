// Kept for older clients: same as POST /api/incidents.
import { POST as startIncident } from "../incidents/route";

export const maxDuration = 300;
export const POST = startIncident;
