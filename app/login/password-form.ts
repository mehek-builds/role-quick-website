export function passwordFormProblem(password: string, confirmation: string): string | null {
  const normalized = password.normalize("NFC");
  const length = Array.from(normalized).length;
  if (length < 15) return "Use at least 15 characters.";
  if (length > 128) return "Use no more than 128 characters.";
  if (normalized !== confirmation.normalize("NFC")) return "Passwords do not match.";
  return null;
}
