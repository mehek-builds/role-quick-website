export type PasswordUpdateResult =
  | { kind: "success"; token: string; email?: string }
  | { kind: "rejected"; error: string; code?: string }
  | { kind: "recovery_required" };

type PasswordUpdateInput = {
  apiUrl: string;
  token: string;
  password: string;
  currentPassword?: string;
  headers?: Record<string, string>;
};

async function oldSessionSurvives(
  fetchImpl: typeof fetch,
  input: PasswordUpdateInput,
): Promise<boolean> {
  try {
    const probe = await fetchImpl(`${input.apiUrl}/me`, {
      headers: { Authorization: `Bearer ${input.token}`, ...input.headers },
    });
    return probe.ok;
  } catch {
    // A lost mutation response plus a failed probe cannot be retried safely.
    return false;
  }
}

export async function updatePasswordSession(
  input: PasswordUpdateInput,
  fetchImpl: typeof fetch = fetch,
): Promise<PasswordUpdateResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${input.apiUrl}/auth/password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.token}`,
        ...input.headers,
      },
      body: JSON.stringify({
        password: input.password,
        ...(input.currentPassword ? { current_password: input.currentPassword } : {}),
      }),
    });
  } catch {
    return await oldSessionSurvives(fetchImpl, input)
      ? { kind: "rejected", error: "Network error. Check your connection and try again." }
      : { kind: "recovery_required" };
  }

  const data = await response.json().catch(() => null) as {
    token?: unknown;
    email?: unknown;
    error?: unknown;
    code?: unknown;
  } | null;
  if (response.ok && typeof data?.token === "string") {
    return {
      kind: "success",
      token: data.token,
      ...(typeof data.email === "string" ? { email: data.email } : {}),
    };
  }
  if (!response.ok) {
    const code = typeof data?.code === "string" ? data.code : undefined;
    if (response.status >= 500) {
      return await oldSessionSurvives(fetchImpl, input)
        ? { kind: "rejected", error: "Service unavailable. Try again." }
        : { kind: "recovery_required" };
    }
    if (
      code === "session_changed"
      || code === "recent_verification_required"
      || (response.status === 401 && code !== "current_password_incorrect")
    ) {
      return { kind: "recovery_required" };
    }
    return {
      kind: "rejected",
      error: typeof data?.error === "string" ? data.error : "Could not update your password.",
      ...(code ? { code } : {}),
    };
  }
  return await oldSessionSurvives(fetchImpl, input)
    ? { kind: "rejected", error: "Could not confirm the password update. Try again." }
    : { kind: "recovery_required" };
}
