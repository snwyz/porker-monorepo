import Link from "next/link";
import { CreateRoomForm } from "@/features/rooms/create-room-form";

export default function NewRoomPage() {
  return (
    <main>
      <Link href="/lobby">Back to lobby</Link>
      <h1>Create public table</h1>
      <CreateRoomForm />
    </main>
  );
}
