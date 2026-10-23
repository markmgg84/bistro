import { redirect } from "next/navigation";
import { currentUser } from "../../lib/server/auth";
import LoginForm from "./form";
export const dynamic = "force-dynamic";
export default async function Login() {
  if (await currentUser()) redirect("/");
  return <LoginForm />;
}
