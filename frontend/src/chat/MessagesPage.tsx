import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { ApiError, apiFetch } from "../api";
import { FormError } from "@/components/ui/sign-in";
import { buttonClass, sectionClass } from "../landing/parts";
import { SitePage } from "../landing/SitePage";
import { ChatThread } from "./ChatThread";
import { ConversationList } from "./ConversationList";
import type { Conversation } from "./chat";

const backLink = "inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground";

/** Opens (or makes) a tenant's conversation, general or about one report, and goes to it. */
export async function openTenantChat(ticketId: string | null = null): Promise<Conversation> {
  return apiFetch<Conversation>("/api/chat/open", { method: "POST", body: { ticket_id: ticketId } });
}

/** A tenant's conversations with Altheo Homes (/messages). */
export function MessagesPage() {
  const [list, setList] = useState<Conversation[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    apiFetch<Conversation[]>("/api/chat")
      .then(setList)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load your messages. Try again."));
  }, []);

  const start = async () => {
    setBusy(true);
    try {
      navigate(`/messages/${(await openTenantChat()).id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't start a conversation. Try again.");
      setBusy(false);
    }
  };

  return (
    <SitePage>
      <section aria-labelledby="messages-title" className={`${sectionClass} py-12 md:py-16`}>
        <Link to="/dashboard" className={backLink}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Dashboard
        </Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 id="messages-title" className="text-4xl font-bold tracking-tight md:text-5xl">
              Messages
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">Chat with the Altheo Homes team about your home, your bills or a repair.</p>
          </div>
          <button type="button" disabled={busy} onClick={() => void start()} className={`${buttonClass} disabled:opacity-80`}>
            Message us
          </button>
        </div>
        <div className="mt-8 max-w-3xl">
          {error && <FormError>{error}</FormError>}
          {!list && !error && <p className="text-muted-foreground">Loading…</p>}
          {list?.length === 0 && <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">No conversations yet. Message us, or start a chat from one of your repair reports.</p>}
          {list && list.length > 0 && <ConversationList conversations={list} linkTo={(c) => `/messages/${c.id}`} />}
        </div>
      </section>
    </SitePage>
  );
}

/** One of a tenant's conversations (/messages/:id). */
export function TenantConversationPage() {
  const { conversationId } = useParams();
  const [title, setTitle] = useState("Conversation");
  return (
    <SitePage>
      <section aria-labelledby="conversation-title" className={`${sectionClass} py-12 md:py-16`}>
        <Link to="/messages" className={backLink}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Messages
        </Link>
        <h1 id="conversation-title" className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-muted-foreground">With the Altheo Homes team. New messages appear by themselves.</p>
        <div className="mt-6 max-w-3xl">
          <ChatThread key={conversationId} base={`/api/chat/${conversationId}`} mine={(m) => !m.from_admin} onLoaded={(t) => setTitle(t.conversation.title)} />
        </div>
      </section>
    </SitePage>
  );
}
