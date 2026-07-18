import type { Address } from "viem";

export const BASE_SEPOLIA_CHAIN_ID = 84_532;

export const tokenAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const escrowAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "withdrawal",
        type: "tuple",
        components: [
          { name: "account", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

function configuredAddress(value: string | undefined): Address | null {
  return value && /^0x[0-9a-fA-F]{40}$/.test(value)
    ? (value as Address)
    : null;
}

export const tokenAddress = configuredAddress(
  process.env.NEXT_PUBLIC_POKER_TOKEN_ADDRESS,
);
export const escrowAddress = configuredAddress(
  process.env.NEXT_PUBLIC_ESCROW_ADDRESS,
);
