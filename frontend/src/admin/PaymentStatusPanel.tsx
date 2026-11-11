import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CircleCheck, CircleDot, CircleX, type LucideIcon } from "lucide-react";
import { ApiError, apiFetch } from "../api";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { FormError } from "@/components/ui/sign-in";
import { cn } from "@/lib/utils";
import { formatCedis, formatMonth } from "../format";
import { emptyClass, Panel, selectClass } from "./dashboardParts";

export type Status = "paid" | "partial" | "unpaid";
export type Fee = "all" | "booking_deposit" | "renting_deposit" | "sanitation";
export type PaymentStatus = {
  period: string;
  fee: Fee;
  building_id: string | null;
  groups: { key: Status; label: string; count: number; owed: number }[];
  tenants: { id: string; name: string; room: string; building: string; status: Status; owed: number }[];
  not_billed: number;
  buildings: { id: string; name: string }[];
};

export const FEES: [Fee, string][] = [
  ["all", "All fees"],
  ["booking_deposit", "Booking deposit"],
  ["renting_deposit", "Renting deposit"],
  ["sanitation", "Sanitation fee"],
];

// Status colours are reserved for state, and always come with an icon and a word.
const LOOK: Record<Status, { color: string; icon: LucideIcon; tone: BadgeTone }> = {
  paid: { color: "var(--success)", icon: CircleCheck, tone: "success" },
  partial: { color: "var(--warning)", icon: CircleDot, tone: "warning" },
  unpaid: { color: "var(--destructive)", icon: CircleX, tone: "danger" },
};

