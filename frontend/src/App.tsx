import { useEffect, useState } from "react";
import { checkHealth, type Status } from "./api";

const LABEL: Record<Status, string> = { checking: "Checking…", ok: "OK", error: "Not reachable" };

function StatusRow({ name, status }: { name: string; status: Status }) {
  return (
    <li className={`status status-${status}`}>
      <span>{name}</span>
      <b>{LABEL[status]}</b>
    </li>
  );
}

/** Placeholder home page: shows whether the API and database are up. Real pages are ported from legacy/ card by card. */
export function App() {
  const [api, setApi] = useState<Status>("checking");
  const [db, setDb] = useState<Status>("checking");

  useEffect(() => {
    checkHealth("/api/health", "status").then(setApi);
    checkHealth("/api/health/db", "database").then(setDb);
  }, []);

  return (
    <main>
      <h1>Altheo Homes</h1>
      <p>The new app is being set up. System status:</p>
      <ul aria-label="System status">
        <StatusRow name="API" status={api} />
        <StatusRow name="Database" status={db} />
      </ul>
    </main>
  );
}
