import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  "https://yyxkhtqgnfwpvafuwsnc.supabase.co",
  "sb_publishable_7JbzfFnjiz5TpRQpOvnshg_HMN5CpU-"
);

export async function fetchDebtRecords() {
  const { data, error } = await supabase.from('debt_records').select('*').order('created_at', { ascending: false });
  if (error) throw error; return data;
}
export
