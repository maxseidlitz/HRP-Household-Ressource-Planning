"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      type="button"
      className="w-full bg-cream"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      Abmelden
    </Button>
  );
}
