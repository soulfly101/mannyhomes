"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/listings";

const LIST = "/manager/apartments";

const done = (path: string, error?: string): never => {
  revalidatePath(LIST, "layout");
  revalidatePath("/", "layout");
  redirect(error ? `${path}?error=${encodeURIComponent(error)}` : path);
};

const log = (actorId: string, action: string, entity: string, entityId: string, details?: object) =>
  prisma.activityLog.create({ data: { actorId, action, entity, entityId, details } });

// "a, b\nc" -> ["a", "b", "c"]
const list = z.string().optional().transform((v) => (v ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean));
const text = (max: number, msg: string) => z.string().trim().min(1, msg).max(max);
const optionalText = z.string().trim().max(1000).optional().transform((v) => v || null);
const cedisAmount = (msg: string) => z.coerce.number({ message: msg }).int(msg).min(1, msg).max(1_000_000, msg);

const complexSchema = z.object({
  name: text(80, "Give the complex a name."),
  slug: z.string().trim().max(80).optional(),
  area: text(60, "Say which area it's in."),
  address: text(200, "Add the address."),
  description: optionalText,
  amenities: list,
  photos: list,
  floors: z.coerce.number().int().min(1, "A complex has at least 1 floor.").max(50),
  listed: z.boolean(),
});

const complexFields = (form: FormData) => complexSchema.safeParse({
  name: form.get("name"), slug: form.get("slug") || undefined, area: form.get("area"), address: form.get("address"),
  description: form.get("description") ?? undefined, amenities: form.get("amenities") ?? undefined, photos: form.get("photos") ?? undefined,
  floors: form.get("floors") || 3, listed: form.get("listed") === "on",
});

async function freeSlug(base: string, exceptId?: string) {
  const root = slugify(base) || "complex";
  for (let i = 1; ; i++) {
    const slug = i === 1 ? root : `${root}-${i}`;
    const taken = await prisma.property.findFirst({ where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) } });
    if (!taken) return slug;
  }
}

export async function createComplex(form: FormData) {
  const session = await requireUser("MANAGER");
  const parsed = complexFields(form);
  if (!parsed.success) return done(`${LIST}/new`, parsed.error.issues[0].message);
  const { slug, ...data } = parsed.data;
  const complex = await prisma.property.create({ data: { ...data, slug: await freeSlug(slug || data.name) } });
  await log(session.userId, "CREATE_COMPLEX", "Property", complex.id, { name: complex.name });
  done(`${LIST}/${complex.id}`);
}

export async function updateComplex(form: FormData) {
  const session = await requireUser("MANAGER");
  const id = String(form.get("id"));
  const parsed = complexFields(form);
  if (!parsed.success) return done(`${LIST}/${id}`, parsed.error.issues[0].message);
  const { slug, ...data } = parsed.data;
  await prisma.property.update({ where: { id }, data: { ...data, slug: await freeSlug(slug || data.name, id) } });
  await log(session.userId, "UPDATE_COMPLEX", "Property", id);
  done(`${LIST}/${id}`);
}

export async function toggleComplexListed(form: FormData) {
  const session = await requireUser("MANAGER");
  const id = String(form.get("id"));
  const complex = await prisma.property.update({ where: { id }, data: { listed: form.get("listed") === "true" } });
  await log(session.userId, complex.listed ? "LIST_COMPLEX" : "UNLIST_COMPLEX", "Property", id);
  done(String(form.get("back") || LIST));
}

const roomTypeSchema = z.object({
  name: text(60, "Give the apartment type a name."),
  rentAmount: cedisAmount("Enter the monthly rent in whole cedis."),
  depositAmount: cedisAmount("Enter the security deposit in whole cedis."),
  sizeSqm: z.coerce.number().int().min(1).max(10_000).optional(),
  rooms: list,
  photos: list,
  description: optionalText,
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  listed: z.boolean(),
});

const roomTypeFields = (form: FormData) => roomTypeSchema.safeParse({
  name: form.get("name"), rentAmount: form.get("rentAmount"), depositAmount: form.get("depositAmount"),
  sizeSqm: form.get("sizeSqm") || undefined, rooms: form.get("rooms") ?? undefined, photos: form.get("photos") ?? undefined,
  description: form.get("description") ?? undefined, sortOrder: form.get("sortOrder") || 0, listed: form.get("listed") === "on",
});

export async function saveRoomType(form: FormData) {
  const session = await requireUser("MANAGER");
  const propertyId = String(form.get("propertyId"));
  const id = form.get("id") ? String(form.get("id")) : null;
  const back = `${LIST}/${propertyId}`;
  const parsed = roomTypeFields(form);
  if (!parsed.success) return done(back, parsed.error.issues[0].message);

  const clash = await prisma.roomType.findFirst({ where: { propertyId, name: parsed.data.name, ...(id ? { id: { not: id } } : {}) } });
  if (clash) return done(back, `There's already a "${parsed.data.name}" type in this complex.`);

  const data = { ...parsed.data, sizeSqm: parsed.data.sizeSqm ?? null };
  const saved = id
    ? await prisma.roomType.update({ where: { id, propertyId }, data })
    : await prisma.roomType.create({ data: { ...data, propertyId } });
  await log(session.userId, id ? "UPDATE_ROOM_TYPE" : "CREATE_ROOM_TYPE", "RoomType", saved.id, { rent: saved.rentAmount, deposit: saved.depositAmount });
  done(back);
}

