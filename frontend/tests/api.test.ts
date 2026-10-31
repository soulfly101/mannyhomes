import { ApiError, apiFetch } from "../src/api";

test("turns network failures into a friendly ApiError", async () => {
  global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;
  await expect(apiFetch("/api/auth/me")).rejects.toMatchObject({ status: 0, message: expect.stringContaining("couldn't reach") });
});

test("returns undefined for 204 responses", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204, json: async () => ({}) }) as unknown as typeof fetch;
  await expect(apiFetch("/api/auth/logout", { method: "POST" })).resolves.toBeUndefined();
});

test("uses a generic message when the server sends no detail", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => {
      throw new Error("not json");
    },
  }) as unknown as typeof fetch;
  const error = await apiFetch("/api/x").catch((e: ApiError) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ status: 500, message: "Something went wrong. Try again." });
});
