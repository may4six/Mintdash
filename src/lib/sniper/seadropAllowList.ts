import type { Abi, Address, Hex } from "viem";
import { encodeFunctionData } from "viem";
import { CANONICAL_SEADROP_ADDRESS } from "./seadrop";

/**
 * SeaDrop mintAllowList — allowlist / FCFS stages.
 * Public path stays on mintPublic; this module is additive only.
 *
 * Leaf = keccak256(abi.encode(minter, mintParams))
 * Proof must come from OpenSea / project (cannot be invented on-chain).
 */

export const SEADROP_ALLOWLIST_MINT_ABI: Abi = [
  {
    type: "function",
    name: "mintAllowList",
    stateMutability: "payable",
    inputs: [
      { name: "nftContract", type: "address" },
      { name: "feeRecipient", type: "address" },
      { name: "minterIfNotPayer", type: "address" },
      { name: "quantity", type: "uint256" },
      {
        name: "mintParams",
        type: "tuple",
        components: [
          { name: "mintPrice", type: "uint256" },
          { name: "maxTotalMintableByWallet", type: "uint256" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "dropStageIndex", type: "uint256" },
          { name: "maxTokenSupplyForStage", type: "uint256" },
          { name: "feeBps", type: "uint256" },
          { name: "restrictFeeRecipients", type: "bool" },
        ],
      },
      { name: "proof", type: "bytes32[]" },
    ],
    outputs: [],
  },
];

export const SEADROP_ALLOWLIST_RECIPIENT_PARAM = "minterIfNotPayer";

/** Exact shape of SeaDrop MintParams (allowlist leaf encodes this with minter). */
export type SeaDropMintParams = {
  mintPrice: bigint;
  maxTotalMintableByWallet: bigint;
  startTime: bigint;
  endTime: bigint;
  dropStageIndex: bigint;
  maxTokenSupplyForStage: bigint;
  feeBps: bigint;
  restrictFeeRecipients: boolean;
};

/** JSON-safe form stored in campaign.staticArgValues */
export type SeaDropMintParamsJson = {
  mintPrice: string;
  maxTotalMintableByWallet: string;
  startTime: string;
  endTime: string;
  dropStageIndex: string;
  maxTokenSupplyForStage: string;
  feeBps: string;
  restrictFeeRecipients: boolean;
};

export type AllowListStaticArgs = {
  nftContract: string;
  feeRecipient: string;
  quantity: string;
  mintParams: SeaDropMintParamsJson;
  /**
   * Merkle proof per minter (receiver) address.
   * Required for each receiver you mint to.
   */
  proofByReceiver: Record<string, string[]>;
};

export function parseMintParams(raw: unknown): SeaDropMintParams {
  if (!raw || typeof raw !== "object") {
    throw new Error("mintParams missing — required for mintAllowList");
  }
  const o = raw as Record<string, unknown>;
  return {
    mintPrice: BigInt(String(o.mintPrice ?? "0")),
    maxTotalMintableByWallet: BigInt(String(o.maxTotalMintableByWallet ?? "0")),
    startTime: BigInt(String(o.startTime ?? "0")),
    endTime: BigInt(String(o.endTime ?? "0")),
    dropStageIndex: BigInt(String(o.dropStageIndex ?? "1")),
    maxTokenSupplyForStage: BigInt(String(o.maxTokenSupplyForStage ?? "0")),
    feeBps: BigInt(String(o.feeBps ?? "0")),
    restrictFeeRecipients: Boolean(o.restrictFeeRecipients),
  };
}

export function mintParamsToTuple(p: SeaDropMintParams): readonly [
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  boolean,
] {
  return [
    p.mintPrice,
    p.maxTotalMintableByWallet,
    p.startTime,
    p.endTime,
    p.dropStageIndex,
    p.maxTokenSupplyForStage,
    p.feeBps,
    p.restrictFeeRecipients,
  ] as const;
}

export function proofForReceiver(
  proofByReceiver: Record<string, string[]> | undefined,
  receiverAddress: string
): Hex[] {
  if (!proofByReceiver) {
    throw new Error("proofByReceiver missing — paste merkle proof per receiver wallet");
  }
  const key = Object.keys(proofByReceiver).find(
    (k) => k.toLowerCase() === receiverAddress.toLowerCase()
  );
  const proof = key ? proofByReceiver[key] : undefined;
  if (!proof || proof.length === 0) {
    throw new Error(
      `No merkle proof for minter ${receiverAddress}. Paste proof for this wallet in proofByReceiver.`
    );
  }
  return proof.map((p) => p as Hex);
}

/** Ordered args for mintAllowList for one receiver (minter). */
export function buildAllowListCallArgs(opts: {
  nftContract: Address;
  feeRecipient: Address;
  minter: Address;
  quantity: bigint;
  mintParams: SeaDropMintParams;
  proof: Hex[];
}): unknown[] {
  return [
    opts.nftContract,
    opts.feeRecipient,
    opts.minter,
    opts.quantity,
    mintParamsToTuple(opts.mintParams),
    opts.proof,
  ];
}

export function buildAllowListArgsFromStatic(
  staticArgs: Record<string, unknown>,
  minter: Address
): unknown[] {
  const nftContract = String(staticArgs.nftContract ?? "") as Address;
  const feeRecipient = String(staticArgs.feeRecipient ?? "") as Address;
  const quantity = BigInt(String(staticArgs.quantity ?? "1"));
  const mintParams = parseMintParams(staticArgs.mintParams);
  const proofByReceiver = staticArgs.proofByReceiver as Record<string, string[]> | undefined;
  const proof = proofForReceiver(proofByReceiver, minter);

  if (!nftContract || !feeRecipient) {
    throw new Error("nftContract and feeRecipient required in staticArgValues");
  }
  if (feeRecipient === "0x0000000000000000000000000000000000000000") {
    throw new Error("feeRecipient cannot be zero for SeaDrop");
  }

  return buildAllowListCallArgs({
    nftContract,
    feeRecipient,
    minter,
    quantity,
    mintParams,
    proof,
  });
}

export function isAllowListCampaign(mintFunctionName: string): boolean {
  return mintFunctionName === "mintAllowList";
}

export function allowListMintValue(
  staticArgs: Record<string, unknown>,
  fallbackPriceWeiPerMint: bigint
): bigint {
  const quantity = BigInt(String(staticArgs.quantity ?? "1"));
  try {
    const p = parseMintParams(staticArgs.mintParams);
    return p.mintPrice * (quantity > 0n ? quantity : 1n);
  } catch {
    return fallbackPriceWeiPerMint * (quantity > 0n ? quantity : 1n);
  }
}

export function buildSeaDropAllowListTx(opts: {
  nftContract: Address;
  feeRecipient: Address;
  minter: Address;
  quantity: number;
  mintParams: SeaDropMintParams;
  proof: Hex[];
}): { to: Address; data: Hex; value: bigint } {
  const quantity = BigInt(opts.quantity);
  const data = encodeFunctionData({
    abi: SEADROP_ALLOWLIST_MINT_ABI,
    functionName: "mintAllowList",
    args: buildAllowListCallArgs({
      ...opts,
      quantity,
    }) as never,
  });
  return {
    to: CANONICAL_SEADROP_ADDRESS,
    data,
    value: opts.mintParams.mintPrice * quantity,
  };
}