export async function deleteRoomType(form: FormData) {
  const session = await requireUser("MANAGER");
  const id = String(form.get("id"));
  const propertyId = String(form.get("propertyId"));
  const used = await prisma.roomType.findUnique({ where: { id }, select: { _count: { select: { units: true, applications: true } } } });
  if (used && (used._count.units || used._count.applications)) {
    return done(`${LIST}/${propertyId}`, "This type has units or bookings. Hide it from the site instead of deleting it.");
  }
  await prisma.roomType.delete({ where: { id } });
  await log(session.userId, "DELETE_ROOM_TYPE", "RoomType", id);
  done(`${LIST}/${propertyId}`);
}

const unitSchema = z.object({
  unitNumber: text(20, "Enter the unit number, e.g. G-01."),
  floor: z.coerce.number({ message: "Choose the floor." }).int().min(0).max(50),
  roomTypeId: text(40, "Choose the apartment type."),
});

export async function addUnit(form: FormData) {
  const session = await requireUser("MANAGER");
  const propertyId = String(form.get("propertyId"));
  const back = `${LIST}/${propertyId}`;
  const parsed = unitSchema.safeParse({ unitNumber: form.get("unitNumber"), floor: form.get("floor"), roomTypeId: form.get("roomTypeId") });
  if (!parsed.success) return done(back, parsed.error.issues[0].message);
  const type = await prisma.roomType.findFirst({ where: { id: parsed.data.roomTypeId, propertyId } });
  if (!type) return done(back, "Choose an apartment type from this complex.");
  const clash = await prisma.unit.findUnique({ where: { propertyId_unitNumber: { propertyId, unitNumber: parsed.data.unitNumber } } });
  if (clash) return done(back, `Unit ${parsed.data.unitNumber} already exists here.`);
  const unit = await prisma.unit.create({ data: { ...parsed.data, propertyId } });
  await log(session.userId, "CREATE_UNIT", "Unit", unit.id, { unitNumber: unit.unitNumber });
  done(back);
}

export async function updateUnit(form: FormData) {
  const session = await requireUser("MANAGER");
  const id = String(form.get("id"));
  const propertyId = String(form.get("propertyId"));
  const back = `${LIST}/${propertyId}`;
  const parsed = unitSchema.safeParse({ unitNumber: form.get("unitNumber"), floor: form.get("floor"), roomTypeId: form.get("roomTypeId") });
  if (!parsed.success) return done(back, parsed.error.issues[0].message);
  const unit = await prisma.unit.findFirst({ where: { id, propertyId } });
  if (!unit) return done(back, "We couldn't find that unit.");
  const type = await prisma.roomType.findFirst({ where: { id: parsed.data.roomTypeId, propertyId } });
  if (!type) return done(back, "Choose an apartment type from this complex.");
  if (type.id !== unit.roomTypeId && unit.status !== "VACANT" && unit.status !== "MAINTENANCE") {
    return done(back, `Unit ${unit.unitNumber} is booked or lived in; its type can't change now.`);
  }
  const clash = await prisma.unit.findFirst({ where: { propertyId, unitNumber: parsed.data.unitNumber, id: { not: id } } });
  if (clash) return done(back, `Unit ${parsed.data.unitNumber} already exists here.`);

  // Managers can only move a unit between free and under maintenance; bookings and leases set the rest.
  const wanted = form.get("status");
  const status = (unit.status === "VACANT" || unit.status === "MAINTENANCE") && (wanted === "VACANT" || wanted === "MAINTENANCE") ? wanted : unit.status;
  await prisma.unit.update({ where: { id }, data: { ...parsed.data, status } });
  await log(session.userId, "UPDATE_UNIT", "Unit", id, { status });
  done(back);
}

export async function deleteUnit(form: FormData) {
  const session = await requireUser("MANAGER");
  const id = String(form.get("id"));
  const propertyId = String(form.get("propertyId"));
  const unit = await prisma.unit.findFirst({
    where: { id, propertyId },
    select: { unitNumber: true, _count: { select: { applications: true, leases: true, tickets: true, cleanings: true } } },
  });
  if (!unit) return done(`${LIST}/${propertyId}`, "We couldn't find that unit.");
  if (Object.values(unit._count).some(Boolean)) {
    return done(`${LIST}/${propertyId}`, `Unit ${unit.unitNumber} has history (bookings, leases or repairs), so it can't be deleted. Set it to maintenance instead.`);
  }
  await prisma.unit.delete({ where: { id } });
  await log(session.userId, "DELETE_UNIT", "Unit", id, { unitNumber: unit.unitNumber });
  done(`${LIST}/${propertyId}`);
}
