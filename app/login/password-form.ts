export function passwordFormProblem(password: string, confirmation: string): string | null {
  const length = Array.from(password.normalize("NFC")).length;
  if (length < 15) return "Use at least 15 characters.";
  if (length > 128) return "Use no more than 128 characters.";
  if (password !== confirmation) return "Passwords do not match.";
  return null;
}
