import { TableClient } from "@/features/table/table-client";
import { PointsPage } from "@/modes/points-entry";

export default async function TablePage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return (
    <PointsPage table>
      <TableClient roomId={roomId} />
    </PointsPage>
  );
}
