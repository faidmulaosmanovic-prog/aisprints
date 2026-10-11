"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { loginSchema } from "@/lib/validators/auth";

async function readError(response: Response, fallback: string) {
	try {
		const body = (await response.json()) as { error?: string };
		return body.error || fallback;
	} catch {
		return fallback;
	}
}

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);

		const form = new FormData(event.currentTarget);
		const parsed = loginSchema.safeParse({
			identifier: String(form.get("identifier") ?? ""),
			password: String(form.get("password") ?? ""),
		});
		if (!parsed.success) {
			const field = String(parsed.error.issues[0]?.path[0] ?? "");
			setError(field === "password" ? "Enter a password." : "Enter a username or email.");
			return;
		}

		setPending(true);
		try {
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(parsed.data),
			});
			if (!response.ok) {
				setError(await readError(response, "Unable to sign in"));
				return;
			}
			router.push("/mcq");
		} catch {
			setError("Unable to sign in");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className={cn("flex flex-col gap-6", className)} {...props}>
			<Card>
				<CardHeader>
					<CardTitle>Login to your account</CardTitle>
					<CardDescription>Enter your username or email below to login to your account</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit} noValidate>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="email">Username or email</FieldLabel>
								<Input id="email" name="identifier" placeholder="m@example.com" autoComplete="username" />
							</Field>
							<Field>
								<FieldLabel htmlFor="password">Password</FieldLabel>
								<Input id="password" name="password" type="password" autoComplete="current-password" />
							</Field>
							{error ? <FieldError>{error}</FieldError> : null}
							<Button type="submit" disabled={pending}>
								Login
							</Button>
							<FieldDescription>
								Don&apos;t have an account? <a href="/register">Sign up</a>
							</FieldDescription>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
