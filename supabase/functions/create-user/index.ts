import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

function readMappedKey(mapName: string, fallbackName: string): string {
  try {
    const keyMap = JSON.parse(Deno.env.get(mapName) ?? "{}");
    const envName = keyMap.default;
    if (envName && Deno.env.get(envName)) return Deno.env.get(envName)!;
  } catch (_) {}
  return Deno.env.get(fallbackName) ?? "";
}

function friendlyAuthError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("already") || text.includes("registered") || text.includes("exists")) {
    return "An account with this email already exists.";
  }
  if (text.includes("password")) return message;
  if (text.includes("database error creating new user")) {
    return "Employee account could not be saved. Please try again.";
  }
  return message || "Employee account could not be created.";
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
  const { data: userData, error: userError } = await callerClient.auth.getUser(token);
  if (userError || !userData.user) return respond({ error: "Invalid session" }, 401);

  const { data: caller, error: callerError } = await callerClient
    .from("profiles")
    .select("role, active")
    .eq("id", userData.user.id)
    .single();
  if (callerError || caller?.role !== "admin" || caller?.active !== true) {
    return respond({ error: "Admin access required" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const fullName = String(body.full_name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (fullName.length < 2 || !email || password.length < 8) {
    return respond({ error: "Valid name, email and password of at least 8 characters are required" }, 400);
  }
  if (email === "admin@yaafu.com") return respond({ error: "This email is reserved for the main administrator" }, 400);

  const adminClient = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const inviteToken = crypto.randomUUID();

  const { error: reserveError } = await adminClient.rpc("reserve_employee_creation", {
    p_email: email,
    p_full_name: fullName,
    p_token: inviteToken,
    p_requested_by: userData.user.id,
  });
  if (reserveError) {
    console.error("reserve_employee_creation failed", reserveError);
    return respond({ error: reserveError.message || "Employee provisioning could not start." }, 500);
  }

  const clearPermit = async () => {
    const { error } = await adminClient.rpc("clear_employee_creation_permit", {
      p_email: email,
      p_token: inviteToken,
      p_requested_by: userData.user.id,
    });
    if (error) console.error("clear_employee_creation_permit failed", error);
  };

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      yaafu_invite_token: inviteToken,
    },
  });

  if (error || !data.user) {
    await clearPermit();
    console.error("auth.admin.createUser failed", error);
    return respond({ error: friendlyAuthError(error?.message ?? "") }, 400);
  }

  const { error: metadataError } = await adminClient.auth.admin.updateUserById(data.user.id, {
    user_metadata: { full_name: fullName },
    app_metadata: { yaafu_provisioned: true, yaafu_role: "employee" },
  });
  if (metadataError) console.error("Employee metadata cleanup failed", metadataError);

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role, active")
    .eq("id", data.user.id)
    .single();

  if (profileError || profile?.role !== "employee" || profile?.active !== true) {
    await adminClient.auth.admin.deleteUser(data.user.id);
    await clearPermit();
    console.error("Employee profile verification failed", profileError, profile);
    return respond({ error: "Employee setup failed. No partial account was kept." }, 500);
  }

  return respond({ success: true, user_id: data.user.id }, 201);
});
