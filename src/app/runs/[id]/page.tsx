import Link from "next/link";
import RunView from "@/components/run/RunView";
import PageHeader from "@/components/shell/PageHeader";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <PageHeader title="Run Replay" crumbs={<><Link href="/runs">Run History</Link><span>/</span><span>{id.slice(0, 8)}</span></>} />
      <RunView runId={id} />
    </>
  );
}
