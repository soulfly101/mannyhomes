import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { ApiError, apiFetch } from "../api";
import { FormError } from "@/components/ui/sign-in";
import { ChatThread } from "../chat/ChatThread";
import { ConversationList } from "../chat/ConversationList";
import type { Conversation } from "../chat/chat";
import { buttonClass, sectionClass } from "../landing/parts";

type TenantOption = { id: string; name: string; phone: string | null };

/** Opens (or makes) a conversation with a tenant, general or about one of their reports. */
export async function openAdminChat(tenantId: string, ticketId: string | null = null): Promise<Conversation> {
  return apiFetch<Conversation>("/api/admin/chat/open", { method: "POST", body: { tenant_id: tenantId, ticket_id: ticketId } });
}

function StartChat() {
  const [tenants, setTenants] = useState<TenantOption[] | null>(null);
  const [tenantId, setTenantId] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    apiFetch<TenantOption[]>("/api/admin/chat/tenants")
      .then(setTenants)
      .catch(() => setTenants([]));
  }, []);
  const start = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenantId) {
      setError("Choose a tenant.");
      return;
    }
    try {
      navigate(`/admin/messages/${(await openAdminChat(tenantId)).id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the conversation. Try again.");
    }
  };
  return (
    <form onSubmit={start} noValidate className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex min-w-60 flex-1 flex-col gap-1">
        <label htmlFor="chat-tenant" className="text-sm font-medium text-muted-foreground">
          Message a tenant
        </label>
        <select id="chat-tenant" value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="min-h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground">
          <option value="">{tenants === null ? "Loading tenants…" : tenants.length === 0 ? "No tenants yet" : "Choose a tenant"}</option>
          {tenants?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.phone ? ` (${t.phone})` : ""}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className={buttonClass}>
        Start chat
      </button>
      {error && (
        <div className="w-full">
          <FormError>{error}</FormError>
        </div>
      )}
    </form>
  );
}

/** Every conversation with tenants (/admin/messages), newest activity first, and starting a new one. */
export function AdminMessagesPage() {
  const [list, setList] = useState<Conversation[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch<Conversation[]>("/api/admin/chat")
      .then(setList)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load the messages. Try again."));
  }, []);
  return (
    <main className={`${sectionClass} py-8 md:py-10`}>
      <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Messages</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">Chats with tenants. Any admin can answer.</p>
      <div className="mt-6 grid max-w-3xl gap-6">
        <StartChat />
        {error && <FormError>{error}</FormError>}
        {!list && !error && <p className="text-muted-foreground">Loading…</p>}
        {list?.length === 0 && <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">No messages yet.</p>}
        {list && list.length > 0 && <ConversationList conversations={list} showTenant linkTo={(c) => `/admin/messages/${c.id}`} />}
      </div>
    </main>
  );
}

/** One conversation with a tenant (/admin/messages/:id). */
export function AdminConversationPage() {
  const { conversationId } = useParams();
  const [title, setTitle] = useState("Conversation");
  return (
    <main className={`${sectionClass} py-8 md:py-10`}>
      <Link to="/admin/messages" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Messages
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
      <div className="mt-6 max-w-3xl">
        <ChatThread key={conversationId} base={`/api/admin/chat/${conversationId}`} mine={(m) => m.from_admin} onLoaded={(t) => setTitle(`${t.conversation.tenant_name} · ${t.conversation.title}`)} />
      </div>
    </main>
  );
}
