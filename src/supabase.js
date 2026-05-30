import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ==================== DEBT RECORDS ====================

export async function fetchDebtRecords() {
  const { data, error } = await supabase
    .from("debt_records")
    .select("*")
    .order("saved_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function saveDebtRecord(payload) {
  const { data, error } = await supabase
    .from("debt_records")
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateDebtRecord(id, payload) {
  const { data, error } = await supabase
    .from("debt_records")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteDebtRecord(id) {
  const { error } = await supabase
    .from("debt_records")
    .delete()
    .eq("id", id);

  if (error) throw error;
  return true;
}

// ==================== CASH RECORDS ====================

export async function fetchCashRecords() {
  const { data, error } = await supabase
    .from("cash_records")
    .select("*")
    .order("saved_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function saveCashRecord(payload) {
  const { data, error } = await supabase
    .from("cash_records")
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCashRecord(id, payload) {
  const { data, error } = await supabase
    .from("cash_records")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCashRecord(id) {
  const { error } = await supabase
    .from("cash_records")
    .delete()
    .eq("id", id);

  if (error) throw error;
  return true;
}

// ==================== REALTIME ====================

export function subscribeToRecords(tableName, onChange) {
  return supabase
    .channel(`realtime-${tableName}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: tableName,
      },
      onChange
    )
    .subscribe();
}

export function unsubscribeFromRecords(channel) {
  if (channel) {
    return supabase.removeChannel(channel);
  }
}