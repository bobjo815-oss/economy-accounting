import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AccountRow, ActualRow, CategoryRow, FxSnapshotRow, MerchantRuleRow, SplitRow,
  PlanRow, ProfileRow, RecurringTemplateRow, TransferRow, WorkspaceData,
} from "./records";

export async function loadWorkspace(supabase: SupabaseClient, userId: string): Promise<WorkspaceData> {
  const [profile, accounts, categories, rates, plans, actuals, splits, transfers, merchantRules, recurringTemplates, proposals] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("accounts").select("*").eq("user_id", userId).order("name"),
    supabase.from("categories").select("*").eq("user_id", userId).order("sort_order"),
    supabase.from("fx_snapshots").select("*").eq("user_id", userId),
    supabase.from("plans").select("*").eq("user_id", userId).order("scheduled_date"),
    supabase.from("actual_transactions").select("*").eq("user_id", userId).order("occurred_on", { ascending: false }),
    supabase.from("transaction_splits").select("*").eq("user_id", userId),
    supabase.from("transfers").select("*").eq("user_id", userId).order("occurred_on", { ascending: false }),
    supabase.from("merchant_rules").select("*").eq("user_id", userId).order("priority"),
    supabase.from("recurring_templates").select("*").eq("user_id", userId).order("next_date"),
    supabase.from("actual_edit_proposals").select("id,original_actual_id,fields,status,updated_at").eq("user_id",userId).eq("status","pending"),
  ]);
  if ([profile, accounts, categories, rates, plans, actuals, splits, transfers, merchantRules, recurringTemplates, proposals].some((result) => result.error)) {
    throw new Error("The finance workspace could not load. Check the database setup and your connection.");
  }
  return {
    actualEditProposals: proposals.data ?? [],
    profile: profile.data as ProfileRow | null,
    accounts: (accounts.data ?? []) as AccountRow[],
    categories: (categories.data ?? []) as CategoryRow[],
    rates: (rates.data ?? []).map((rate) => ({ ...rate, rate: String(rate.rate) })) as FxSnapshotRow[],
    plans: (plans.data ?? []) as PlanRow[],
    actuals: (actuals.data ?? []) as ActualRow[],
    splits: (splits.data ?? []) as SplitRow[],
    transfers: (transfers.data ?? []) as TransferRow[],
    merchantRules: (merchantRules.data ?? []) as MerchantRuleRow[],
    recurringTemplates: (recurringTemplates.data ?? []) as RecurringTemplateRow[],
  };
}
