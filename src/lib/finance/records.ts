import type { CurrencyCode } from "./money";

export type CashDirection = "inflow" | "outflow";
export type EntryKind = "expense" | "income" | "transfer" | "loan_drawdown" | "loan_principal" | "loan_interest";

export type ProfileRow = {
  id: string;
  base_currency: CurrencyCode;
  timezone: string;
  safety_balance_minor: number;
};

export type AccountRow = {
  id: string;
  user_id: string;
  name: string;
  currency_code: CurrencyCode;
  opening_balance_minor: number;
  is_active: boolean;
};

export type CategoryRow = {
  id: string;
  user_id: string;
  major_name: string;
  name: string;
  normal_direction: CashDirection;
  is_active: boolean;
  sort_order: number;
};

export type FxSnapshotRow = {
  id: string;
  user_id: string;
  from_currency: CurrencyCode;
  to_currency: CurrencyCode;
  rate: string;
  observed_on: string;
  purpose: "baseline_plan" | "forecast" | "actual_settlement" | "transfer";
  source_label: string;
};

export type PlanRow = {
  id: string;
  user_id: string;
  title: string;
  scheduled_date: string;
  direction: CashDirection;
  entry_kind: EntryKind;
  category_id: string | null;
  account_id: string | null;
  original_amount_minor: number;
  currency_code: CurrencyCode;
  base_currency: CurrencyCode;
  baseline_fx_snapshot_id: string | null;
  forecast_fx_snapshot_id: string | null;
  baseline_fee_minor: number;
  forecast_fee_minor: number;
  status: "draft" | "pending" | "partial" | "completed" | "overdue" | "canceled";
  recurring_template_id: string | null;
};

export type ActualRow = {
  id: string;
  user_id: string;
  plan_id: string | null;
  account_id: string | null;
  category_id: string | null;
  occurred_on: string;
  description: string;
  direction: CashDirection;
  entry_kind: EntryKind;
  original_amount_minor: number;
  currency_code: CurrencyCode;
  settlement_amount_minor: number;
  settlement_currency: CurrencyCode;
  explicit_fee_minor: number;
  settlement_fx_snapshot_id: string | null;
  settlement_status: "pending_settlement" | "settled" | "voided";
  is_reversal: boolean;
  correction_of_id: string | null;
  replacement_of_id?: string | null;
  created_at: string;
};

export type TransferRow = {
  id: string;
  user_id: string;
  occurred_on: string;
  description: string;
  from_account_id: string;
  to_account_id: string;
  from_amount_minor: number;
  to_amount_minor: number;
  explicit_fee_minor: number;
  transfer_fx_snapshot_id: string | null;
};

export type SplitRow = {
  id: string;
  user_id: string;
  actual_transaction_id: string;
  category_id: string;
  original_amount_minor: number;
};

export type MerchantRuleRow = {
  id: string;
  user_id: string;
  normalized_pattern: string;
  category_id: string;
  priority: number;
  usage_count: number;
};

export type RecurringTemplateRow = {
  id: string;
  user_id: string;
  title: string;
  cadence: "weekly" | "monthly" | "yearly";
  next_date: string;
  anchor_month: number;
  anchor_day: number;
  direction: CashDirection;
  entry_kind: EntryKind;
  category_id: string | null;
  account_id: string | null;
  original_amount_minor: number;
  currency_code: CurrencyCode;
  is_active: boolean;
};

export type WorkspaceData = {
  actualEditProposals?: { id: string; original_actual_id: string; fields: unknown; status: string; updated_at: string }[];
  profile: ProfileRow | null;
  accounts: AccountRow[];
  categories: CategoryRow[];
  rates: FxSnapshotRow[];
  plans: PlanRow[];
  actuals: ActualRow[];
  splits: SplitRow[];
  transfers: TransferRow[];
  merchantRules: MerchantRuleRow[];
  recurringTemplates: RecurringTemplateRow[];
};
