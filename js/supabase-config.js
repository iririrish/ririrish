// Supabase Storage holds the actual image files (free plan). Firestore holds only the image records.
// Paste your Project URL and anon (public) key from Supabase > Project Settings > API.
// The anon key is public by design; access is limited by the bucket and policies in supabase-setup.sql.
export const SUPABASE_URL = "https://mqbmleretczqgmxyvdwr.supabase.co"; 
export const SUPABASE_ANON_KEY = "sb_publishable_UZkC4Qis-nLz-BVfYvSReA_MExupUYg";

export const BUCKET = "thesis-images";
export const storageReady = !SUPABASE_URL.startsWith("YOUR_");

let client; // loaded lazily so the dashboard never depends on this CDN
export async function getSb() {
  if (!storageReady) throw new Error("Image storage is not set up. Add your Supabase URL and anon key to js/supabase-config.js.");
  if (!client) {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.4");
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }
  return client;
}
