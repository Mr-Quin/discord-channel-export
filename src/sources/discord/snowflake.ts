export const DISCORD_EPOCH_MS = 1420070400000n;

const KEY_WIDTH = 20;

export function sortKey(id: string | bigint): string {
  return BigInt(id).toString().padStart(KEY_WIDTH, "0");
}

export function idFromSortKey(key: string): string {
  return BigInt(key).toString();
}

export function snowflakeAt(date: Date): bigint {
  const ms = BigInt(date.getTime()) - DISCORD_EPOCH_MS;
  return (ms < 0n ? 0n : ms) << 22n;
}

export function dateOf(id: string | bigint): Date {
  return new Date(Number((BigInt(id) >> 22n) + DISCORD_EPOCH_MS));
}
