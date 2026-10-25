"use client";

import { useActionState } from "react";
import { bookRoomType, type BookState } from "./actions";

export function BookForm({ roomTypeId, deposit }: { roomTypeId: string; deposit: string }) {
  const [state, action, pending] = useActionState<BookState, FormData>(bookRoomType, {});
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="roomTypeId" value={roomTypeId} />
      <label className="field-label">
        When do you want to move in?
        <input className="input" type="date" name="moveInDate" min={today} required />
      </label>
      <label className="field-label">
        Anything the manager should know? (optional)
        <textarea className="input" name="notes" rows={2} maxLength={500} placeholder="Who will live with you, work, pets…" />
      </label>
      <span className="form-error" role="alert">{state.error}</span>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Please wait…" : `Book and pay ${deposit}`}
      </button>
      <small className="text-center" style={{ color: "var(--muted)" }}>Pay by Mobile Money or card.</small>
    </form>
  );
}
