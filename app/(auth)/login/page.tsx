import { AuthForm } from "../AuthForm";

export const metadata = { title: "Log in · Altheo Homes" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-[1.7rem]">Welcome back</h1>
      <p className="mb-5 mt-1" style={{ color: "var(--muted)" }}>Log in to see prices and manage your apartment.</p>
      <AuthForm mode="login" next={next} />
    </>
  );
}
