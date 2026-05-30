import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  "https://yyxkhtqgnfwpvafuwsnc.supabase.co",
  "sb_publishable_7JbzfFnjiz5TpRQpOvnshg_HMN5CpU-"
);

export async function fetchDebtRecords() {
  const { data, error } = await supabase.from('debt_records').select('*').order('created_at', { ascending: false });
  if (error) throw error; return data;
}
export async function saveDebtRecord(r) {
  const { data, error } = await supabase.from('debt_records').insert([r]).select().single();
  if (error) throw error; return data;
}
export async function updateDebtRecord(id, r) {
  const { data, error } = await supabase.from('debt_records').update(r).eq('id', id).select().single();
  if (error) throw error; return data;
}
export async function deleteDebtRecord(id) {
  const { error } = await supabase.from('debt_records').delete().eq('id', id);
  if (error) throw error;
}
export async function fetchCashRecords() {
  const { data, error } = await supabase.from('cash_records').select('*').order('created_at', { ascending: false });
  if (error) throw error; return data;
}
export async function saveCashRecord(r) {
  const { data, error } = await supabase.from('cash_records').insert([r]).select().single();
  if (error) throw error; return data;
}
export async function updateCashRecord(id, r) {
  const { data, error } = await supabase.from('cash_records').update(r).eq('id', id).select().single();
  if (error) throw error; return data;
}
export async function deleteCashRecord(id) {
  const { error } = await supabase.from('cash_records').delete().eq('id', id);
  if (error) throw error;
}