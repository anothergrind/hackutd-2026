import { redirect } from "next/navigation";

// Every incident, past and present, is listed on Approvals.
export default function RunsPage() {
  redirect("/approvals");
}
