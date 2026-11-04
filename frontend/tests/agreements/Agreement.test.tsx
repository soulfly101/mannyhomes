import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { AgreementDocument } from "../../src/agreements/AgreementDocument";
import { AgreementPage } from "../../src/agreements/AgreementPage";
import { SignaturePad } from "../../src/agreements/SignaturePad";
import { RequireAuth } from "../../src/auth/RequireAuth";
import { AMA, googleOff, loggedOut, mockApi, renderAt } from "../helpers";
import { listings } from "../landing/fixtures";
import { agreement, PNG, signedTyped } from "./fixtures";

const base = { "GET /api/auth/me": { body: AMA }, ...googleOff, "GET /api/listings": { body: listings(true) } };

const renderPage = () =>
  renderAt(
    "/agreements/ag1",
    <>
      <Route path="/agreements/:agreementId" element={<RequireAuth roles={["tenant"]}><AgreementPage /></RequireAuth>} />
      <Route path="/login" element={<p>Login page</p>} />
    </>,
  );

const fakeCanvas = () => {
  const ctx = { beginPath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(), stroke: jest.fn(), clearRect: jest.fn() };
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ctx) as never;
  HTMLCanvasElement.prototype.toDataURL = jest.fn(() => PNG);
  return ctx;
};

const scribble = (canvas: HTMLElement) => {
  fireEvent.pointerDown(canvas, { clientX: 5, clientY: 5 });
  fireEvent.pointerMove(canvas, { clientX: 50, clientY: 40 });
  fireEvent.pointerUp(canvas);
};

beforeEach(() => {
  fakeCanvas();
});

test("the document shows the wording, dates, draft warning and landlord's signature", () => {
  render(<AgreementDocument agreement={agreement()} />);
  const doc = within(screen.getByRole("article", { name: "Tenancy agreement" }));
  expect(doc.getByText(/DRAFT WORDING: to be reviewed by a lawyer/)).toBeInTheDocument();
  expect(doc.getByText("4 Nov 2026 to 4 Nov 2027")).toBeInTheDocument();
  expect(doc.getByRole("heading", { level: 3, name: "1. The home" })).toBeInTheDocument();
  expect(doc.getByText("Room A12 at Manny Building.")).toBeInTheDocument();
  expect(doc.getByRole("img", { name: "Signature for Altheo Homes" })).toHaveAttribute("src", PNG);
  expect(doc.getByText("Not signed yet.")).toBeInTheDocument();
});

test("approved wording has no draft warning", () => {
  render(<AgreementDocument agreement={agreement({ draft_wording: false })} />);
  expect(screen.queryByText(/DRAFT WORDING/)).not.toBeInTheDocument();
});

test("wording is shown as text, never as HTML", () => {
  render(<AgreementDocument agreement={agreement({ body: "<img src=x onerror=alert(1)>" })} />);
  expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
});

test("a signed document shows the tenant's signature, date and check", () => {
  render(<AgreementDocument agreement={signedTyped()} />);
  const tenant = within(screen.getByRole("region", { name: "Tenant's signature" }));
  expect(tenant.getByText("Ama Mensah")).toBeInTheDocument();
  expect(tenant.getByText("Signed electronically on 5 Nov 2026")).toBeInTheDocument();
  expect(screen.getByText("Document check: abc123")).toBeInTheDocument();
});

test("a drawn signature shows as an image", () => {
  render(<AgreementDocument agreement={agreement({ signed_at: "2026-11-05T09:00:00", tenant_signature_kind: "drawn", tenant_signature_image: PNG })} />);
  expect(screen.getByRole("img", { name: "Signature of Ama Mensah" })).toHaveAttribute("src", PNG);
});

test("the pad reports the drawing and clears", async () => {
  const onChange = jest.fn();
  const ctx = fakeCanvas();
  render(<SignaturePad onChange={onChange} />);
  const clear = screen.getByRole("button", { name: "Clear" });
  expect(clear).toBeDisabled();
  scribble(screen.getByRole("img", { name: "Draw your signature" }));
  expect(ctx.lineTo).toHaveBeenCalled();
  expect(onChange).toHaveBeenLastCalledWith(PNG);
  await userEvent.click(clear);
  expect(ctx.clearRect).toHaveBeenCalled();
  expect(onChange).toHaveBeenLastCalledWith(null);
});

