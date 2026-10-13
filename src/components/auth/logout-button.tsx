"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { clearCurrentUser } from "@/lib/current-user";

export function LogoutButton() {
	const router = useRouter();
	const [pending, setPending] = useState(false);

	async function logout() {
		setPending(true);
		try {
			clearCurrentUser();
			await fetch("/api/auth/logout", { method: "POST" });
			router.push("/login");
		} finally {
			setPending(false);
		}
	}

	return (
		<Button type="button" variant="outline" onClick={logout} disabled={pending}>
			Logout
		</Button>
	);
}
