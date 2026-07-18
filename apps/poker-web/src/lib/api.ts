import {
  normalizeLocale,
  t,
  type Locale,
  type MessageCode,
  type MessageParams,
} from "@poker/i18n";
import { CreateRoomSchema, type CreateRoomInput } from "@poker/shared";
import { z } from "zod";

import { readLocaleCookie } from "@poker/next-i18n/browser";

const GuestSchema = z.object({
  nickname: z.string(),
  points: z.string().regex(/^\d+$/),
});

export type Guest = z.infer<typeof GuestSchema>;

const StoredGuestSchema = GuestSchema.pick({ nickname: true });
export type StoredGuest = z.infer<typeof StoredGuestSchema>;

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

export type { CreateRoomInput };

const LocalizedProblemSchema = z.object({
  code: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

function currentLocale(): Locale {
  if (typeof document === "undefined") return "en";
  return readLocaleCookie() ?? normalizeLocale(navigator.language);
}

const roomFieldLabelCodes = {
  name: "P000127",
  seats: "P000128",
  smallBlind: "P000130",
  bigBlind: "P000131",
  minBuyIn: "P000132",
  maxBuyIn: "P000133",
  actionTimeoutSeconds: "P000134",
  nickname: "P000138",
} as const satisfies Record<string, MessageCode>;

function formatParam(value: string | number, locale: Locale): string | number {
  if (typeof value === "string" && value in roomFieldLabelCodes) {
    return t(
      locale,
      roomFieldLabelCodes[value as keyof typeof roomFieldLabelCodes],
    );
  }
  return value;
}

export function formatProblem(
  value: unknown,
  locale = currentLocale(),
): string {
  const parsed = LocalizedProblemSchema.safeParse(value);
  if (!parsed.success) return t(locale, "P000172");
  const params = parsed.data.params
    ? (Object.fromEntries(
        Object.entries(parsed.data.params).map(([key, param]) => [
          Number(key),
          formatParam(param, locale),
        ]),
      ) as MessageParams)
    : undefined;
  try {
    return t(locale, parsed.data.code as MessageCode, params);
  } catch {
    return t(locale, "P000172");
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`/api/game${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(formatProblem(body));
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

export async function refreshGuest(): Promise<Guest | null> {
  const stored = getStoredGuest();
  if (!stored) return null;
  const guest = GuestSchema.parse(
    await request("/v1/guest-session", {
      method: "POST",
      body: JSON.stringify({ nickname: stored.nickname }),
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

export function getStoredGuest(): StoredGuest | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(guestKey);
  if (!raw) return null;
  try {
    const parsed = StoredGuestSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function setStoredGuest(guest: StoredGuest): void {
  window.localStorage.setItem(
    guestKey,
    JSON.stringify(StoredGuestSchema.parse(guest)),
  );
}
