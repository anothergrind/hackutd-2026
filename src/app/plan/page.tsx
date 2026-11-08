import { redirect } from "next/navigation";

// Tonight's Plan now lives on the Approvals page, next to the incidents it plans.
export default function PlanPage() {
  redirect("/approvals#plan");
}
