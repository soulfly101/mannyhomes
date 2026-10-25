import { Ambient } from "@/components/Ambient";
import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="wrap grid min-h-screen place-items-center py-10">
      <Ambient />
      <div className="glass rise w-full max-w-[440px] rounded-[28px] p-7">
        <div className="mb-5">
          <Logo />
        </div>
        {children}
      </div>
    </main>
  );
}
