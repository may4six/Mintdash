import type { Abi } from "viem";

/** The SeaDrop contract's own public entrypoint — NOT the NFT contract's
 * mintSeaDrop, which reverts with OnlyAllowedSeaDrop if called directly.
 * See README's SeaDrop section for why. */
export const SEADROP_MINT_PUBLIC_ABI: Abi = [
  {
    type: "function",
    name: "mintPublic",
    stateMutability: "payable",
    inputs: [
      { name: "nftContract", type: "address" },
      { name: "feeRecipient", type: "address" },
      { name: "minterIfNotPayer", type: "address" },
      { name: "quantity", type: "uint256" },
    ],
    outputs: [],
  },
];

export const SEADROP_RECIPIENT_PARAM = "minterIfNotPayer";
export const SEADROP_QUANTITY_PARAM = "quantity";
export const SEADROP_ZERO_FEE_RECIPIENT = "0x0000000000000000000000000000000000000000";
