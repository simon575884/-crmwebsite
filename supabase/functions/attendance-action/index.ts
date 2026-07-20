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

function pakistanDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const publishableKey = readMappedKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secretKey = readMappedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !url || !publishableKey || !secretKey) return respond({ error: "Authentication or server configuration missing" }, 401);

  const callerClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData } = await callerClient.auth.getUser(token);
  if (!userData.user) return respond({ error: "Invalid session" }, 401);

  const { data: profile } = await callerClient.from("profiles").select("active").eq("id", userData.user.id).single();
  if (profile?.active !== true) return respond({ error: "Account is inactive" }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  if (!["check_in", "check_out"].includes(action)) return respond({ error: "Invalid attendance action" }, 400);

  const adminClient = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const workDate = pakistanDate();
  const { data: existing, error: readError } = await adminClient
    .from("attendance")
    .select("id, check_in, check_out")
    .eq("user_id", userData.user.id)
    .eq("work_date", workDate)
    .maybeSingle();
  if (readError) return respond({ error: readError.message }, 400);

  const timestamp = new Date().toISOString();
  if (action === "check_in") {
    if (existing) {
      return respond({ error: existing.check_out ? "Attendance is already completed for today" : "You are already checked in" }, 409);
    }
    const { data, error } = await adminClient
      .from("attendance")
      .insert({ user_id: userData.user.id, work_date: workDate, check_in: timestamp })
      .select()
      .single();
    if (error) return respond({ error: error.message }, 400);
    return respond({ success: true, record: data }, 201);
  }

  if (!existing) return respond({ error: "No check-in found for today" }, 409);
  if (existing.check_out) return respond({ error: "Attendance is already completed for today" }, 409);

  const { data, error } = await adminClient
    .from("attendance")
    .update({ check_out: timestamp })
    .eq("id", existing.id)
    .select()
    .single();
  if (error) return respond({ error: error.message }, 400);
  return respond({ success: true, record: data });
});
