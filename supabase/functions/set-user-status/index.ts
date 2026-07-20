import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });

function readMappedKey(mapName: string, fallbackName: string): string {
  try {
    const keyMap = JSON.parse(Deno.env.get(mapName) ?? "{}");
    const envName = keyMap.default;
    if (envName && Deno.env.get(envName)) return Deno.env.get(envName)!;
  } catch (_) {}
  return Deno.env.get(fallbackName) ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const publishableKey = readMappedKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secretKey = readMappedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !url || !publishableKey || !secretKey) return respond({ error: "Unauthorized" }, 401);

  const callerClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData } = await callerClient.auth.getUser(token);
  if (!userData.user) return respond({ error: "Invalid session" }, 401);

  const { data: caller } = await callerClient.from("profiles").select("role, active").eq("id", userData.user.id).single();
  if (caller?.role !== "admin" || caller?.active !== true) return respond({ error: "Admin access required" }, 403);

  const body = await req.json().catch(() => ({}));
  const userId = String(body.user_id ?? "");
  const active = body.active === true;
  if (!userId || userId === userData.user.id) return respond({ error: "Main administrator cannot be changed" }, 400);

  const adminClient = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: target } = await adminClient.from("profiles").select("role").eq("id", userId).single();
  if (target?.role !== "employee") return respond({ error: "Employee not found" }, 404);

  const { error } = await adminClient.from("profiles").update({ active }).eq("id", userId);
  if (error) return respond({ error: error.message }, 400);
  return respond({ success: true, active });
});
