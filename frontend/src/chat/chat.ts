import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api";

export type ChatMessage = { id: number; body: string; from_admin: boolean; sender_name: string; created_at: string };

export type Conversation = {
  id: string;
  title: string;
  ticket_id: string | null;
  tenant_id: string;
  tenant_name: string;
  last_message: string | null;
  last_message_at: string | null;
  unread: number;
};

export type Thread = { conversation: Conversation; messages: ChatMessage[] };

/** How often an open conversation asks for new messages. */
export const CHAT_POLL_MS = 3000;
/** How often the unread badge in the menu checks. */
export const UNREAD_POLL_MS = 20000;

/** Unread messages for the badge: asked now, every UNREAD_POLL_MS and when the tab comes back. 0 if it can't tell. */
export function useUnread(url: string | null): number {
  const [count, setCount] = useState(0);
  const load = useCallback(() => {
    if (!url) return;
    apiFetch<{ count: number }>(url)
      .then((r) => setCount(r.count))
      .catch(() => {
        // A badge that can't load just stays as it was.
      });
  }, [url]);
  useEffect(() => {
    if (!url) {
      setCount(0);
      return;
    }
    load();
    const timer = window.setInterval(load, UNREAD_POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url, load]);
  return count;
}

/** "14:05" today, otherwise "7 Nov, 14:05". */
export function messageTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${time}`;
}
