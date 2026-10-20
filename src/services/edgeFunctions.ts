/**
 * edgeFunctions.ts
 * Calls Supabase Edge Functions and turns their failures into clear,
 * user-facing error messages. supabase-js attaches the signed-in user's
 * access token automatically.
 */
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export class EdgeFunctionError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "EdgeFunctionError";
    this.status = status;
    this.code = code;
  }
}

async function describeError(name: string, error: unknown): Promise<EdgeFunctionError> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    const body = await response.json().catch(() => null);

    if (response.status === 404 && !body?.error) {
      return new EdgeFunctionError(
        `The "${name}" service is not deployed yet.`,
        404,
        "not_deployed"
      );
    }
    if (response.status === 401) {
      return new EdgeFunctionError(
        "Your session has expired. Please sign in again.",
        401,
        "unauthenticated"
      );
    }
    return new EdgeFunctionError(
      body?.error ?? `The "${name}" service failed (HTTP ${response.status}).`,
      response.status,
      body?.code
    );
  }

  if (error instanceof FunctionsFetchError) {
    return new EdgeFunctionError(
      `Could not reach the "${name}" service. Check your connection and try again.`,
      0,
      "network"
    );
  }

  if (error instanceof FunctionsRelayError) {
    return new EdgeFunctionError(`The "${name}" service is temporarily unavailable.`, 502, "relay");
  }

  return new EdgeFunctionError(
    error instanceof Error ? error.message : `The "${name}" service failed.`,
    500
  );
}

export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw await describeError(name, error);
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new EdgeFunctionError(String(data.error), 500, (data as { code?: string }).code);
  }
  return data as T;
}
