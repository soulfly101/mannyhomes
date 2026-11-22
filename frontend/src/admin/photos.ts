import { ApiError } from "../api";

/** A photo of a building (room_type_id null) or of one of its room types (#38). */
export type AdminPhoto = {
  id: string;
  room_type_id: string | null;
  position: number;
  width: number;
  height: number;
};

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

/** Why a file can't be uploaded, checked before sending it; null when it looks fine. The server checks again. */
export function photoProblem(file: File): string | null {
  if (!PHOTO_TYPES.includes(file.type)) return `${file.name}: use a JPEG, PNG or WebP photo.`;
  if (file.size > MAX_PHOTO_BYTES) return `${file.name}: too large. Use one under 15 MB.`;
  return null;
}

/** Sends one photo as it is (not as JSON), with the session cookie and the header the API requires. */
export async function uploadPhoto(buildingId: string, roomTypeId: string | null, file: File): Promise<AdminPhoto> {
  const query = roomTypeId ? `?room_type_id=${encodeURIComponent(roomTypeId)}` : "";
  let res: Response;
  try {
    res = await fetch(`/api/admin/buildings/${encodeURIComponent(buildingId)}/photos${query}`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "X-Requested-With": "altheo", "Content-Type": file.type },
      body: file,
    });
  } catch {
    throw new ApiError("We couldn't reach Altheo Homes. Check your connection and try again.", 0);
  }
  const data = (await res.json().catch(() => ({}))) as { detail?: unknown };
  if (!res.ok) {
    throw new ApiError(typeof data.detail === "string" ? data.detail : "Couldn't upload that photo. Try again.", res.status);
  }
  return data as AdminPhoto;
}
