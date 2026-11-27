import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { BedDouble, Building2, Clock, Command, FileSignature, KeyRound, LayoutDashboard, Mail, MessageSquare, Send, Users, Wallet, Wrench, X, type LucideIcon } from "lucide-react";
import { ApiError, apiFetch } from "../api";
import { Reveal } from "../components/Reveal";
import { UserInitials } from "../components/UserInitials";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { GlassDock, dockPanelId, dockTabId, type DockView } from "@/components/ui/glass-dock";
import { GlassPanel } from "@/components/ui/glass-panel";
import { useViewTransition } from "@/lib/motion";
import { FormError } from "@/components/ui/sign-in";
import { formatCedis, formatMonth, timeAgo } from "../format";
import { sectionClass } from "../landing/parts";
import { emptyClass, Panel, panelClass, selectClass } from "./dashboardParts";
import { BackupStatusLine, type BackupStatus } from "./BackupStatusLine";
import { PaymentStatusPanel } from "./PaymentStatusPanel";

type Stage = { key: string; label: string; count: number };
type Overview = {
  figures: {
    active_tenants: number;
    rooms_available: number;
    buildings: number;
    waiting_for_room: number;
    waiting_to_sign: number;
    collected_this_month: number;
    collected_last_month: number;
    still_owed: number;
  };
  revenue: { month: string; amount: number }[];
  stages: Stage[];
  recent_tenants: { id: string; name: string; email: string; status: string; tone: "success" | "warning" | "neutral" }[];
  activity: { kind: "payment" | "allocation" | "agreement" | "enquiry"; text: string; at: string }[];
  backup?: BackupStatus | null;
};

function Stat({ label, value, icon: Icon, children }: { label: string; value: ReactNode; icon: LucideIcon; children: ReactNode }) {
  return (
    <div className={`${panelClass} flex h-full items-start justify-between gap-3`}>
      <div className="min-w-0">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="mt-1 text-3xl font-bold tabular-nums tracking-tight">{value}</dd>
        <div className="mt-1 text-sm text-muted-foreground">{children}</div>
      </div>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
    </div>
  );
}

/** Change from last month, in words and with a sign, so it's never colour alone. */
function Change({ now, before }: { now: number; before: number }) {
  if (before === 0) return <>{now > 0 ? "Nothing collected last month" : "Nothing collected yet"}</>;
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return <>Same as last month</>;
  return (
    <span className={change < 0 ? "text-destructive" : "text-success"}>
      {change > 0 ? "+" : ""}
      {change}% from last month
    </span>
  );
}

const niceMax = (value: number) => {
  if (value <= 0) return 100;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((n) => n * power >= value) ?? 10;
  return step * power;
};

const W = 640;
const H = 280;
const PAD = { top: 16, right: 16, bottom: 28, left: 64 };

