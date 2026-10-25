-- Several apartment complexes, each with its own room types.
-- Price, size, rooms and photos move from each unit onto its room type.

-- Complexes get a public slug, an area, amenities and a listed switch.
ALTER TABLE "Property" ADD COLUMN "slug" TEXT,
ADD COLUMN "area" TEXT,
ADD COLUMN "amenities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "listed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Property"
SET "slug" = trim(both '-' from lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g'))) || CASE WHEN row_number = 1 THEN '' ELSE '-' || row_number END,
    "area" = "address"
FROM (SELECT "id" AS pid, row_number() OVER (PARTITION BY lower("name") ORDER BY "id") AS row_number FROM "Property") n
WHERE n.pid = "Property"."id";

ALTER TABLE "Property" ALTER COLUMN "slug" SET NOT NULL, ALTER COLUMN "area" SET NOT NULL;
CREATE UNIQUE INDEX "Property_slug_key" ON "Property"("slug");

-- Room types.
CREATE TABLE "RoomType" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rentAmount" INTEGER NOT NULL,
    "depositAmount" INTEGER NOT NULL,
    "sizeSqm" INTEGER,
    "rooms" TEXT[],
    "photos" TEXT[],
    "listed" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RoomType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoomType_propertyId_name_key" ON "RoomType"("propertyId", "name");
ALTER TABLE "RoomType" ADD CONSTRAINT "RoomType_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One room type per (complex, old unit type), taking the values from its first unit.
INSERT INTO "RoomType" ("id", "propertyId", "name", "description", "rentAmount", "depositAmount", "sizeSqm", "rooms", "photos", "sortOrder")
SELECT DISTINCT ON ("propertyId", "type")
  'rt_' || md5("propertyId" || "type"::text), "propertyId",
  CASE "type" WHEN 'ONE_BED' THEN '1 bedroom' WHEN 'TWO_BED' THEN '2 bedroom' ELSE '3 bedroom' END,
  "description", "rentAmount", "depositAmount", "sizeSqm", "rooms", "photos",
  CASE "type" WHEN 'ONE_BED' THEN 1 WHEN 'TWO_BED' THEN 2 ELSE 3 END
FROM "Unit"
ORDER BY "propertyId", "type", "unitNumber";

ALTER TABLE "Unit" ADD COLUMN "roomTypeId" TEXT;
UPDATE "Unit" SET "roomTypeId" = 'rt_' || md5("propertyId" || "type"::text);
ALTER TABLE "Unit" ALTER COLUMN "roomTypeId" SET NOT NULL;
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Unit" DROP COLUMN "depositAmount",
DROP COLUMN "description",
DROP COLUMN "photos",
DROP COLUMN "rentAmount",
DROP COLUMN "rooms",
DROP COLUMN "sizeSqm",
DROP COLUMN "type";

DROP TYPE "UnitType";

-- Bookings remember the room type that was asked for.
ALTER TABLE "Application" ADD COLUMN "roomTypeId" TEXT;
UPDATE "Application" a SET "roomTypeId" = u."roomTypeId" FROM "Unit" u WHERE u."id" = a."unitId";
ALTER TABLE "Application" ALTER COLUMN "roomTypeId" SET NOT NULL;
ALTER TABLE "Application" ADD CONSTRAINT "Application_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
