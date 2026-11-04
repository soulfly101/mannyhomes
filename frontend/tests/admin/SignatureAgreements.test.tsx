import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { AdminAgreementPage, AgreementsPage } from "../../src/admin/AgreementsPage";
import { SignaturePage } from "../../src/admin/SignaturePage";
import { mockApi, renderAt } from "../helpers";
import { agreement, PNG, signedTyped } from "../agreements/fixtures";
import { asAdmin } from "./fixtures";

const routes = (
  <>
    <Route path="/admin/signature" element={<SignaturePage />} />
    <Route path="/admin/agreements" element={<AgreementsPage />} />
    <Route path="/admin/agreements/:agreementId" element={<AdminAgreementPage />} />
  </>
);

const pngFile = (name = "sig.png", type = "image/png", size = 10) => new File([new Uint8Array(size)], name, { type });

test("with no signature it asks for one, and uploading saves it", async () => {
  const { calls } = mockApi({ ...asAdmin, "GET /api/admin/signature": { body: { image: null } }, "PUT /api/admin/signature": { body: { image: PNG } } });
  renderAt("/admin/signature", routes);
  expect(await screen.findByText(/You haven't added a signature yet/)).toBeInTheDocument();
  await userEvent.upload(screen.getByLabelText(/Signature image/), pngFile());
  expect(await screen.findByRole("img", { name: "Signature to save" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Save signature" }));
  expect(await screen.findByText("Signature saved. New agreements will use it.")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Your saved signature" })).toHaveAttribute("src", PNG);
  const sent = calls.find((c) => c.key === "PUT /api/admin/signature")!.body as { image: string };
  expect(sent.image).toMatch(/^data:image\/png;base64,/);
});

test("other files are refused before sending", async () => {
  const { calls } = mockApi({ ...asAdmin, "GET /api/admin/signature": { body: { image: PNG } } });
  renderAt("/admin/signature", routes);
  await screen.findByRole("img", { name: "Your saved signature" });
  const input = screen.getByLabelText(/Signature image/);
  await userEvent.upload(input, pngFile("sig.png", "image/png", 600 * 1024));
  expect(await screen.findByText(/too large/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Save signature" }));
  expect(calls.some((c) => c.key === "PUT /api/admin/signature")).toBe(false);
});

test("the server's refusal is shown", async () => {
  mockApi({ ...asAdmin, "GET /api/admin/signature": { body: { image: null } }, "PUT /api/admin/signature": { status: 422, body: { detail: "The signature must be a PNG image." } } });
  renderAt("/admin/signature", routes);
  await screen.findByText(/You haven't added a signature yet/);
  await userEvent.upload(screen.getByLabelText(/Signature image/), pngFile());
  await screen.findByRole("img", { name: "Signature to save" });
  await userEvent.click(screen.getByRole("button", { name: "Save signature" }));
  expect(await screen.findByText("The signature must be a PNG image.")).toBeInTheDocument();
});

test("it can be drawn instead", async () => {
  mockApi({ ...asAdmin, "GET /api/admin/signature": { body: { image: null } } });
  renderAt("/admin/signature", routes);
  await userEvent.click(await screen.findByRole("button", { name: "Draw it" }));
  expect(screen.getByRole("img", { name: "Draw your signature" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Save signature" }));
  expect(screen.getByText("Draw your signature first.")).toBeInTheDocument();
});

test("the admin keeps a copy of every agreement", async () => {
  mockApi({ ...asAdmin, "GET /api/admin/agreements": { body: [signedTyped(), agreement({ id: "ag2", tenant_name: "Kofi Asante" })] } });
  renderAt("/admin/agreements", routes);
  const list = within(await screen.findByRole("list", { name: "Agreements" }));
  const links = list.getAllByRole("link");
  expect(links[0]).toHaveAttribute("href", "/admin/agreements/ag1");
  expect(links[0]).toHaveTextContent("Room A12 · Manny Building, Oyarifa · 4 Nov 2026 to 4 Nov 2027");
  expect(list.getByText("Signed 5 Nov 2026")).toHaveAttribute("data-tone", "success");
  expect(list.getByText("Waiting for signature")).toHaveAttribute("data-tone", "warning");
});

test("no agreements yet says so", async () => {
  mockApi({ ...asAdmin, "GET /api/admin/agreements": { body: [] } });
  renderAt("/admin/agreements", routes);
  expect(await screen.findByText(/No agreements yet/)).toBeInTheDocument();
});

test("one agreement can be read and printed, with no way to sign", async () => {
  window.print = jest.fn();
  mockApi({ ...asAdmin, "GET /api/admin/agreements/ag1": { body: signedTyped() } });
  renderAt("/admin/agreements/ag1", routes);
  expect(await screen.findByRole("article", { name: "Tenancy agreement" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Print or save as PDF" }));
  await waitFor(() => expect(window.print).toHaveBeenCalled());
  expect(screen.queryByRole("button", { name: "Sign agreement" })).not.toBeInTheDocument();
});
