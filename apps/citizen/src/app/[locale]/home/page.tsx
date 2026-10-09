/**
 * Protected home page placeholder — gated by middleware.ts (requires the
 * `pg_session` cookie). The real authed shell/home is built in Task 24;
 * this task only needs a route to exercise the auth-gate test against.
 */
export default function HomePage() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">Home</h1>
    </main>
  );
}
