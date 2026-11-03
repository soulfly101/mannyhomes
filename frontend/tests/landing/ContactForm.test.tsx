import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { AuthProvider } from "../../src/auth/AuthContext";
import { ContactForm } from "../../src/landing/ContactForm";
import type { Residence } from "../../src/landing/Residences";
import { AMA, googleOff, loggedOut, mockApi } from "../helpers";

const TWO_BED: Residence = { id: "r2", name: "2 bedroom", description: null, quantity: 2, rent: null, sanitation: null, building: "Manny Building", location: "Oyarifa" };

const renderForm = (enquiry: Residence | null = null) =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <ContactForm residences={[TWO_BED]} enquiry={enquiry} />
      </AuthProvider>
    </MemoryRouter>,
  );

test("sends a message and thanks the visitor", async () => {
  const { calls } = mockApi({ ...loggedOut, ...googleOff, "POST /api/contact": { status: 201, body: { detail: "Thanks! We'll get back to you within one working day." } } });
  renderForm();
  await userEvent.type(screen.getByLabelText("Your name *"), "Kofi Asante");
  await userEvent.type(screen.getByLabelText("Email address *"), "kofi@example.com");
  await userEvent.type(screen.getByLabelText("Phone number"), "024 123 4567");
  await userEvent.selectOptions(screen.getByLabelText("Residence of interest"), "r2");
  await userEvent.type(screen.getByLabelText("Message *"), "Can I view it on Saturday?");
  await userEvent.click(screen.getByRole("button", { name: "Send a message" }));

  expect(await screen.findByRole("status")).toHaveTextContent("We'll get back to you");
  const sent = calls.find((c) => c.key === "POST /api/contact")!;
  expect(sent.body).toEqual({ name: "Kofi Asante", email: "kofi@example.com", phone: "024 123 4567", room_type_id: "r2", message: "Can I view it on Saturday?" });
  expect(sent.headers["X-Requested-With"]).toBe("altheo");
  expect(screen.getByLabelText("Message *")).toHaveValue("");
});

test("checks the fields first", async () => {
  const { calls } = mockApi({ ...loggedOut, ...googleOff });
  renderForm();
  await userEvent.type(screen.getByLabelText("Phone number"), "123");
  await userEvent.click(screen.getByRole("button", { name: "Send a message" }));
  expect(screen.getByLabelText("Your name *")).toHaveAccessibleDescription("Enter your full name.");
  expect(screen.getByLabelText("Email address *")).toHaveAccessibleDescription("Enter a valid email address.");
  expect(screen.getByLabelText("Phone number")).toHaveAccessibleDescription("Enter a Ghana phone number, like 024 123 4567.");
  expect(screen.getByLabelText("Message *")).toHaveAccessibleDescription("Tell us a little more (at least 10 characters).");
  expect(calls.some((c) => c.key === "POST /api/contact")).toBe(false);
});

test("shows server errors", async () => {
  mockApi({ ...loggedOut, ...googleOff, "POST /api/contact": { status: 429, body: { detail: "You've sent several messages already. Try again in an hour." } } });
  renderForm();
  await userEvent.type(screen.getByLabelText("Your name *"), "Kofi Asante");
  await userEvent.type(screen.getByLabelText("Email address *"), "kofi@example.com");
  await userEvent.type(screen.getByLabelText("Message *"), "Hello, is the flat free?");
  await userEvent.click(screen.getByRole("button", { name: "Send a message" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Try again in an hour");
});

test("an enquiry picks the room and starts the message", async () => {
  mockApi({ ...loggedOut, ...googleOff });
  renderForm(TWO_BED);
  expect(screen.getByLabelText("Residence of interest")).toHaveValue("r2");
  expect(screen.getByLabelText("Message *")).toHaveValue("I'm interested in a 2 bedroom at Manny Building, Oyarifa.");
});

test("fills in a logged-in visitor's details", async () => {
  mockApi({ "GET /api/auth/me": { body: AMA }, ...googleOff });
  renderForm();
  await waitFor(() => expect(screen.getByLabelText("Your name *")).toHaveValue("Ama Mensah"));
  expect(screen.getByLabelText("Email address *")).toHaveValue("ama@example.com");
  expect(screen.getByLabelText("Phone number")).toHaveValue("+233241234567");
});
