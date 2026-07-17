export const WALLET_LOGIN_CHAIN_ID = 84_532;
export const WALLET_LOGIN_STATEMENT = "Sign in to Poker";

export interface WalletLoginMessage {
  domain: string;
  address: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt: Date;
  expirationTime: Date;
}

const LOGIN_MESSAGE_PATTERN =
  /^([^\s\r\n]+) wants you to sign in with your Ethereum account:\n(0x[0-9a-fA-F]{40})\n\nSign in to Poker\n\nURI: ([^\s\r\n]+)\nVersion: ([^\s\r\n]+)\nChain ID: ([0-9]+)\nNonce: ([A-Za-z0-9_-]{8,})\nIssued At: ([^\s\r\n]+)\nExpiration Time: ([^\s\r\n]+)$/;

function parseTimestamp(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    return null;
  }
  return parsed;
}

export function parseWalletLoginMessage(
  message: string,
): WalletLoginMessage | null {
  const match = LOGIN_MESSAGE_PATTERN.exec(message);
  if (!match) return null;
  const [
    ,
    domain,
    address,
    uri,
    version,
    chainIdText,
    nonce,
    issuedAtText,
    expirationTimeText,
  ] = match;
  const issuedAt = parseTimestamp(issuedAtText!);
  const expirationTime = parseTimestamp(expirationTimeText!);
  if (!issuedAt || !expirationTime) return null;
  const chainId = Number(chainIdText);
  if (!Number.isSafeInteger(chainId)) return null;
  return {
    domain: domain!,
    address: address!,
    uri: uri!,
    version: version!,
    chainId,
    nonce: nonce!,
    issuedAt,
    expirationTime,
  };
}