/** The last `count` months as "YYYY-MM", this month first (UTC, like the server). */
export function lastMonths(count: number, today = new Date()): string[] {
  const index = today.getUTCFullYear() * 12 + today.getUTCMonth();
  return Array.from({ length: count }, (_, i) => {
    const m = index - i;
    return `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
  });
}

const percent = (n: number, total: number) => Math.round((n / total) * 100);

/** One bar split into Paid / Partly paid / Nothing paid, with a tooltip per part and a table for screen readers. */
function StatusBar({ groups, total }: { groups: PaymentStatus["groups"]; total: number }) {
  const [hover, setHover] = useState<Status | null>(null);
  const shown = groups.find((g) => g.key === hover);
  return (
    <div className="relative mt-6">
      <div className="flex h-8 w-full gap-0.5" aria-hidden="true">
        {groups
          .filter((g) => g.count > 0)
          .map((g) => (
            <div
              key={g.key}
              data-status={g.key}
              className="h-full rounded transition-opacity duration-200 first:rounded-l-md last:rounded-r-md"
              style={{ width: `${(g.count / total) * 100}%`, background: LOOK[g.key].color, opacity: hover && hover !== g.key ? 0.55 : 1 }}
              onPointerEnter={() => setHover(g.key)}
              onPointerLeave={() => setHover(null)}
            />
          ))}
      </div>
      {shown && (
        <div role="status" className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-md">
          <span className="font-semibold">{shown.label}</span>: {shown.count} of {total}
          {shown.owed > 0 && <span className="text-muted-foreground">, {formatCedis(shown.owed)} owed</span>}
        </div>
      )}
      <table className="sr-only">
        <caption>Tenants by payment status</caption>
        <thead>
          <tr>
            <th scope="col">Status</th>
            <th scope="col">Tenants</th>
            <th scope="col">Owed</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.key}>
              <td>{g.label}</td>
              <td>{g.count}</td>
              <td>{formatCedis(g.owed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Filter({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <label className="flex min-w-36 flex-1 flex-col gap-1 text-sm text-muted-foreground sm:flex-none">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {children}
      </select>
    </label>
  );
}

/** Who has paid (#20): tenants with a room, grouped by payment status, filtered by building, fee and month. */
export function PaymentStatusPanel() {
  const months = useMemo(() => lastMonths(12), []);
  const [period, setPeriod] = useState(months[0]);
  const [fee, setFee] = useState<Fee>("all");
  const [building, setBuilding] = useState("");
  const [data, setData] = useState<PaymentStatus | null>(null);
  const [buildings, setBuildings] = useState<PaymentStatus["buildings"]>([]);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Status | null>(null);

  useEffect(() => {
    let current = true;
    const query = new URLSearchParams({ period, fee, ...(building ? { building_id: building } : {}) });
    apiFetch<PaymentStatus>(`/api/admin/overview/payments?${query}`)
      .then((d) => {
        if (!current) return;
        setData(d);
        setBuildings(d.buildings);
        setPicked(null);
        setError("");
      })
      .catch((e) => current && setError(e instanceof ApiError ? e.message : "Couldn't load who has paid. Try again."));
    return () => {
      current = false;
    };
  }, [period, fee, building]);

  const total = data ? data.groups.reduce((n, g) => n + g.count, 0) : 0;
  // Show who owes first; if nobody does, show who has paid.
  const open = picked ?? data?.groups.find((g) => g.key !== "paid" && g.count > 0)?.key ?? "paid";
  const group = data?.groups.find((g) => g.key === open);
  const list = data?.tenants.filter((t) => t.status === open) ?? [];
  const where = buildings.find((b) => b.id === building)?.name;
  const isDeposit = fee === "booking_deposit" || fee === "renting_deposit";

  return (
    <Panel title="Who has paid">
      <div className="mt-3 flex flex-wrap gap-3">
        <Filter label="Building" value={building} onChange={setBuilding}>
          <option value="">All buildings</option>
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Filter>
        <Filter label="Fee" value={fee} onChange={(v) => setFee(v as Fee)}>
          {FEES.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Filter>
        <Filter label="Month" value={period} onChange={setPeriod}>
          {months.map((m) => (
            <option key={m} value={m}>
              {formatMonth(m, true)}
            </option>
          ))}
        </Filter>
      </div>
      {isDeposit && <p className="mt-3 text-sm text-muted-foreground">Deposits are paid once. The month picks who had a room then.</p>}
      {fee === "all" && <p className="mt-3 text-sm text-muted-foreground">Fully paid means the booking deposit, renting deposit and that month's sanitation fee. Late fees aren't included.</p>}

      {error && (
        <div className="mt-4">
          <FormError>{error}</FormError>
        </div>
      )}
      {!data && !error && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
      {data && total === 0 && (
        <p className={emptyClass}>
          No tenants to show for {formatMonth(period, true)}
          {where ? ` at ${where}` : ""}. Tenants appear here once they have a room
          {fee === "sanitation" || fee === "all" ? " and their first sanitation bill" : ""}.
        </p>
      )}
      {data && total > 0 && (
        <>
          <StatusBar groups={data.groups} total={total} />
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="Show tenants who are">
            {data.groups.map((g) => {
              const Icon = LOOK[g.key].icon;
              return (
                <button
                  key={g.key}
                  type="button"
                  aria-pressed={open === g.key}
                  onClick={() => setPicked(g.key)}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm hover:shadow-sm",
                    open === g.key ? "border-foreground/40 bg-secondary" : "border-border bg-card",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" style={{ color: LOOK[g.key].color }} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-foreground">{g.label}</span>
                    <span className="block text-muted-foreground">{g.owed > 0 ? `${formatCedis(g.owed)} owed` : g.key === "paid" ? "Nothing owed" : ""}</span>
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {g.count}
                    <span className="font-normal text-muted-foreground"> ({percent(g.count, total)}%)</span>
                  </span>
                </button>
              );
            })}
          </div>

          <h3 className="mt-6 text-base font-semibold">
            {group?.label} ({list.length})
          </h3>
          {list.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nobody in this group.</p>
          ) : (
            <ul className="mt-1 flex flex-col divide-y divide-border" aria-label={`${group?.label} tenants`}>
              {list.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{t.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      Room {t.room}, {t.building}
                    </p>
                  </div>
                  {t.owed > 0 ? (
                    <span className="text-sm font-semibold tabular-nums">{formatCedis(t.owed)} owed</span>
                  ) : (
                    <Badge tone={LOOK[t.status].tone}>Paid</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {data && data.not_billed > 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          {data.not_billed} {data.not_billed === 1 ? "tenant" : "tenants"} with a room {data.not_billed === 1 ? "isn't" : "aren't"} counted:{" "}
          {isDeposit ? "the bill was cancelled." : `no sanitation bill for ${formatMonth(period, true)} yet (not moved in or not signed).`}
        </p>
      )}
    </Panel>
  );
}
