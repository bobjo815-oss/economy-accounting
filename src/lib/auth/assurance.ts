export function requiresStrongSession(
  verifiedTotpCount: number,
  currentLevel: string | null,
  nextLevel: string | null,
) {
  if (verifiedTotpCount === 0) return true;
  return nextLevel === "aal2" && currentLevel !== "aal2";
}
