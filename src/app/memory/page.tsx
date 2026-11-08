import { redirect } from "next/navigation";

// Building history now lives on each building's card in Buildings.
export default function MemoryPage() {
  redirect("/portfolio");
}
