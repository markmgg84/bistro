import { redirect } from "next/navigation";
import { currentUser } from "../lib/server/auth";
import Workspace from "./workspace";
export const dynamic = "force-dynamic";
export default async function Home() {
  const u = await currentUser();
  if (!u) redirect("/login");
  return (
    <Workspace
      user={{ name: u.name, role: u.role, employeeId: u.employee?.id ?? null }}
      venues={u.memberships.map((m) => ({
        id: m.venue.id,
        name: m.venue.name,
      }))}
    />
  );
}
