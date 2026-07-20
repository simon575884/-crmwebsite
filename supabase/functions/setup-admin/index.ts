import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(() => new Response(JSON.stringify({ error: "Administrator setup is disabled." }), { status: 410, headers: { "Content-Type": "application/json" } }));
