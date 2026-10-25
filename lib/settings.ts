import { prisma } from "./prisma";

// Every price the admin controls that isn't stored on a unit.
export type Settings = {
  bookingDeposit: number;
  sanitationFee: number;
  cleaningPrices: { STANDARD: number; DEEP: number; MOVE_OUT: number };
  holdHours: number;
};

export const DEFAULT_SETTINGS: Settings = {
  bookingDeposit: 200,
  sanitationFee: 50,
  cleaningPrices: { STANDARD: 150, DEEP: 350, MOVE_OUT: 450 },
  holdHours: 48,
};

export async function getSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...stored } as Settings;
}
