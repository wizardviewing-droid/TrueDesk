import { useEffect } from "react";
import { TrueMark } from "@/components/logo";
import { useDesk } from "@/lib/desk/store";
import { Shell } from "@/components/desk/shell";
import { SignIn } from "@/components/desk/sign-in";

export function DeskApp() {
  const booted = useDesk((s) => s.booted);
  const bootError = useDesk((s) => s.bootError);
  const user = useDesk((s) => s.user);
  const boot = useDesk((s) => s.boot);
  useEffect(() => {
    void boot();
  }, [boot]);
  if (!booted) return <Splash label="Opening the register…" />;
  if (bootError && !user) return <Splash label={bootError} />;
  if (!user) return <SignIn />;
  return <Shell />;
}

function Splash({ label }: { label: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-navy px-6 text-paper">
      <div className="text-center">
        <TrueMark className="mx-auto h-8 w-auto text-gold" />
        <p className="mt-6 text-sm tracking-widest text-gold uppercase">Task desk</p>
        <p className="mt-3 text-paper/80">{label}</p>
      </div>
    </main>
  );
}
