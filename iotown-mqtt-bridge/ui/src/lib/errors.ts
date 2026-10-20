import type { Messages } from "@/i18n/ko";
import { ApiError } from "./api";

export function errorMessage(err: unknown, t: Messages): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "INVALID_CREDENTIALS":
        return t.auth.invalid;
      case "TOO_MANY_ATTEMPTS":
        return t.auth.tooMany;
      case "WRONG_CURRENT_PASSWORD":
        return t.auth.wrongCurrent;
      case "PASSWORD_TOO_SHORT":
        return t.auth.tooShort;
      case "PASSWORD_TOO_WEAK":
        return t.auth.tooWeak;
    }
    if (t.errors[err.code]) return t.errors[err.code];
  }
  return `${t.common.errorPrefix}: ${err instanceof Error ? err.message : String(err)}`;
}
