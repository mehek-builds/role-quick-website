const DEFAULT_REQUEST_ERROR = "Could not send a sign-in code. Try again in a minute.";

export function requestCodeError(status: number, error?: unknown): string {
  if (status === 429) {
    return "Too many sign-in attempts. Wait a few minutes, then try again.";
  }

  if (status === 503 || error === "verification_unavailable") {
    return "We could not send a sign-in code. Try again in a minute. If this keeps happening, contact support.";
  }

  if (status === 400) {
    return "Enter a valid email address.";
  }

  return DEFAULT_REQUEST_ERROR;
}

export function verifyCodeError(status: number, error?: unknown): string {
  if (status === 429) {
    return "Too many attempts. Request a new code.";
  }

  if (error === "Incorrect code." || error === "Code expired or not found. Request a new one.") {
    return error;
  }

  return "That code did not work. Request a new one.";
}
