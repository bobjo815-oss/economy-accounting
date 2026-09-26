import { parseRate, supportedCurrencies, type CurrencyCode } from "./money.ts";

export type Direction = "Inflow" | "Outflow";
export type FeeTreatment = "included" | "separate";

export type Settlement = {
  id: string;
  recordedAt: string;
  kind: "settlement" | "reversal";
  correctionOfId: string | null;
  occurredOn: string;
  description: string;
  direction: Direction;
  planId: number | null;
  originalAmountMinor: string;
  originalCurrency: CurrencyCode;
  settlementAmountMinor: string;
  settlementCurrency: CurrencyCode;
  feeTreatment: FeeTreatment;
  explicitFeeMinor: string;
  observedFxRate: string | null;
};

export type SettlementInput = Omit<Settlement, "id" | "recordedAt">;

function isUnsignedInteger(value: string, positive: boolean) {
  if (!/^(0|[1-9]\d*)$/.test(value)) return false;
  return !positive || BigInt(value) > BigInt(0);
}

export function validateSettlement(input: SettlementInput): string | null {
  if (input.kind === "reversal" && !input.correctionOfId) return "A reversal must link to its original settlement.";
  if (input.kind === "settlement" && input.correctionOfId !== null) return "A new settlement cannot reverse another record.";
  if (input.kind !== "settlement" && input.kind !== "reversal") return "Choose a valid record type.";
  const parsedDate = new Date(`${input.occurredOn}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn) ||
    Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== input.occurredOn) {
    return "Enter a valid settlement date.";
  }
  if (!input.description.trim() || input.description.length > 500) return "Enter a description of 1–500 characters.";
  if (input.direction !== "Inflow" && input.direction !== "Outflow") return "Choose a cash direction.";
  if (!supportedCurrencies.includes(input.originalCurrency) || !supportedCurrencies.includes(input.settlementCurrency)) {
    return "Choose a supported currency.";
  }
  if (input.planId !== null && (!Number.isSafeInteger(input.planId) || input.planId < 0)) return "Choose a valid plan.";
  if (!isUnsignedInteger(input.originalAmountMinor, true) || !isUnsignedInteger(input.settlementAmountMinor, true)) {
    return "Original and settled amounts must be positive.";
  }
  if (!isUnsignedInteger(input.explicitFeeMinor, false)) return "The separate fee must be zero or positive.";
  if (input.feeTreatment === "included" && input.explicitFeeMinor !== "0") {
    return "An included fee cannot also be charged separately.";
  }
  if (input.feeTreatment !== "included" && input.feeTreatment !== "separate") return "Choose how the fee was charged.";
  if (input.direction === "Inflow" && BigInt(input.explicitFeeMinor) > BigInt(input.settlementAmountMinor)) {
    return "The separate fee cannot exceed the settled credit.";
  }
  if (input.observedFxRate !== null && parseRate(input.observedFxRate) === null) {
    return "Enter a positive bank FX rate with at most eight decimal places.";
  }
  return null;
}

export function isSettlement(value: unknown): value is Settlement {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<Settlement>;
  if (typeof record.id !== "string" || typeof record.recordedAt !== "string" ||
    (record.kind !== "settlement" && record.kind !== "reversal") ||
    (record.correctionOfId !== null && typeof record.correctionOfId !== "string") ||
    typeof record.occurredOn !== "string" || typeof record.description !== "string" ||
    typeof record.originalAmountMinor !== "string" || typeof record.settlementAmountMinor !== "string" ||
    typeof record.explicitFeeMinor !== "string" ||
    (record.direction !== "Inflow" && record.direction !== "Outflow") ||
    (record.feeTreatment !== "included" && record.feeTreatment !== "separate") ||
    (record.observedFxRate !== null && typeof record.observedFxRate !== "string")) return false;
  return validateSettlement(record as Settlement) === null;
}

export function createReversal(original: Settlement, id: string, recordedAt: string): Settlement {
  if (original.kind !== "settlement") throw new Error("Only a settlement can be reversed.");
  return {
    ...original,
    id,
    recordedAt,
    occurredOn: recordedAt.slice(0, 10),
    kind: "reversal",
    correctionOfId: original.id,
    observedFxRate: null,
  };
}

/** Positive means cash received; negative means cash paid. */
export function cashEffectMinor(settlement: Pick<Settlement, "direction" | "settlementAmountMinor" | "explicitFeeMinor" | "kind">) {
  const settled = BigInt(settlement.settlementAmountMinor);
  const fee = BigInt(settlement.explicitFeeMinor);
  const effect = settlement.direction === "Inflow" ? settled - fee : -(settled + fee);
  return settlement.kind === "reversal" ? -effect : effect;
}

export function actualCostMinor(settlement: Pick<Settlement, "direction" | "settlementAmountMinor" | "explicitFeeMinor" | "kind">) {
  const effect = cashEffectMinor(settlement);
  return settlement.direction === "Inflow" ? effect : -effect;
}