/** Money collected per month: a line with a light solid wash under it, one hover point per month. */
function RevenueChart({ data }: { data: Overview["revenue"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map((d) => d.amount)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const line = data.map((d, i) => `${x(i)},${y(d.amount)}`).join(" ");
  const area = `${x(0)},${y(0)} ${line} ${x(data.length - 1)},${y(0)}`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / (box.width || W)) * W;
    let nearest = 0;
    data.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(nearest) - px)) nearest = i;
    });
    setHover(nearest);
  };
  const point = hover === null ? null : data[hover];

  return (
    <div className="relative mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-pan-y" role="img" aria-label="Money collected per month" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill="var(--muted-foreground)">
              {t >= 1000 ? `${t / 1000}k` : t}
            </text>
          </g>
        ))}
        {data.map((d, i) => (
          <text key={d.month} x={x(i)} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--muted-foreground)">
            {data.length > 8 && i % 2 ? "" : formatMonth(d.month)}
          </text>
        ))}
        <polygon points={area} fill="var(--chart-1)" fillOpacity="0.1" />
        <polyline points={line} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={y(0)} stroke="var(--muted-foreground)" strokeWidth="1" strokeDasharray="3 3" />}
        {data.map((d, i) => (
          <circle key={d.month} cx={x(i)} cy={y(d.amount)} r={hover === i ? 6 : 4} fill="var(--chart-1)" stroke="var(--card)" strokeWidth="2" />
        ))}
      </svg>
      {point && hover !== null && (
        <div
          role="status"
          className="glass-panel glass-strong pointer-events-none absolute top-2 -translate-x-1/2 whitespace-nowrap rounded-lg px-3 py-2 text-sm"
          style={{ left: `${Math.min(84, Math.max(16, (x(hover) / W) * 100))}%` }}
        >
          <span className="block text-muted-foreground">{formatMonth(point.month, true)}</span>
          <span className="block font-bold tabular-nums">{formatCedis(point.amount)}</span>
        </div>
      )}
      <table className="sr-only">
        <caption>Money collected per month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Collected</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <td>{formatMonth(d.month, true)}</td>
              <td>{formatCedis(d.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const R = 70;
const STROKE = 26;
const CIRCLE = 2 * Math.PI * R;
const GAP = 2;

/** Bookings by stage: a ring with a label and count for every stage, so colour is never the only signal. */
function BookingsRing({ stages }: { stages: Stage[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = stages.reduce((n, s) => n + s.count, 0);
  const shown = stages.find((s) => s.key === hover);
  let offset = 0;
  return (
    <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10">
      <svg viewBox="0 0 200 200" className="h-48 w-48 shrink-0" role="img" aria-label={`Bookings by stage, ${total} in total`}>
        <circle cx="100" cy="100" r={R} fill="none" stroke="var(--border)" strokeWidth={STROKE} />
        <g transform="rotate(-90 100 100)">
          {stages.map((s, i) => {
            const length = (s.count / (total || 1)) * CIRCLE;
            const dash = Math.max(length - (stages.filter((x) => x.count > 0).length > 1 ? GAP : 0), 0);
            const circle = s.count > 0 && (
              <circle
                key={s.key}
                data-stage={s.key}
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke={`var(--chart-${i + 1})`}
                strokeWidth={hover === s.key ? STROKE + 4 : STROKE}
                strokeDasharray={`${dash} ${CIRCLE - dash}`}
                strokeDashoffset={-offset}
                className="transition-[stroke-width] duration-200"
                onPointerEnter={() => setHover(s.key)}
                onPointerLeave={() => setHover(null)}
              />
            );
            offset += length;
            return circle;
          })}
        </g>
        <text x="100" y="98" textAnchor="middle" fontSize="28" fontWeight="700" fill="var(--foreground)">
          {shown ? shown.count : total}
        </text>
        <text x="100" y="118" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
          {shown ? shown.label : "bookings"}
        </text>
      </svg>
      <ul className="flex w-full max-w-60 flex-col gap-2 text-sm" aria-label="Bookings by stage">
        {stages.map((s, i) => (
          <li key={s.key} className="flex items-center justify-between gap-4" onPointerEnter={() => setHover(s.key)} onPointerLeave={() => setHover(null)}>
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm" style={{ background: `var(--chart-${i + 1})` }} />
              {s.label}
            </span>
            <span className="font-semibold tabular-nums">
              {s.count}
              {total > 0 && <span className="font-normal text-muted-foreground"> ({Math.round((s.count / total) * 100)}%)</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ACTIVITY_ICON: Record<Overview["activity"][number]["kind"], LucideIcon> = {
  payment: Wallet,
  allocation: KeyRound,
  agreement: FileSignature,
  enquiry: Mail,
};

const quietLink = "inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground hover:text-foreground";

type View = "overview" | "money" | "people";

const VIEWS: (DockView<View> & { description: string })[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, description: "Tenants, rooms and bookings at a glance." },
  { id: "money", label: "Money", icon: Wallet, description: "What came in, and who has paid this month." },
  { id: "people", label: "Tenants & activity", icon: Users, description: "Who signed up, and what happened lately." },
];
const isView = (v: string | null): v is View => VIEWS.some((x) => x.id === v);

/** Where the admin most often goes next. Real pages only. */
const QUICK_ACTIONS: { to: string; label: string; hint: string; icon: LucideIcon }[] = [
  { to: "/admin/allocations", label: "Allocate rooms", hint: "Paid bookings waiting for a room", icon: KeyRound },
  { to: "/admin/tickets", label: "Repair reports", hint: "See and update tenants' reports", icon: Wrench },
  { to: "/admin/messages", label: "Messages", hint: "Chat with tenants", icon: MessageSquare },
  { to: "/admin/buildings", label: "Buildings and photos", hint: "Rooms, prices and photos", icon: Building2 },
  { to: "/admin/texts", label: "Send a text", hint: "Text one tenant or everyone", icon: Send },
];

/** A small list of shortcuts over the page (⌘K or Ctrl+K). Escape or a click outside closes it. */
function QuickActions({ close }: { close: () => void }) {
  const first = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-center bg-overlay px-4 pt-[12vh]" onClick={close}>
      <GlassPanel
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-actions-title"
        strong
        className="w-full max-w-md p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="quick-actions-title" className="text-lg font-bold tracking-tight">
            Quick actions
          </h2>
          <button type="button" onClick={close} aria-label="Close quick actions" className="grid h-11 w-11 place-items-center rounded-full hover:bg-foreground/10">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <ul className="mt-2 flex flex-col gap-1">
          {QUICK_ACTIONS.map(({ to, label, hint, icon: Icon }, i) => (
            <li key={to}>
              <Link ref={i === 0 ? first : undefined} to={to} className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{label}</span>
                  <span className="block text-sm text-muted-foreground">{hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </GlassPanel>
    </div>
  );
}

/**
 * The admin's home (/admin), a glass workspace (DESIGN.md → Glass): a dock switches between three views, and
 * ⌘K/Ctrl+K opens quick actions. Every number here is real, from the system's own records.
 */
export function AdminDashboardPage() {
  const [months, setMonths] = useState(6);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [params, setParams] = useSearchParams();
  const view: View = isView(params.get("view")) ? (params.get("view") as View) : "overview";
  const [quick, setQuick] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  useViewTransition(stage, view);

  useEffect(() => {
    let current = true;
    apiFetch<Overview>(`/api/admin/overview?months=${months}`)
      .then((d) => {
        if (!current) return;
        setData(d);
        setError("");
      })
      .catch((e) => current && setError(e instanceof ApiError ? e.message : "Couldn't load the dashboard. Try again."));
    return () => {
      current = false;
    };
  }, [months]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuick((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const select = (next: View) => setParams(next === "overview" ? {} : { view: next }, { replace: true });
  const hasRevenue = useMemo(() => data?.revenue.some((m) => m.amount > 0) ?? false, [data]);
  const hasBookings = (data?.stages.reduce((n, s) => n + s.count, 0) ?? 0) > 0;
  const current = VIEWS.find((v) => v.id === view)!;

  return (
    <main className={`${sectionClass} py-8 md:py-10`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Dashboard</h1>
          <p className="mt-1 text-foreground">{current.description}</p>
        </div>
        <button type="button" onClick={() => setQuick(true)} className="glass-chip inline-flex min-h-11 items-center gap-2 px-4 text-sm font-semibold" aria-keyshortcuts="Meta+K Control+K">
          <Command className="h-4 w-4" aria-hidden="true" />
          Quick actions
        </button>
      </div>
      <GlassDock label="Dashboard views" views={VIEWS} active={view} onSelect={select} className="mt-6" />
      {quick && <QuickActions close={() => setQuick(false)} />}
      {error && (
        <div className="mt-6">
          <FormError>{error}</FormError>
        </div>
      )}
      {!data && !error && <p className="mt-6 text-foreground">Loading the dashboard…</p>}
      {data && (
        <div ref={stage} id={dockPanelId(view)} role="tabpanel" aria-labelledby={dockTabId(view)} className="mt-6 flex flex-col gap-5">
          {view === "overview" && (
            <>
              <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <Reveal>
                  <Stat label="Active tenants" value={<AnimatedNumber value={data.figures.active_tenants} />} icon={Users}>
                    {data.figures.waiting_to_sign} waiting to sign
                  </Stat>
                </Reveal>
                <Reveal delay={60}>
                  <Stat label="Rooms available" value={<AnimatedNumber value={data.figures.rooms_available} />} icon={BedDouble}>
                    Across {data.figures.buildings} {data.figures.buildings === 1 ? "building" : "buildings"}
                  </Stat>
                </Reveal>
                <Reveal delay={120}>
                  <Stat label="Waiting for a room" value={<AnimatedNumber value={data.figures.waiting_for_room} />} icon={Clock}>
                    <Link to="/admin/allocations" className="font-medium text-primary underline-offset-4 hover:underline">
                      Open the queue
                    </Link>
                  </Stat>
                </Reveal>
                <Reveal delay={180}>
                  <Stat label="Collected this month" value={<AnimatedNumber value={data.figures.collected_this_month} format={formatCedis} />} icon={Wallet}>
                    <Change now={data.figures.collected_this_month} before={data.figures.collected_last_month} />
                    <span className="block">{formatCedis(data.figures.still_owed)} still owed</span>
                  </Stat>
                </Reveal>
              </dl>
              {data.backup && <BackupStatusLine status={data.backup} />}
              <Panel title="Bookings by stage">
                {hasBookings ? <BookingsRing stages={data.stages} /> : <p className={emptyClass}>No bookings yet. They'll appear here as tenants book.</p>}
              </Panel>
            </>
          )}

          {view === "money" && (
            <>
              <Panel
                title="Money collected"
                action={
                  <label className="text-sm text-muted-foreground">
                    <span className="sr-only">Time range</span>
                    <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className={selectClass}>
                      <option value={3}>Last 3 months</option>
                      <option value={6}>Last 6 months</option>
                      <option value={12}>Last 12 months</option>
                    </select>
                  </label>
                }
              >
                {hasRevenue ? <RevenueChart data={data.revenue} /> : <p className={emptyClass}>No payments in this period yet. The chart appears once money comes in.</p>}
              </Panel>
              <PaymentStatusPanel />
            </>
          )}

          {view === "people" && (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <Panel title="Recent tenants" className="h-full">
                {data.recent_tenants.length === 0 ? (
                  <p className={emptyClass}>No tenants have signed up yet.</p>
                ) : (
                  <ul className="mt-2 flex flex-col divide-y divide-foreground/10">
                    {data.recent_tenants.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 py-3">
                        <UserInitials name={t.name} className="bg-primary/15 text-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{t.name}</p>
                          <p className="truncate text-sm text-muted-foreground">{t.email}</p>
                        </div>
                        <Badge tone={t.tone}>{t.status}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Recent activity" className="h-full" action={<Link to="/admin/agreements" className={quietLink}>View agreements</Link>}>
                {data.activity.length === 0 ? (
                  <p className={emptyClass}>Nothing yet. Payments, allocations, signatures and enquiries will show up here.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-4 py-2">
                    {data.activity.map((a, i) => {
                      const Icon = ACTIVITY_ICON[a.kind];
                      return (
                        <li key={`${a.kind}-${a.at}-${i}`} className="flex items-start gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{a.text}</p>
                            <p className="text-sm text-muted-foreground">{timeAgo(a.at)}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
