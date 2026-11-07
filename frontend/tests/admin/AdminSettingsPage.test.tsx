import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { AdminSettingsPage } from "../../src/admin/AdminSettingsPage";
import { googleOff, mockApi, renderAt } from "../helpers";

const ESI = { id: "a1", name: "Esi Admin", email: "esi@example.com", phone: null, role: "admin", needs_onboarding: false };
const base = { "GET /api/auth/me": { body: ESI }, ...googleOff };
const URL = "/api/admin/settings/penalties";
const off = { enabled: false, late_fee: 0, freeze_tickets: false, enabled_on: null };
const on = { enabled: true, late_fee: 20, freeze_tickets: false, enabled_on: "2026-11-07" };

const page = () => renderAt("/admin/settings", <Route path="/admin/settings" element={<AdminSettingsPage />} />);
const toggle = () => screen.findByRole("switch", { name: /Enable Sanitation Bill Penalties/ });

test("off: the switch says so, and there's nothing else to fill in", async () => {
  mockApi({ ...base, [`GET ${URL}`]: { body: off } });
  page();
  const s = await toggle();
  expect(s).toHaveAttribute("aria-checked", "false");
  expect(within(s).getByText("OFF")).toBeInTheDocument();
  expect(screen.getByText(/Penalties are off\. Overdue sanitation bills bring no late fees or restrictions\./)).toBeInTheDocument();
  expect(screen.queryByLabelText("Late fee (GH₵)")).not.toBeInTheDocument();
});

test("switching on and saving a late fee", async () => {
  const { calls } = mockApi({ ...base, [`GET ${URL}`]: { body: off }, [`PUT ${URL}`]: { body: on } });
  page();
  await userEvent.click(await toggle());
  await userEvent.type(screen.getByLabelText("Late fee (GH₵)"), "20");
  await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  expect(calls.find((c) => c.key === `PUT ${URL}`)!.body).toEqual({ enabled: true, late_fee: 20, freeze_tickets: false });
  expect(screen.getByText(/Penalties are on: a GH₵ 20 late fee each overdue month\. Late fees apply to bills due from 7 Nov 2026\./)).toBeInTheDocument();
});

test("the ticket freeze can be chosen, and says when it starts working", async () => {
  const frozen = { ...on, late_fee: 0, freeze_tickets: true };
  const { calls } = mockApi({ ...base, [`GET ${URL}`]: { body: on }, [`PUT ${URL}`]: { body: frozen } });
  page();
  await toggle();
  expect(screen.getByLabelText("Late fee (GH₵)")).toHaveValue("20");
  await userEvent.clear(screen.getByLabelText("Late fee (GH₵)"));
  await userEvent.click(screen.getByRole("checkbox", { name: /Freeze new repair tickets until cleared/ }));
  expect(screen.getByText(/starts working when repair tickets are added/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
  expect(await screen.findByText(/Penalties are on: no new repair tickets until cleared\./)).toBeInTheDocument();
  expect(calls.find((c) => c.key === `PUT ${URL}`)!.body).toEqual({ enabled: true, late_fee: 0, freeze_tickets: true });
});

test("a fee that isn't whole cedis is caught before saving", async () => {
  const { calls } = mockApi({ ...base, [`GET ${URL}`]: { body: on } });
  page();
  await toggle();
  await userEvent.clear(screen.getByLabelText("Late fee (GH₵)"));
  await userEvent.type(screen.getByLabelText("Late fee (GH₵)"), "20.50");
  await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
  expect(await screen.findByText("Enter the fee in whole cedis, like 20.")).toBeInTheDocument();
  expect(calls.some((c) => c.key === `PUT ${URL}`)).toBe(false);
});

test("the server's refusal is shown, and what's saved stays as it was", async () => {
  mockApi({ ...base, [`GET ${URL}`]: { body: off }, [`PUT ${URL}`]: { status: 400, body: { detail: "Set a late fee or freeze repair tickets, or switch penalties off." } } });
  page();
  await userEvent.click(await toggle());
  await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
  expect(await screen.findByText("Set a late fee or freeze repair tickets, or switch penalties off.")).toBeInTheDocument();
  expect(screen.getByText(/Penalties are off\./)).toBeInTheDocument();
});

test("says so when the settings can't load", async () => {
  mockApi({ ...base, [`GET ${URL}`]: { status: 500, body: { detail: "Something broke." } } });
  page();
  expect(await screen.findByText("Something broke.")).toBeInTheDocument();
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
});
