import { AuthForm } from "../AuthForm";

export const metadata = { title: "Create account · Altheo Homes" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-[1.7rem]">Create your account</h1>
      <p className="mb-5 mt-1" style={{ color: "var(--muted)" }}>See prices, book an apartment and pay in one place.</p>
      <AuthForm mode="register" next={next} />
    </>
  );
}
