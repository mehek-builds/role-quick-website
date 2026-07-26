export type GoogleSessionResponse = {
  token?: unknown;
  email?: unknown;
  is_new_user?: unknown;
};

type CompletionDependencies = {
  setSession(token: string, email: string): void;
  returningUserRoute(): Promise<string>;
};

export async function completeGoogleSession(
  response: GoogleSessionResponse | null,
  dependencies: CompletionDependencies,
): Promise<string | null> {
  if (typeof response?.token !== "string" || typeof response.email !== "string") return null;

  dependencies.setSession(response.token, response.email);
  return response.is_new_user === true ? "/start" : dependencies.returningUserRoute();
}
