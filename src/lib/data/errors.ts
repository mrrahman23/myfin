import type { PostgrestError } from "@supabase/supabase-js";

export class AppError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

const FRIENDLY: Record<string, string> = {
  "23505": "That already exists.",
  "23503": "This is still in use, or refers to something that no longer exists.",
  "42501": "You don't have permission to do that.",
  "28000": "Your session has expired. Please sign in again.",
  PGRST301: "Your session has expired. Please sign in again.",
};

export function toAppError(error: PostgrestError | Error | { message: string; code?: string }): AppError {
  const code = "code" in error ? (error.code as string | undefined) : undefined;
  const raw = error.message || "Something went wrong";
  // custom RAISE messages from our functions are already user friendly
  if (code === "P0001" || code === "P0002" || code === "22023" || code === "23514") return new AppError(raw, code);
  if (/fetch|network|Failed to fetch|Load failed/i.test(raw)) {
    return new AppError("You appear to be offline. Check your connection and try again.", "offline");
  }
  if (code === "23503" && /restrict|still referenced|violates foreign key/i.test(raw)) {
    return new AppError("This is used by existing items. Archive it instead.", code);
  }
  return new AppError((code && FRIENDLY[code]) || raw, code);
}

/** Throws a friendly error when a Supabase call fails, otherwise returns data. */
export function unwrap<T>(res: { data: T | null; error: PostgrestError | null }): T {
  if (res.error) throw toAppError(res.error);
  return res.data as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}
