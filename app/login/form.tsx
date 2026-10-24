"use client";
import { useState } from "react";
import Brand from "../brand";
export default function LoginForm() {
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  return (
    <main className="login-page">
      <div className="login-identity">
        <Brand />
        <h2>Due locali.<br />Un unico spazio di lavoro.</h2>
        <p>Persone, incassi e obiettivi.<br />Tutto a colpo d’occhio.</p>
        <div className="venue-logos" aria-label="I nostri locali">
          <img src="/brand/bistro.png" alt="Bistrò Sestri Levante" width={100} height={100} />
          <img src="/brand/marina.png" alt="Marina di Levante" width={100} height={100} />
        </div>
      </div>
      <section className="card login-card">
        <span className="demo">Ambiente privato · solo dati fittizi</span>
        <h1>Bentornato.</h1>
        <p>Accedi al tuo spazio di lavoro.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            setError("");
            const data = new FormData(e.currentTarget);
            try {
              const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(Object.fromEntries(data)),
              });
              const result = await response.json();
              if (!response.ok) throw Error(result.error);
              location.assign("/");
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Accesso non riuscito",
              );
              setPending(false);
            }
          }}
        >
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={200}
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
            />
          </label>
          <button className="primary" disabled={pending}>
            {pending ? "Accesso in corso…" : "Accedi"}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
        <p>
          Usa uno degli account dimostrativi generati durante la configurazione.
          Le password sono nel file locale riservato indicato nel README.
        </p>
      </section>
    </main>
  );
}

