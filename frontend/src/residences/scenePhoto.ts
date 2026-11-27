import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { PHOTOS } from "../landing/content";
import type { ListingsResponse } from "../listings/types";
import { photoUrl } from "./data";

let pending: Promise<string> | null = null;

/** The first photo the admin uploaded for a listed building (else a room type's), or the stock photo. */
export function loadScenePhoto(): Promise<string> {
  pending ??= apiFetch<ListingsResponse>("/api/listings")
    .then((d) => {
      const building = d.buildings.find((b) => b.photos?.length);
      const id = building?.photos?.[0] ?? d.buildings.flatMap((b) => b.room_types).find((rt) => rt.photos?.length)?.photos?.[0];
      return id ? photoUrl(id) : PHOTOS.hero;
    })
    .catch(() => {
      pending = null;
      return PHOTOS.hero;
    });
  return pending;
}

/** For tests: forget the photo found earlier. */
export const resetScenePhoto = () => {
  pending = null;
};

/** The backdrop for glass pages (DESIGN.md → Glass): the stock photo at first, then the owner's own when known. */
export function useScenePhoto() {
  const [photo, setPhoto] = useState(PHOTOS.hero);
  useEffect(() => {
    let current = true;
    void loadScenePhoto().then((p) => current && setPhoto(p));
    return () => {
      current = false;
    };
  }, []);
  return photo;
}
