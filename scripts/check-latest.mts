import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.URL!, process.env.KEY!, { auth: { persistSession: false } });
const { data: assets } = await sb.from("assets").select("id, name, kind, status, created_at").order("created_at", { ascending: false }).limit(3);
console.log("ASSETS:", JSON.stringify(assets, null, 1));
const { data: proofs } = await sb.from("proofs").select("asset_version_id, id, score, status, model, summary, created_at").order("created_at", { ascending: false }).limit(3);
console.log("PROOFS:", JSON.stringify(proofs, null, 1));
