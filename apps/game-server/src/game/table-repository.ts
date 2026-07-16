import { Injectable } from "@nestjs/common";
import {
  claimTableSeat,
  clearDisconnectGrace,
  commitDurableAction,
  createDurableHand,
  findCommittedAction,
  findDisconnectGrace,
  findTableOperation,
  listPublicRooms,
  listActiveRecoveryRoomIds,
  listTableSeats,
  loadHandEventsAfter,
  loadHandEventsSinceVersion,
  loadLatestTableSnapshot,
  releaseTableSeat,
  setRoomDraining,
  setDisconnectGrace,
} from "@poker/db";

@Injectable()
export class TableRepository {
  claimSeat = claimTableSeat;
  clearGrace = clearDisconnectGrace;
  commitAction = commitDurableAction;
  createHand = createDurableHand;
  findAction = findCommittedAction;
  findGrace = findDisconnectGrace;
  findOperation = findTableOperation;
  listSeats = listTableSeats;
  listRecoveryRooms = listActiveRecoveryRoomIds;
  loadEventsAfter = loadHandEventsAfter;
  loadEventsSinceVersion = loadHandEventsSinceVersion;
  loadLatestSnapshot = loadLatestTableSnapshot;
  releaseSeat = releaseTableSeat;
  setDraining = setRoomDraining;
  setGrace = setDisconnectGrace;

  async findRoom(roomId: string) {
    return (await listPublicRooms()).find((room) => room.id === roomId) ?? null;
  }
}
