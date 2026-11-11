import { Link } from "react-router";
import { CountBadge } from "@/components/ui/count-badge";
import { messageTime, type Conversation } from "./chat";

/** Conversations, newest activity first, each linking to its own page. Admins also see whose it is. */
export function ConversationList({ conversations, linkTo, showTenant = false }: { conversations: Conversation[]; linkTo: (c: Conversation) => string; showTenant?: boolean }) {
  return (
    <ul aria-label="Conversations" className="grid gap-3">
      {conversations.map((c) => (
        <li key={c.id}>
          <Link to={linkTo(c)} className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5">
            <span className="min-w-0">
              <span className="block font-semibold">{showTenant ? `${c.tenant_name} · ${c.title}` : c.title}</span>
              <span className="mt-1 block truncate text-sm text-muted-foreground">{c.last_message ?? "No messages yet"}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              {c.last_message_at && <span className="text-xs text-muted-foreground">{messageTime(c.last_message_at)}</span>}
              <CountBadge count={c.unread} label="unread" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
