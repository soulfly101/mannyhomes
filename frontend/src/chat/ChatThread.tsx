import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ApiError, apiFetch } from "../api";
import { FormError, InputWrapper } from "@/components/ui/sign-in";
import { cn } from "@/lib/utils";
import { buttonClass } from "../landing/parts";
import { CHAT_POLL_MS, messageTime, type ChatMessage, type Thread } from "./chat";

/**
 * One conversation: its messages, kept up to date every few seconds, and the box to write in.
 * `base` is the conversation's API address; `mine` says which messages were sent by this side.
 */
export function ChatThread({ base, mine, onLoaded }: { base: string; mine: (m: ChatMessage) => boolean; onLoaded?: (t: Thread) => void }) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState("");
  const [busy, setBusy] = useState(false);
  const lastId = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(onLoaded);
  loadedRef.current = onLoaded;

  const add = useCallback((more: ChatMessage[]) => {
    if (more.length === 0) return;
    setMessages((old) => {
      const seen = new Set((old ?? []).map((m) => m.id));
      return [...(old ?? []), ...more.filter((m) => !seen.has(m.id))].sort((a, b) => a.id - b.id);
    });
    lastId.current = Math.max(lastId.current, ...more.map((m) => m.id));
  }, []);

  const load = useCallback(
    () =>
      apiFetch<Thread>(`${base}?after=${lastId.current}`)
        .then((t) => {
          setMessages((old) => old ?? []);
          add(t.messages);
          setError("");
          loadedRef.current?.(t);
        })
        .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load the messages. Try again.")),
    [base, add],
  );

  useEffect(() => {
    lastId.current = 0;
    setMessages(null);
    void load();
    const timer = window.setInterval(() => void load(), CHAT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const count = messages?.length ?? 0;
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [count]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    setSendError("");
    try {
      add([await apiFetch<ChatMessage>(`${base}/messages`, { method: "POST", body: { body: draft } })]);
      setDraft("");
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : "Couldn't send that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // Enter sends; Shift+Enter starts a new line.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error && !messages && <FormError>{error}</FormError>}
      {!messages && !error && <p className="text-muted-foreground">Loading messages…</p>}
      {messages && (
        <ol aria-label="Messages" aria-live="polite" className="flex max-h-[60dvh] min-h-48 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card p-4">
          {messages.length === 0 && <li className="m-auto text-sm text-muted-foreground">No messages yet. Say hello.</li>}
          {messages.map((m) => {
            const own = mine(m);
            return (
              <li key={m.id} className={cn("flex max-w-[85%] flex-col gap-1 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1", own ? "items-end self-end" : "items-start self-start")}>
                <p className={cn("whitespace-pre-line break-words rounded-2xl px-4 py-2.5 text-sm", own ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-secondary text-foreground")}>{m.body}</p>
                <p className="px-1 text-xs text-muted-foreground">
                  {own ? "You" : m.from_admin ? `${m.sender_name}, Altheo Homes` : m.sender_name} · {messageTime(m.created_at)}
                </p>
              </li>
            );
          })}
          <div ref={end} />
        </ol>
      )}
      {messages && (
        <form onSubmit={send} noValidate className="flex flex-col gap-3">
          {sendError && <FormError>{sendError}</FormError>}
          <label htmlFor="chat-message" className="sr-only">
            Message
          </label>
          <InputWrapper>
            <textarea
              id="chat-message"
              rows={2}
              maxLength={2000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Write a message"
              className="block w-full resize-y rounded-md bg-transparent p-4 text-base text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
            />
          </InputWrapper>
          <div>
            <button type="submit" disabled={busy || !draft.trim()} aria-busy={busy || undefined} className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-60`}>
              {busy ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
