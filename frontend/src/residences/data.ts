import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "../api";
import { useAuth } from "../auth/AuthContext";
import { RESIDENCES } from "../landing/content";
import type { ListingsResponse, RoomListing } from "../listings/types";

/** A room type in a building, flattened for the residence pages and the contact form. */
export type Residence = {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  rent: number | null;
  sanitation: number | null;
  /** null for visitors; 0 when the admin hasn't set it yet. */
  bookingDeposit: number | null;
  building: string;
  location: string;
};

export const photoFor = (name: string) => RESIDENCES.photos[name.toLowerCase()] ?? RESIDENCES.fallback;
export const availability = (n: number) => (n === 0 ? "Fully booked" : `${n} available`);

export const toResidences = (d: ListingsResponse): Residence[] =>
  d.buildings.flatMap((b) =>
    b.room_types.map((rt) => ({
      id: rt.id,
      name: rt.name,
      description: rt.description ?? b.description,
      quantity: rt.quantity_available,
      rent: rt.rent,
      sanitation: rt.sanitation_fee,
      bookingDeposit: rt.booking_deposit,
      building: b.name,
      location: b.location,
    })),
  );

export const fromRoomListing = ({ room, building }: RoomListing): Residence => ({
  id: room.id,
  name: room.name,
  description: room.description ?? building.description,
  quantity: room.quantity_available,
  rent: room.rent,
  sanitation: room.sanitation_fee,
  bookingDeposit: room.booking_deposit,
  building: building.name,
  location: building.location,
});

/** Every listed room type (for the contact form's "Residence of interest" and the landing preview). */
export function useAllResidences() {
  const [residences, setResidences] = useState<Residence[] | null>(null);
  useEffect(() => {
    let current = true;
    apiFetch<ListingsResponse>("/api/listings")
      .then((d) => current && setResidences(toResidences(d)))
      .catch(() => current && setResidences([]));
    return () => {
      current = false;
    };
  }, []);
  return residences;
}

export type RoomState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error"; message: string }
  | { status: "ready"; residence: Residence; pricesVisible: boolean };

/** One room type by id. Loads again when someone logs in or out, so prices appear or disappear. */
export function useRoom(id: string | undefined): RoomState {
  const { user } = useAuth();
  const viewer = user === undefined ? undefined : (user?.id ?? null);
  const [state, setState] = useState<RoomState>({ status: "loading" });
  useEffect(() => {
    if (!id || viewer === undefined) return;
    let current = true;
    setState({ status: "loading" });
    apiFetch<RoomListing>(`/api/listings/rooms/${encodeURIComponent(id)}`)
      .then((d) => current && setState({ status: "ready", residence: fromRoomListing(d), pricesVisible: d.prices_visible }))
      .catch((e) => {
        if (!current) return;
        if (e instanceof ApiError && e.status === 404) setState({ status: "not-found" });
        else setState({ status: "error", message: e instanceof ApiError ? e.message : "Couldn't load this residence. Try again." });
      });
    return () => {
      current = false;
    };
  }, [id, viewer]);
  return state;
}
