import type { MessageCode, MessageParams } from "@poker/i18n";

export interface LocalizedProblem {
  code: MessageCode;
  params?: MessageParams;
}

export const messageCode = {
  invalidValue: "P000170",
  nicknameTaken: "P000171",
  requestFailed: "P000172",
  authenticationRequired: "P000173",
  roomUnavailable: "P000174",
  tableUnavailable: "P000175",
  joinFailed: "P000176",
  actionInvalid: "P000177",
  handUnavailable: "P000178",
  leaveFailed: "P000179",
  walletProofInvalid: "P000180",
  walletProofRejected: "P000181",
  walletAddressInvalid: "P000182",
  withdrawalAmountInvalid: "P000183",
  idempotencyKeyInvalid: "P000184",
  escrowInsufficient: "P000185",
  withdrawalNotFound: "P000186",
  requestConflict: "P000187",
  staleTable: "P000188",
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
    case "ROOM_FULL":
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
    case "HAND_IN_PROGRESS":
      return localizedProblem(messageCode.leaveFailed);
    case "ACTION_ID_CONFLICT":
      return localizedProblem(messageCode.requestConflict);
    case "STALE_VERSION":
      return localizedProblem(messageCode.staleTable);
    default:
      return localizedProblem(messageCode.actionInvalid);
  }
}
