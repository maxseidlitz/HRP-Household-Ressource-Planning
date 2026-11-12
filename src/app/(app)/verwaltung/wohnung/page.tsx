import { redirect } from "next/navigation";

/** Früher „Räume & Aufgaben“, jetzt im Baumodus. */
export default function ApartmentRedirect() {
  redirect("/plan/bearbeiten");
}
