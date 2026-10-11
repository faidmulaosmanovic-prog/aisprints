"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { registerSchema } from "@/lib/validators/auth";

const fieldMessages: Record<string, string> = {
	firstName: "Enter a first name.",
	lastName: "Enter a last name.",
	username: "Username must be 3–32 characters and use only letters, numbers, and underscores.",
	email: "Enter a valid email address.",
	password: "Password must be 8–128 characters and include a letter and a number.",
};

async function readError(response: Response, fallback: string) {
	try {
		const body = (await response.json()) as { error?: string };
		return body.error || fallback;
	} catch {
		return fallback;
	}
}

export function SignupForm({ className, ...props }: React.ComponentProps<typeof Card>) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);

		const form = new FormData(event.currentTarget);
		const values = {
			firstName: String(form.get("firstName") ?? ""),
			lastName: String(form.get("lastName") ?? ""),
			username: String(form.get("username") ?? ""),
			email: String(form.get("email") ?? ""),
			password: String(form.get("password") ?? ""),
			confirmPassword: String(form.get("confirmPassword") ?? ""),
		};

		if (values.password !== values.confirmPassword) {
			setError("Passwords do not match.");
			return;
		}

		const parsed = registerSchema.safeParse(values);
		if (!parsed.success) {
			const field = String(parsed.error.issues[0]?.path[0] ?? "");
			setError(fieldMessages[field] ?? "Check the form and try again.");
			return;
		}

		setPending(true);
		try {
			const response = await fetch("/api/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(parsed.data),
			});
			if (!response.ok) {
				setError(await readError(response, "Unable to create account"));
				return;
			}
			router.push("/mcq");
		} catch {
			setError("Unable to create account");
		} finally {
			setPending(false);
		}
	}

	return (
		<Card className={className} {...props}>
			<CardHeader>
				<CardTitle>Create an account</CardTitle>
				<CardDescription>Enter your information below to create your account</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={onSubmit} noValidate>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="first-name">First name</FieldLabel>
							<Input id="first-name" name="firstName" autoComplete="given-name" />
						</Field>
						<Field>
							<FieldLabel htmlFor="last-name">Last name</FieldLabel>
							<Input id="last-name" name="lastName" autoComplete="family-name" />
						</Field>
						<Field>
							<FieldLabel htmlFor="username">Username</FieldLabel>
							<Input id="username" name="username" autoComplete="username" />
						</Field>
						<Field>
							<FieldLabel htmlFor="signup-email">Email</FieldLabel>
							<Input id="signup-email" name="email" type="email" autoComplete="email" placeholder="m@example.com" />
							<FieldDescription>We&apos;ll use this to contact you. We will not share your email with anyone else.</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="signup-password">Password</FieldLabel>
							<Input id="signup-password" name="password" type="password" autoComplete="new-password" />
							<FieldDescription>Must be at least 8 characters long.</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
							<Input
								id="confirm-password"
								name="confirmPassword"
								type="password"
								autoComplete="new-password"
							/>
							<FieldDescription>Please confirm your password.</FieldDescription>
						</Field>
						{error ? <FieldError>{error}</FieldError> : null}
						<Button type="submit" disabled={pending}>
							Create Account
						</Button>
						<FieldDescription>
							Already have an account? <a href="/login">Sign in</a>
						</FieldDescription>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
