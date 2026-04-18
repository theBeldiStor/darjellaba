import { createClient } from "@supabase/supabase-js";

// Step 1: Read environment variables exposed by Vite.
// Only variables prefixed with VITE_ are available in frontend code.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

// Step 2: Validate variables early to avoid silent runtime errors.
if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase env variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_KEY in .env"
  );
}

// Step 3: Initialize and export the Supabase client.
export const supabase = createClient(supabaseUrl, supabaseKey);
