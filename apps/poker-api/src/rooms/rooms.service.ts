import { Injectable } from "@nestjs/common";
import {
  createPublicRoom,
  listPublicRooms,
  type PublicRoomRecord,
} from "@poker/db";
import { CreateRoomSchema, type CreateRoomInput } from "@poker/shared";

export interface PublicRoom {
  id: string;
  name: string;
  seats: number;
  smallBlind: string;
  bigBlind: string;
  minBuyIn: string;
  maxBuyIn: string;
  actionTimeoutSeconds: number;
  visibility: "PUBLIC";
  gameType: "CASH";
  occupiedSeats: number;
}

function serializeRoom(room: PublicRoomRecord): PublicRoom {
  return {
    id: room.id,
    name: room.name,
    seats: room.seatCount,
    smallBlind: room.smallBlind.toString(),
    bigBlind: room.bigBlind.toString(),
    minBuyIn: room.minBuyIn.toString(),
    maxBuyIn: room.maxBuyIn.toString(),
    actionTimeoutSeconds: room.actionTimeoutSeconds,
    visibility: "PUBLIC",
    gameType: "CASH",
    occupiedSeats: room.occupiedSeats,
  };
}

@Injectable()
export class RoomsService {
  parseCreateInput(input: unknown): CreateRoomInput {
    return CreateRoomSchema.parse(input);
  }

  async create(input: CreateRoomInput): Promise<PublicRoom> {
    return serializeRoom(
      await createPublicRoom({
        name: input.name,
        seatCount: input.seats,
        smallBlind: BigInt(input.smallBlind),
        bigBlind: BigInt(input.bigBlind),
        minBuyIn: BigInt(input.minBuyIn),
        maxBuyIn: BigInt(input.maxBuyIn),
        actionTimeoutSeconds: input.actionTimeoutSeconds,
      }),
    );
  }

  async list(): Promise<PublicRoom[]> {
    const rooms = await listPublicRooms();
    return rooms.map(serializeRoom);
  }
}
