// Sample data for local development. Complexes, layouts and prices are placeholders
// until Altheo Homes confirms the real ones; the manager can change them in the app.
//
// Dev logins (password for all: altheo-dev-123):
//   manager@altheohomes.test  (MANAGER)
//   kwame@altheohomes.test    (STAFF, plumber)
//   ama@example.test          (TENANT)
//   kofi@example.test         (TENANT, no apartment yet)
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_SETTINGS } from "../lib/settings";

const prisma = new PrismaClient();
const DEV_PASSWORD = "altheo-dev-123";

type SeedComplex = {
  slug: string; name: string; area: string; address: string; description: string; amenities: string[]; floors: number; photo: string;
  types: { name: string; rent: number; deposit: number; size: number; rooms: string[]; photo: string }[];
  units: [unitNumber: string, floor: number, type: string][]; // type = index name above
};

const COMPLEXES: SeedComplex[] = [
  {
    slug: "altheo-homes", name: "Altheo Homes", area: "Accra", address: "Accra, Ghana", floors: 3, photo: "/photos/hero.jpg",
    description: "Our first building: quiet, secure and close to the city centre.",
    amenities: ["24h security", "Borehole", "Parking", "Backup power"],
    types: [
      { name: "1 bedroom", rent: 2500, deposit: 5000, size: 48, rooms: ["1 bedroom", "Hall", "Bathroom", "Toilet", "Kitchenette"], photo: "/photos/one.jpg" },
      { name: "2 bedroom", rent: 4000, deposit: 8000, size: 76, rooms: ["2 bedrooms", "Hall", "Bathroom", "Toilet", "Kitchen"], photo: "/photos/two.jpg" },
      { name: "3 bedroom", rent: 5800, deposit: 11600, size: 112, rooms: ["3 bedrooms", "Hall", "2 bathrooms", "2 toilets", "Kitchen", "Balcony"], photo: "/photos/three.jpg" },
    ],
    units: [
      ["G-01", 0, "1 bedroom"], ["G-02", 0, "1 bedroom"], ["G-03", 0, "2 bedroom"],
      ["1-01", 1, "1 bedroom"], ["1-02", 1, "2 bedroom"], ["1-03", 1, "2 bedroom"], ["1-04", 1, "2 bedroom"],
      ["2-01", 2, "3 bedroom"], ["2-02", 2, "3 bedroom"], ["2-03", 2, "2 bedroom"],
    ],
  },
  {
    slug: "altheo-east-legon", name: "Altheo East Legon", area: "East Legon", address: "East Legon, Accra", floors: 2, photo: "/photos/two.jpg",
    description: "Compact apartments in a gated compound, a short walk from shops and the main road.",
    amenities: ["Gated compound", "Borehole", "Prepaid meters"],
    types: [
      { name: "Single room self-contained", rent: 1500, deposit: 3000, size: 24, rooms: ["Bedroom", "Bathroom", "Toilet", "Kitchenette"], photo: "/photos/one.jpg" },
      { name: "Chamber & hall", rent: 2200, deposit: 4400, size: 38, rooms: ["Bedroom", "Hall", "Bathroom", "Toilet", "Kitchen"], photo: "/photos/two.jpg" },
    ],
    units: [
      ["G-01", 0, "Single room self-contained"], ["G-02", 0, "Single room self-contained"], ["G-03", 0, "Chamber & hall"],
      ["1-01", 1, "Chamber & hall"], ["1-02", 1, "Chamber & hall"],
    ],
  },
  {
    slug: "altheo-tema", name: "Altheo Tema", area: "Tema", address: "Community 25, Tema", floors: 3, photo: "/photos/three.jpg",
    description: "Family apartments with balconies and plenty of parking.",
    amenities: ["Parking", "Balconies", "Play area", "24h security"],
    types: [
      { name: "2 bedroom", rent: 3500, deposit: 7000, size: 72, rooms: ["2 bedrooms", "Hall", "Bathroom", "Toilet", "Kitchen"], photo: "/photos/two.jpg" },
      { name: "3 bedroom", rent: 5000, deposit: 10000, size: 105, rooms: ["3 bedrooms", "Hall", "2 bathrooms", "2 toilets", "Kitchen", "Balcony"], photo: "/photos/three.jpg" },
    ],
    units: [["G-01", 0, "2 bedroom"], ["1-01", 1, "2 bedroom"], ["1-02", 1, "3 bedroom"], ["2-01", 2, "3 bedroom"]],
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  let unitCount = 0;
  for (const c of COMPLEXES) {
    const property = await prisma.property.upsert({
      where: { slug: c.slug },
      update: {},
      create: { slug: c.slug, name: c.name, area: c.area, address: c.address, description: c.description, amenities: c.amenities, floors: c.floors, photos: [c.photo] },
    });
    const typeIds: Record<string, string> = {};
    for (const [i, t] of c.types.entries()) {
      const type = await prisma.roomType.upsert({
        where: { propertyId_name: { propertyId: property.id, name: t.name } },
        update: {},
        create: { propertyId: property.id, name: t.name, rentAmount: t.rent, depositAmount: t.deposit, sizeSqm: t.size, rooms: t.rooms, photos: [t.photo], sortOrder: i + 1 },
      });
      typeIds[t.name] = type.id;
    }
    for (const [unitNumber, floor, type] of c.units) {
      await prisma.unit.upsert({
        where: { propertyId_unitNumber: { propertyId: property.id, unitNumber } },
        update: {},
        create: { propertyId: property.id, roomTypeId: typeIds[type], unitNumber, floor },
      });
      unitCount++;
    }
  }

  const users = [
    { email: "manager@altheohomes.test", name: "Property Manager", phone: "0200000001", role: "MANAGER" as const },
    { email: "kwame@altheohomes.test", name: "Kwame Boateng", phone: "0200000002", role: "STAFF" as const, trade: "Plumber" },
    { email: "ama@example.test", name: "Ama Mensah", phone: "0241234567", role: "TENANT" as const },
    { email: "kofi@example.test", name: "Kofi Asante", phone: "0247654321", role: "TENANT" as const },
  ];
  for (const u of users) {
    await prisma.user.upsert({ where: { email: u.email }, update: {}, create: { ...u, passwordHash } });
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  // Ticket numbers start at 1001 so they read like ALT-1001.
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"MaintenanceRequest"', 'ticketNo'), GREATEST(1000, (SELECT COALESCE(MAX("ticketNo"), 0) FROM "MaintenanceRequest")))`
  );

  console.log(`Seeded ${COMPLEXES.length} complexes, ${unitCount} units, ${users.length} users and settings.`);
}

main().finally(() => prisma.$disconnect());
