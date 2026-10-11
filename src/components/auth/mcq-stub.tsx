"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function McqStub() {
	const router = useRouter();
	const [pending, setPending] = useState(false);

	async function logout() {
		setPending(true);
		try {
			await fetch("/api/auth/logout", { method: "POST" });
			router.push("/login");
		} finally {
			setPending(false);
		}
	}

	return (
		<main className="mx-auto flex min-h-svh w-full max-w-lg flex-col justify-center gap-4 p-6">
			<h1 className="text-2xl font-medium">Multiple-choice quizzes</h1>
			<p>Multiple-choice quizzes are not built yet.</p>
			<Button type="button" onClick={logout} disabled={pending} className="w-fit">
				Logout
			</Button>
		</main>
	);
}