test("just tapping the pad isn't a signature", () => {
  const onChange = jest.fn();
  render(<SignaturePad onChange={onChange} />);
  const pad = screen.getByRole("img", { name: "Draw your signature" });
  fireEvent.pointerDown(pad, { clientX: 5, clientY: 5 });
  fireEvent.pointerUp(pad);
  expect(onChange).not.toHaveBeenCalled();
});

test("signing by drawing sends the picture and shows the next step", async () => {
  const { calls } = mockApi({ ...base, "GET /api/agreements/ag1": { body: agreement() }, "POST /api/agreements/ag1/sign": { body: signedTyped() } });
  renderPage();
  scribble(await screen.findByRole("img", { name: "Draw your signature" }));
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Sign agreement" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Your signed agreement" })).toBeInTheDocument();
  expect(calls.find((c) => c.key === "POST /api/agreements/ag1/sign")!.body).toEqual({ kind: "drawn", image: PNG, agreed: true });
  expect(screen.getByRole("link", { name: "Pay renting deposit (GH₵ 4,000)" })).toHaveAttribute("href", "/bills/9/pay");
  expect(screen.queryByRole("button", { name: "Sign agreement" })).not.toBeInTheDocument();
});

test("signing by typing starts with their name", async () => {
  const { calls } = mockApi({ ...base, "GET /api/agreements/ag1": { body: agreement() }, "POST /api/agreements/ag1/sign": { body: signedTyped() } });
  renderPage();
  await userEvent.click(await screen.findByRole("button", { name: "Type my name" }));
  expect(screen.getByLabelText("Your full legal name")).toHaveValue("Ama Mensah");
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Sign agreement" }));
  await screen.findByRole("heading", { level: 1, name: "Your signed agreement" });
  expect(calls.find((c) => c.key === "POST /api/agreements/ag1/sign")!.body).toEqual({ kind: "typed", typed_name: "Ama Mensah", agreed: true });
});

test("nothing is sent without a signature and the box ticked", async () => {
  const { calls } = mockApi({ ...base, "GET /api/agreements/ag1": { body: agreement() } });
  renderPage();
  await userEvent.click(await screen.findByRole("button", { name: "Sign agreement" }));
  expect(screen.getByText("Draw your signature first.")).toBeInTheDocument();
  scribble(screen.getByRole("img", { name: "Draw your signature" }));
  await userEvent.click(screen.getByRole("button", { name: "Sign agreement" }));
  expect(screen.getByText("Tick the box to confirm you've read and agree to this.")).toBeInTheDocument();
  expect(calls.some((c) => c.key === "POST /api/agreements/ag1/sign")).toBe(false);
});

test("problems signing are shown", async () => {
  mockApi({ ...base, "GET /api/agreements/ag1": { body: agreement() }, "POST /api/agreements/ag1/sign": { status: 409, body: { detail: "This agreement has already been signed." } } });
  renderPage();
  await userEvent.click(await screen.findByRole("button", { name: "Type my name" }));
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Sign agreement" }));
  expect(await screen.findByText("This agreement has already been signed.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign agreement" })).toBeEnabled();
});

test("a signed agreement can be printed, with no form", async () => {
  window.print = jest.fn();
  mockApi({ ...base, "GET /api/agreements/ag1": { body: signedTyped({ renting_bill_status: "paid" }) } });
  renderPage();
  await userEvent.click(await screen.findByRole("button", { name: "Print or save as PDF" }));
  expect(window.print).toHaveBeenCalled();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Pay renting deposit/ })).not.toBeInTheDocument();
});

test("an agreement that isn't theirs isn't found, and visitors log in", async () => {
  mockApi({ ...base, "GET /api/agreements/ag1": { status: 404, body: { detail: "That agreement doesn't exist." } } });
  const { unmount } = renderPage();
  expect(await screen.findByText("We can't find that agreement.")).toBeInTheDocument();
  unmount();
  mockApi({ ...loggedOut, ...googleOff });
  renderPage();
  await waitFor(() => expect(screen.getByText("Login page")).toBeInTheDocument());
});
