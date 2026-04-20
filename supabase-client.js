import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const DEFAULT_SUPABASE_URL = "https://begttfktetyeqjoltehs.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_3P7qQ_nLAca54GbkRkz-fQ_mkw1ZPJ1";

const supabaseUrl =
  import.meta.env?.VITE_SUPABASE_URL ||
  import.meta.env?.SUPABASE_URL ||
  window.VITE_SUPABASE_URL ||
  window.SUPABASE_URL ||
  DEFAULT_SUPABASE_URL;

const supabaseKey =
  import.meta.env?.VITE_SUPABASE_KEY ||
  import.meta.env?.SUPABASE_KEY ||
  window.VITE_SUPABASE_KEY ||
  window.SUPABASE_KEY ||
  DEFAULT_SUPABASE_KEY;

export const isSupabaseEnabled = Boolean(supabaseUrl && supabaseKey);

export const supabase = isSupabaseEnabled ? createClient(supabaseUrl, supabaseKey) : null;

if (!isSupabaseEnabled) {
  console.warn("Supabase disabled: set VITE_SUPABASE_URL and VITE_SUPABASE_KEY in .env");
}
