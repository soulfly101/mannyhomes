import type { BadgeTone } from "@/components/ui/badge";

export type TicketStatus = "pending" | "in_progress" | "resolved" | "closed";
export type TicketCategory = "plumbing" | "electrical" | "general";

export type Ticket = {
  id: string;
  category: TicketCategory;
  description: string;
  status: TicketStatus;
  room_number: string;
  building: string;
  created_at: string;
  updated_at: string;
};

export const CATEGORIES: { code: TicketCategory; label: string }[] = [
  { code: "plumbing", label: "Plumbing" },
  { code: "electrical", label: "Electrical" },
  { code: "general", label: "General" },
];

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.code, c.label])) as Record<TicketCategory, string>;

/** What tenants see. Admins see the fuller names in `ADMIN_STATUS`. */
export const TENANT_STATUS: Record<TicketStatus, { text: string; tone: BadgeTone }> = {
  pending: { text: "Pending", tone: "warning" },
  in_progress: { text: "In Progress", tone: "neutral" },
  resolved: { text: "Resolved", tone: "success" },
  closed: { text: "Closed", tone: "neutral" },
};

export const ADMIN_STATUS: Record<TicketStatus, string> = {
  pending: "New / Pending",
  in_progress: "In Progress / Assigned",
  resolved: "Resolved",
  closed: "Closed",
};

export const STATUSES = Object.keys(ADMIN_STATUS) as TicketStatus[];

/** Still being worked on, so the tenant's page keeps checking for changes. */
export const isOpen = (t: Ticket) => t.status === "pending" || t.status === "in_progress";
