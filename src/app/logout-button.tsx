"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full"
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
