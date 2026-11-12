import { redirect } from "next/navigation";

/** Früher eigene Raumseite, jetzt im Baumodus. */
export default async function RoomRedirect({
  params,
}: PageProps<"/raum/[roomId]">) {
  const { roomId } = await params;
  redirect(`/plan/bearbeiten?raum=${encodeURIComponent(roomId)}`);
}
