export type GoogleSessionResponse = {
  token?: unknown;
  email?: unknown;
  is_new_user?: unknown;
};

type CompletionDependencies = {
  setSession(token: string, email: string, isNewRegistration: boolean): void;
  returningUserRoute(): Promise<string>;
};

export async function completeGoogleSession(
  response: GoogleSessionResponse | null,
  dependencies: CompletionDependencies,
): Promise<string | null> {
  if (typeof response?.token !== "string" || typeof response.email !== "string") return null;

  const isNewUser = response.is_new_user === true;
  dependencies.setSession(response.token, response.email, isNewUser);
  return isNewUser ? "/start" : dependencies.returningUserRoute();
}
