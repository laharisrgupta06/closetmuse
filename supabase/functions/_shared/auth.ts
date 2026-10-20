// Shared request authentication for ClosetMuse Edge Functions.
//
// Every function requires a signed-in user. The returned client carries the
// caller's own JWT, so all database access is subject to Row Level Security.

import {
  createClient,
  type SupabaseClient,
  type User,
} from "npm:@supabase/supabase-js@2";
import { jsonResponse } from "./http.ts";

export type AuthResult =
  | { supabase: SupabaseClient; user: User; response?: undefined }
  | { response: Response; supabase?: undefined; user?: undefined };

export async function authenticate(req: Request): Promise<AuthResult> {
  const token = (req.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey =
    req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseKey) {
    return {
      response: jsonResponse(
        { error: "Supabase is not configured for this function." },
        500
      ),
    };
  }

  if (!token) {
    return { response: jsonResponse({ error: "Authentication required." }, 401) };
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return {
      response: jsonResponse({ error: "Invalid or expired session." }, 401),
    };
  }

  return { supabase, user: data.user };
}
