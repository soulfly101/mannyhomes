import { DatabaseBackup, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { timeAgo } from "../format";
import { panelClass } from "./dashboardParts";

export type BackupStatus = {
  state: "ok" | "warning";
  message: string;
  last_success_at: string | null;
  last_size_bytes: number | null;
};

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** The nightly database backups (#30): a quiet line when they work, a warning the admin can't miss when not. */
export function BackupStatusLine({ status }: { status: BackupStatus }) {
  const ok = status.state === "ok";
  const Icon = ok ? DatabaseBackup : TriangleAlert;
  return (
    <section aria-label="Database backups" className={cn(panelClass, "flex items-start gap-3 py-4 md:py-4", !ok && "border-warning/40")}>
      <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", ok ? "bg-accent text-primary" : "bg-warning/10 text-warning")}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-bold">Database backups</h2>
          <Badge tone={ok ? "success" : "warning"}>{ok ? "Working" : "Needs attention"}</Badge>
        </div>
        <p className="mt-1 text-sm text-foreground">{status.message}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {status.last_success_at
            ? `Last copied off the server: ${timeAgo(status.last_success_at).toLowerCase()}${status.last_size_bytes ? ` (${size(status.last_size_bytes)})` : ""}.`
            : "No backup has been copied off the server yet."}
        </p>
      </div>
    </section>
  );
}
