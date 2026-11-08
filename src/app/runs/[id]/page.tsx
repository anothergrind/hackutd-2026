import { redirect } from "next/navigation";

// Old replay links open the incident on Live Incident.
export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/?run=${id}`);
}
