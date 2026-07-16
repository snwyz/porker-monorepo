import { TableClient } from "@/features/table/table-client";

export default async function TablePage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <TableClient roomId={roomId} />;
}
