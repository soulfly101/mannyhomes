import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { personalise, TextsPage } from "../../src/admin/TextsPage";
import { mockApi, renderAt } from "../helpers";
import { asAdmin } from "./fixtures";

const overview = (overrides = {}) => ({
  mode: "live",
  sender_id: "ALTHEO",
  max_length: 160,
  buildings: [
    { id: "b1", name: "Manny Building" },
    { id: "b2", name: "Tema Court" },
  ],
  broadcasts: [
    {
      id: "br1",
      template: "Water off tomorrow 9-12.",
      audience: "Tenants at Tema Court",
      created_at: "2026-11-10T09:00:00",
      sent_by: "Esi Admin",
      counts: { sent: 3, queued: 0, failed: 1, skipped: 0 },
    },
  ],
  recent: [
    { id: 9, kind: "Repair update", to: "Kojo Mensah", body: "Hi Kojo, your plumbing report is now: In progress.", status: "sent", error: null, created_at: new Date().toISOString().slice(0, 19) },
    { id: 8, kind: "Payment received", to: "Ama Mensah", body: "Hi Ama, we received GH₵ 300.", status: "failed", error: "Sender ID is not approved", created_at: new Date().toISOString().slice(0, 19) },
  ],
  ...overrides,
});

const audience = { tenants: 3, with_phone: 2, example_name: "Efua", longest_name: 6 };
const page = () => renderAt("/admin/texts", <Route path="/admin/texts" element={<TextsPage />} />);

test("it says how texts go out and lists what was sent", async () => {
  mockApi({ ...asAdmin, "GET /api/admin/sms": { body: overview() }, "GET /api/admin/sms/audience": { body: audience } });
  page();
  expect(await screen.findByText(/Texts go out through Moolre as ALTHEO/)).toBeInTheDocument();
  const sent = within(screen.getByRole("list", { name: "Sent to tenants" }));
  expect(sent.getByText("Water off tomorrow 9-12.")).toBeInTheDocument();
  expect(sent.getByText("Tenants at Tema Court · 10 Nov 2026 · by Esi Admin · 3 sent, 1 failed")).toBeInTheDocument();
  const auto = within(screen.getByRole("list", { name: "Automatic texts" }));
  const [ok, bad] = auto.getAllByRole("listitem");
  expect(within(ok).getByText("Sent")).toHaveAttribute("data-tone", "success");
  expect(within(bad).getByText("Failed")).toHaveAttribute("data-tone", "danger");
  expect(within(bad).getByText("Sender ID is not approved")).toBeInTheDocument();
  expect(await screen.findByText("3 tenants, 2 with a phone number")).toBeInTheDocument();
});

test.each([
  ["test", /Test mode\./],
  ["off", /Texts are off\./],
])("in %s mode it says so", async (mode, text) => {
  mockApi({ ...asAdmin, "GET /api/admin/sms": { body: overview({ mode, broadcasts: [], recent: [] }) }, "GET /api/admin/sms/audience": { body: audience } });
  page();
  expect(await screen.findByText(text)).toBeInTheDocument();
  expect(screen.getByText(/Nothing sent yet/)).toBeInTheDocument();
  if (mode === "off") expect(screen.getByRole("button", { name: "Send text" })).toBeDisabled();
});

test("writing a text shows the count with the longest name and a preview, then asks before sending", async () => {
  const { calls } = mockApi({
    ...asAdmin,
    "GET /api/admin/sms": { body: overview() },
    "GET /api/admin/sms/audience": { body: audience },
    "POST /api/admin/sms/broadcasts": { status: 201, body: {} },
  });
  page();
  await screen.findByText("3 tenants, 2 with a phone number");
  await userEvent.type(screen.getByLabelText("Message"), "Merry Christmas,");
  await userEvent.click(screen.getByRole("button", { name: "Insert {{Tenant Name}}" }));
  expect(screen.getByLabelText("Message")).toHaveValue("Merry Christmas, {{Tenant Name}}");
  expect(screen.getByText("23 / 160 characters with the longest name")).toBeInTheDocument();
  expect(screen.getByText("Preview for Efua").nextSibling).toHaveTextContent("Merry Christmas, Efua");

  await userEvent.click(screen.getByRole("button", { name: "Send text" }));
  expect(calls.some((c) => c.key === "POST /api/admin/sms/broadcasts")).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Yes, text 2 tenants" }));
  expect(await screen.findByText(/Sending to 2 tenants/)).toBeInTheDocument();
  expect(calls.find((c) => c.key === "POST /api/admin/sms/broadcasts")!.body).toEqual({ text: "Merry Christmas, {{Tenant Name}}", building_id: null });
  expect(screen.getByLabelText("Message")).toHaveValue("");
  await waitFor(() => expect(calls.filter((c) => c.key === "GET /api/admin/sms")).toHaveLength(2));
});

