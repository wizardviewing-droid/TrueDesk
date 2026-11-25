import { useState } from "react";
import { TrueMark } from "@/components/logo";
import { OFFICE_CODE } from "@/lib/desk/seed";
import { PATHS } from "@/lib/desk/types";
import { useDesk } from "@/lib/desk/store";

export function SignIn() {
  const signIn = useDesk((s) => s.signIn);
  const register = useDesk((s) => s.register);
  const [mode, setMode] = useState<"in" | "up">("up");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [job, setJob] = useState("");
  const [team, setTeam] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function enter(nextUser = username, nextPassword = password) {
    setBusy(true);
    setError("");
    const message = await signIn(nextUser, nextPassword);
    setError(message ?? "");
    setBusy(false);
  }

  async function join(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const message = await register({ name, username, password, officeCode: OFFICE_CODE, job, team });
    setError(message ?? "");
    setBusy(false);
  }

  return (
    <main className="grid min-h-dvh bg-paper lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
      <section className="flex flex-col justify-between bg-navy px-6 py-8 text-paper lg:px-12 lg:py-12">
        <div>
          <TrueMark className="h-8 w-auto text-gold" />
          <p className="mt-6 text-sm font-semibold tracking-widest text-gold uppercase">Task desk</p>
          <h1 className="mt-3 max-w-md text-4xl font-semibold leading-tight">On your side.</h1>
          <p className="mt-4 max-w-md text-paper/80">
            Open the desk and today’s work is waiting. Tasks, notes and files live in one Excel register, kept identical in both folders.
          </p>
        </div>
        <dl className="mt-10 grid gap-4 text-sm">
          <div>
            <dt className="text-gold">Application</dt>
            <dd className="mt-1 font-medium break-all">{PATHS.application}</dd>
          </div>
          <div>
            <dt className="text-gold">Backup</dt>
            <dd className="mt-1 font-medium break-all">{PATHS.backup}</dd>
          </div>
          <p className="text-paper/70">
            Both copies stay the same. The file is locked with your sign-in password.
          </p>
        </dl>
      </section>
      <section className="flex items-center px-5 py-8 lg:px-10">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-6 flex gap-2">
            <button className={mode === "in" ? "btn btn-navy" : "btn btn-ghost"} type="button" onClick={() => setMode("in")}>
              Sign in
            </button>
            <button className={mode === "up" ? "btn btn-navy" : "btn btn-ghost"} type="button" onClick={() => setMode("up")}>
              Register
            </button>
          </div>
          {mode === "in" ? (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void enter();
              }}
            >
              <label>
                <span className="label">Username</span>
                <input className="input" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
              </label>
              <label>
                <span className="label">Password</span>
                <input className="input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <button className="btn btn-gold" type="submit" disabled={busy}>
                {busy ? "Opening…" : "Open the desk"}
              </button>
            </form>
          ) : (
            <form className="grid gap-4" onSubmit={(event) => void join(event)}>
              <p className="text-sm text-muted">The first person on the desk is the manager. Anyone who joins after that is a normal user.</p>
              <label>
                <span className="label">Name</span>
                <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                <span className="label">Username</span>
                <input className="input" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
              </label>
              <label>
                <span className="label">Password</span>
                <input className="input" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="label">Job</span>
                  <input className="input" value={job} onChange={(event) => setJob(event.target.value)} />
                </label>
                <label>
                  <span className="label">Team</span>
                  <input className="input" value={team} onChange={(event) => setTeam(event.target.value)} />
                </label>
              </div>
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <button className="btn btn-gold" type="submit" disabled={busy}>
                {busy ? "Adding you…" : "Create my desk"}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
