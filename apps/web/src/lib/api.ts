import { z } from "zod";

const GuestSchema = z.object({
  nickname: z.string(),
  points: z.string().regex(/^\d+$/),
});

export type Guest = z.infer<typeof GuestSchema>;

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  seats: z.number().int(),
  smallBlind: z.string(),
  bigBlind: z.string(),
  minBuyIn: z.string(),
  maxBuyIn: z.string(),
  actionTimeoutSeconds: z.number().int(),
  visibility: z.literal("PUBLIC"),
  gameType: z.literal("CASH"),
});

export type Room = z.infer<typeof RoomSchema>;

const CreateRoomSchema = z.object({
  name: z.string().min(1),
  seats: z.number().int().min(2).max(9),
  smallBlind: z.number().int().positive(),
  bigBlind: z.number().int().positive(),
  minBuyIn: z.number().int().positive(),
  maxBuyIn: z.number().int().positive(),
  actionTimeoutSeconds: z.number().int().min(10).max(120),
});

export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`/api/game${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const message = z
      .object({ message: z.union([z.string(), z.array(z.unknown())]) })
      .safeParse(body);
    throw new Error(
      message.success
        ? JSON.stringify(message.data.message)
        : `HTTP ${response.status}`,
    );
  }
  return body;
}

export async function createGuest(nickname: string): Promise<Guest> {
  const guest = GuestSchema.parse(
    await request("/v1/guest-session", {
      method: "POST",
      body: JSON.stringify({ nickname }),
    }),
  );
  setStoredGuest(guest);
  return guest;
}

export async function listRooms(): Promise<Room[]> {
  return z.array(RoomSchema).parse(await request("/v1/rooms"));
}

export async function createRoom(input: CreateRoomInput): Promise<Room> {
  const validated = CreateRoomSchema.parse(input);
  return RoomSchema.parse(
    await request("/v1/rooms", {
      method: "POST",
      body: JSON.stringify(validated),
    }),
  );
}

const guestKey = "poker.points.guest";

export function getStoredGuest(): Guest | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(guestKey);
  if (!raw) return null;
  const parsed = GuestSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export function setStoredGuest(guest: Guest): void {
  window.localStorage.setItem(
    guestKey,
    JSON.stringify(GuestSchema.parse(guest)),
  );
  window.dispatchEvent(new Event("poker:guest"));
}

export function adjustStoredPoints(delta: number): Guest | null {
  const guest = getStoredGuest();
  if (!guest) return null;
  const updated = {
    ...guest,
    points: (BigInt(guest.points) + BigInt(delta)).toString(),
  };
  setStoredGuest(updated);
  return updated;
}
