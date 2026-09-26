import type { TransferRow } from "./records.ts";

export function transferLegs(transfer: Pick<TransferRow, "from_account_id" | "to_account_id" | "from_amount_minor" | "to_amount_minor" | "explicit_fee_minor">) {
  return [
    { accountId: transfer.from_account_id, amountMinor: -(BigInt(transfer.from_amount_minor) + BigInt(transfer.explicit_fee_minor)) },
    { accountId: transfer.to_account_id, amountMinor: BigInt(transfer.to_amount_minor) },
  ];
}

/** Principal movements are excluded from household cash flow; only a separate fee is spending. */
export function transferCashFlowMinor(transfer: Pick<TransferRow, "explicit_fee_minor">) {
  return -BigInt(transfer.explicit_fee_minor);
}
