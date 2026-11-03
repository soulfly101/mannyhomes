import { AvailableUnits } from "./AvailableUnits";

/** Home page. The landing hero (PrismaHero) goes above the available apartments once its source is available. */
export function ListingsPage() {
  return (
    <main className="font-geist">
      <AvailableUnits />
    </main>
  );
}
