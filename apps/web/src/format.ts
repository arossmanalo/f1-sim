export function formatGap(milliseconds: number, leader = false): string {
  if (leader) return "Interval";
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "—";
  return `+${(milliseconds / 1000).toFixed(3)}`;
}

export function displayName(driver?: { givenName: string; familyName: string }): string {
  return driver ? `${driver.givenName} ${driver.familyName}` : "Unknown driver";
}

export function sentence(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}
