import { Injectable } from "@nestjs/common";
import {
  claimTableSeat,
  commitDurableAction,
  createDurableHand,
  findCommittedAction,
  listPublicRooms,
  listTableSeats,
  loadHandEventsAfter,
  loadHandEventsSinceVersion,
  loadLatestTableSnapshot,
  releaseTableSeat,
  setRoomDraining,
} from "@poker/db";

@Injectable()
export class TableRepository {
  claimSeat = claimTableSeat;
  commitAction = commitDurableAction;
  createHand = createDurableHand;
  findAction = findCommittedAction;
  listSeats = listTableSeats;
  loadEventsAfter = loadHandEventsAfter;
  loadEventsSinceVersion = loadHandEventsSinceVersion;
  loadLatestSnapshot = loadLatestTableSnapshot;
  releaseSeat = releaseTableSeat;
  setDraining = setRoomDraining;

  async findRoom(roomId: string) {
    return (await listPublicRooms()).find((room) => room.id === roomId) ?? null;
  }
}
