import "server-only";
import { prisma } from "./prisma";

// Prices are only read from the database for logged-in users, so they never reach a guest's browser.
const roomBase = { id: true, name: true, description: true, sizeSqm: true, rooms: true, photos: true } as const;
const roomWithPrices = { ...roomBase, rentAmount: true, depositAmount: true } as const;

export type ListedRoomType = {
  id: string; name: string; description: string | null; sizeSqm: number | null; rooms: string[]; photos: string[];
  rentAmount?: number; depositAmount?: number;
  free: number; // vacant units right now
};

export type ListedComplex = {
  id: string; slug: string; name: string; area: string; address: string; description: string | null;
  amenities: string[]; photos: string[]; roomTypes: ListedRoomType[];
};

const roomSelect = (showPrices: boolean) => ({
  ...(showPrices ? roomWithPrices : roomBase),
  _count: { select: { units: { where: { status: "VACANT" as const } } } },
});

const complexSelect = (showPrices: boolean) => ({
  id: true, slug: true, name: true, area: true, address: true, description: true, amenities: true, photos: true,
  roomTypes: { where: { listed: true }, select: roomSelect(showPrices), orderBy: [{ sortOrder: "asc" as const }, { name: "asc" as const }] },
});

type RawRoom = Omit<ListedRoomType, "free"> & { _count: { units: number } };
const toRoom = ({ _count, ...r }: RawRoom): ListedRoomType => ({ ...r, free: _count.units });

/** Listed complexes, each with its listed room types. Complexes with nothing free are left out unless `includeFull`. */
export async function listComplexes(showPrices: boolean, area?: string, includeFull = false): Promise<ListedComplex[]> {
  const rows = await prisma.property.findMany({
    where: { listed: true, ...(area ? { area } : {}) },
    select: complexSelect(showPrices),
    orderBy: { name: "asc" },
  });
  return rows
    .map((c) => ({ ...c, roomTypes: c.roomTypes.map(toRoom) }))
    .filter((c) => includeFull || c.roomTypes.some((r) => r.free > 0));
}

export async function getComplex(slug: string, showPrices: boolean): Promise<ListedComplex | null> {
  const c = await prisma.property.findFirst({ where: { slug, listed: true }, select: complexSelect(showPrices) });
  return c && { ...c, roomTypes: c.roomTypes.map(toRoom) };
}

export async function getRoomType(slug: string, id: string, showPrices: boolean) {
  const r = await prisma.roomType.findFirst({
    where: { id, listed: true, property: { slug, listed: true } },
    select: { ...roomSelect(showPrices), property: { select: { slug: true, name: true, area: true, address: true } } },
  });
  if (!r) return null;
  const { property, ...room } = r;
  return { ...toRoom(room as RawRoom), property };
}

/** Areas that have something free, for the search box. */
export const areasOf = (complexes: ListedComplex[]) => [...new Set(complexes.map((c) => c.area))].sort();

/** Lowest rent among a complex's room types that have a free unit. */
export const fromPrice = (c: ListedComplex) => {
  const prices = c.roomTypes.filter((r) => r.free > 0 && r.rentAmount !== undefined).map((r) => r.rentAmount!);
  return prices.length ? Math.min(...prices) : undefined;
};

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
