import type { Address } from "viem";

import { issueWalletNonce, verifyWallet } from "./web3-api";

export async function signedLogin(
  address: Address,
  signMessage: (message: string) => Promise<string>,
) {
  const issued = await issueWalletNonce(address);
  const issuedAt = new Date();
  const configuredUri = process.env.NEXT_PUBLIC_WALLET_LOGIN_URI;
  const uri = configuredUri ?? window.location.origin;
  const domain = process.env.NEXT_PUBLIC_WALLET_LOGIN_DOMAIN ?? window.location.host;
  const message = `${domain} wants you to sign in with your Ethereum account:
${address}

Sign in to Poker

URI: ${uri}
Version: 1
Chain ID: 84532
Nonce: ${issued.nonce}
Issued At: ${issuedAt.toISOString()}
Expiration Time: ${issued.expiresAt}`;
  const signature = await signMessage(message);
  return verifyWallet(message, signature);
}
