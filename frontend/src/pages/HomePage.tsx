import { useEffect, useState } from "react";
import { checkHealth, type Status } from "../api";
import { useAuth } from "../auth/AuthContext";
import { Card, StatusPill, type Tone } from "../components";

const SHOWN: Record<Status, { label: string; tone: Tone }> = {
  checking: { label: "Checking…", tone: "neutral" },
  ok: { label: "OK", tone: "ok" },
  error: { label: "Not reachable", tone: "danger" },
};

function StatusRow({ name, status }: { name: string; status: Status }) {
  const { label, tone } = SHOWN[status];
  return (
    <li className="status-row">
      <span>{name}</span>
      <StatusPill status={status} tone={tone} label={label} />
    </li>
  );
}

/** Placeholder home page until listings are ported: greeting plus API and database status. */
export function HomePage() {
  const { user } = useAuth();
  const [api, setApi] = useState<Status>("checking");
  const [db, setDb] = useState<Status>("checking");

  useEffect(() => {
    checkHealth("/api/health", "status").then(setApi);
    checkHealth("/api/health/db", "database").then(setDb);
  }, []);

  return (
    <main className="wrap status-page">
      <Card as="section" className="rise" aria-labelledby="status-title">
        <h1 id="status-title">{user ? `Hi, ${user.name.split(" ")[0]}` : "Altheo Homes"}</h1>
        <p className="muted">The new app is being set up. System status:</p>
        <ul aria-label="System status" className="status-list">
          <StatusRow name="API" status={api} />
          <StatusRow name="Database" status={db} />
        </ul>
      </Card>
    </main>
  );
}
