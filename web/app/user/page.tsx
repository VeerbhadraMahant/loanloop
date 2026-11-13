import { redirect } from "next/navigation";

// proxy.ts only lets a signed-in customer reach /user, so go straight to the home screen.
export default function UserIndexPage() {
  redirect("/user/home");
}
