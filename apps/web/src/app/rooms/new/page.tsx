import Link from "next/link";
import { CreateRoomForm } from "@/features/rooms/create-room-form";
import { PageIntro, PointsPage } from "@/modes/points-entry";

export default function NewRoomPage() {
  return (
    <PointsPage>
      <main className="max-w-3xl">
        <Link className="mb-5 inline-flex min-h-10 items-center" href="/lobby">
          ← Back to lobby
        </Link>
        <PageIntro eyebrow="Host a game" title="Create public table">
          Set the seats, blinds, and entry range. You can join the table as soon
          as it opens.
        </PageIntro>
        <CreateRoomForm />
      </main>
    </PointsPage>
  );
}
