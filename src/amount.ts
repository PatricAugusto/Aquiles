export function parseAmount(input: string): number | undefined {
  const normalized = input.trim();
  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }

  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 2_147_483_647
    ? amount
    : undefined;
}