test("one building can be chosen, and the confirm button names it", async () => {
  const { fetchMock } = mockApi({ ...asAdmin, "GET /api/admin/sms": { body: overview() }, "GET /api/admin/sms/audience": { body: { ...audience, tenants: 1, with_phone: 1 } } });
  page();
  await userEvent.selectOptions(await screen.findByLabelText("Send to"), "Tenants at Tema Court");
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/api/admin/sms/audience?building_id=b2"))).toBe(true));
  await userEvent.type(screen.getByLabelText("Message"), "Water off tomorrow.");
  await userEvent.click(screen.getByRole("button", { name: "Send text" }));
  expect(screen.getByRole("button", { name: "Yes, text 1 tenant at Tema Court" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "Send text" })).toBeInTheDocument();
});

test("too long, empty and nobody-to-text are caught before sending", async () => {
  const { calls } = mockApi({ ...asAdmin, "GET /api/admin/sms": { body: overview() }, "GET /api/admin/sms/audience": { body: audience } });
  page();
  await screen.findByText("3 tenants, 2 with a phone number");
  await userEvent.click(screen.getByRole("button", { name: "Send text" }));
  expect(screen.getByText("Write the message first.")).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Message"), "x".repeat(150));
  await userEvent.click(screen.getByRole("button", { name: "Insert {{Tenant Name}}" }));
  expect(screen.getByText("157 / 160 characters with the longest name")).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Message"), "!!!!");
  await userEvent.click(screen.getByRole("button", { name: "Send text" }));
  expect(screen.getByText("That's 161 characters with the longest name in. Keep it to 160.")).toBeInTheDocument();
  expect(calls.some((c) => c.key === "POST /api/admin/sms/broadcasts")).toBe(false);
});

test("nobody with a phone number can't be texted", async () => {
  mockApi({ ...asAdmin, "GET /api/admin/sms": { body: overview() }, "GET /api/admin/sms/audience": { body: { tenants: 1, with_phone: 0, example_name: null, longest_name: 0 } } });
  page();
  await screen.findByText("1 tenant, 0 with a phone number");
  await userEvent.type(screen.getByLabelText("Message"), "Hello");
  await userEvent.click(screen.getByRole("button", { name: "Send text" }));
  expect(screen.getByText("Nobody there has a phone number to text.")).toBeInTheDocument();
});

test("a server refusal is shown", async () => {
  mockApi({
    ...asAdmin,
    "GET /api/admin/sms": { body: overview() },
    "GET /api/admin/sms/audience": { body: audience },
    "POST /api/admin/sms/broadcasts": { status: 409, body: { detail: "Texts aren't set up yet, so nothing can be sent." } },
  });
  page();
  await screen.findByText("3 tenants, 2 with a phone number");
  await userEvent.type(screen.getByLabelText("Message"), "Hello");
  await userEvent.click(screen.getByRole("button", { name: "Send text" }));
  await userEvent.click(screen.getByRole("button", { name: "Yes, text 2 tenants" }));
  expect(await screen.findByText("Texts aren't set up yet, so nothing can be sent.")).toBeInTheDocument();
});

test("personalise swaps every spelling of the placeholder and tidies spaces", () => {
  expect(personalise("Hi  {{tenant name}}, {{ Tenant Name }}!", "Ama")).toBe("Hi Ama, Ama!");
});
