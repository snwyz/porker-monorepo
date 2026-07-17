import type { MessageCode, MessageParams } from "@poker/i18n";

export interface LocalizedProblem {
  code: MessageCode;
  params?: MessageParams;
}

export const messageCode = {
  invalidValue: "P00170",
  nicknameTaken: "P00171",
  requestFailed: "P00172",
  authenticationRequired: "P00173",
  roomUnavailable: "P00174",
  tableUnavailable: "P00175",
  joinFailed: "P00176",
  actionInvalid: "P00177",
  handUnavailable: "P00178",
  leaveFailed: "P00179",
  walletProofInvalid: "P00180",
  walletProofRejected: "P00181",
  walletAddressInvalid: "P00182",
  withdrawalAmountInvalid: "P00183",
  idempotencyKeyInvalid: "P00184",
  escrowInsufficient: "P00185",
  withdrawalNotFound: "P00186",
  requestConflict: "P00187",
  staleTable: "P00188",
} as const satisfies Record<string, MessageCode>;

export function localizedProblem(
  code: MessageCode,
  params?: MessageParams,
): LocalizedProblem {
  return params ? { code, params } : { code };
}

export function socketProblem(error: string): LocalizedProblem {
  switch (error) {
    case "UNAUTHENTICATED":
      return localizedProblem(messageCode.authenticationRequired);
    case "ROOM_NOT_FOUND":
      return localizedProblem(messageCode.roomUnavailable);
    case "ROOM_DRAINING":
      return localizedProblem(messageCode.tableUnavailable);
    case "INVALID_JOIN":
    case "JOIN_FAILED":
      return localizedProblem(messageCode.joinFailed);
    case "HAND_NOT_FOUND":
    case "INVALID_SNAPSHOT_REQUEST":
      return localizedProblem(messageCode.handUnavailable);
    case "INVALID_LEAVE":
    case "LEAVE_FAILED":
      return localizedProblem(messageCode.leaveFailed);
    case "ACTION_ID_CONFLICT":
      return localizedProblem(messageCode.requestConflict);
    case "STALE_VERSION":
      return localizedProblem(messageCode.staleTable);
    default:
      return localizedProblem(messageCode.actionInvalid);
  }
}
