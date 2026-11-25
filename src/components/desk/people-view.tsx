import { useState } from "react";
import { useDesk } from "@/lib/desk/store";
import { roleLabel, type Role } from "@/lib/desk/types";

export function PeopleView() {
  const data = useDesk((s) => s.data);
  const user = useDesk((s) => s.user);
  const setUserRole = useDesk((s) => s.setUserRole);
  const addUser = useDesk((s) => s.addUser);
  const updateOwnPassword = useDesk((s) => s.updateOwnPassword);
  const showToast = useDesk((s) => s.showToast);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [job, setJob] = useState("Accounts");
  const [team, setTeam] = useState(user?.team ?? "Accounts");
  const [nextPassword, setNextPassword] = useState("");
  const [error, setError] = useState("");
  if (!data || !user) return null;
  const managers = data.users.filter((person) => person.role === "manager").length;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
      <section className="card overflow-hidden">
        <h1 className="border-b border-line px-5 py-4 text-xl font-semibold text-navy">People</h1>
        <ul>
          {data.users.map((person) => {
            const waiting = data.tasks.filter((task) => task.assigneeId === person.id && task.status === "pending").length;
            return (
              <li key={person.id} className="grid gap-3 border-b border-line px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
                <div>
                  <p className="font-semibold">{person.name}{person.id === user.id ? " · You" : ""}</p>
                  <p className="text-sm text-muted">{person.job} · {person.team} · {person.username}</p>
                  {waiting ? <p className="text-sm text-navy">{waiting} task{waiting === 1 ? "" : "s"} waiting for acceptance</p> : null}
                </div>
                {user.role === "manager" ? (
                  <select
                    className="input"
                    value={person.role}
                    aria-label={`Role for ${person.name}`}
                    onChange={(event) => {
                      const next = event.target.value as Role;
                      if (person.role === "manager" && next !== "manager" && managers <= 1) {
                        showToast("Keep at least one manager.");
                        return;
                      }
                      setUserRole(person.id, next);
                    }}
                  >
                    <option value="manager">Manager</option>
                    <option value="user">Normal user</option>
                  </select>
                ) : (
                  <p className="text-sm text-muted">{roleLabel(person.role)}</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <div className="grid content-start gap-5">
        <form
          className="card grid gap-3 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void addUser({ name, username, password, role: user.role === "manager" && role === "manager" ? "manager" : "user", job, team }).then((message) => {
              setError(message ?? "");
              if (!message) {
                setName("");
                setUsername("");
                setPassword("");
              }
            });
          }}
        >
          <h2 className="font-semibold text-navy">Add a colleague</h2>
          <p className="text-sm text-muted">They sign in with the username and password you set. You can then put work on their desk.</p>
          <label>
            <span className="label">Name</span>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            <span className="label">Username</span>
            <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} required />
          </label>
          <label>
            <span className="label">Temporary password</span>
            <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <label>
            <span className="label">Role</span>
            <select className="input" value={role} onChange={(event) => setRole(event.target.value as Role)}>
              {user.role === "manager" ? <option value="manager">Manager</option> : null}
              <option value="user">Normal user</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
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
          <button className="btn btn-gold" type="submit">Add to the register</button>
        </form>
        <form
          className="card grid gap-3 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void updateOwnPassword(nextPassword).then((message) => {
              if (message) setError(message);
              else setNextPassword("");
            });
          }}
        >
          <h2 className="font-semibold text-navy">Your password</h2>
          <p className="text-sm text-muted">The same password unlocks your sign-in and the protected copies of the workbook.</p>
          <label>
            <span className="label">New password</span>
            <input className="input" type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} required />
          </label>
          <button className="btn btn-navy" type="submit">Update password</button>
        </form>
      </div>
    </div>
  );
}
