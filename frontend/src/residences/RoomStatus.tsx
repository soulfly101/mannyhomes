import { Link } from "react-router";
import { sectionClass } from "../landing/parts";
import type { RoomState } from "./data";

/** Loading, "not available" and error states shared by the details and booking pages. Renders nothing once ready. */
export function RoomStatus({ state }: { state: RoomState }) {
  if (state.status === "ready") return null;
  return (
    <section className={`${sectionClass} py-16 md:py-24`}>
      {state.status === "loading" && <p className="text-muted-foreground">Loading residence…</p>}
      {state.status === "not-found" && (
        <div className="max-w-xl">
          <h1 className="font-serif text-4xl font-medium">This residence isn't available</h1>
          <p className="mt-4 text-muted-foreground">It may have been taken off the list. Have a look at what's free right now.</p>
          <Link to="/residences" className="mt-6 inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:underline">
            See all residences
          </Link>
        </div>
      )}
      {state.status === "error" && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.message}
        </p>
      )}
    </section>
  );
}
