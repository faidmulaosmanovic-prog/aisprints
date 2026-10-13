"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { readCurrentUser } from "@/lib/current-user";
import type { McqQuestion } from "@/lib/services/mcq";
import { createMcqSchema, updateMcqSchema } from "@/lib/validators/mcq";

type ChoiceRow = {
	key: string;
	id?: string;
	label: string;
	isCorrect: boolean;
};

type FieldErrors = {
	name?: string;
	question?: string;
	description?: string;
	choices?: string;
};

function subscribeToTeacher() {
	return () => {};
}

let cachedTeacherRaw: string | null = null;
let cachedTeacher: ReturnType<typeof readCurrentUser> = null;
let teacherCacheReady = false;

function readTeacherSnapshot() {
	const raw = sessionStorage.getItem("quiz-maker.user");
	if (teacherCacheReady && raw === cachedTeacherRaw) {
		return cachedTeacher;
	}
	cachedTeacherRaw = raw;
	teacherCacheReady = true;
	cachedTeacher = readCurrentUser();
	return cachedTeacher;
}

function readTeacherOnServer() {
	return null;
}

function startingRows(question?: McqQuestion): ChoiceRow[] {
	if (!question) {
		return [
			{ key: "choice-1", label: "", isCorrect: true },
			{ key: "choice-2", label: "", isCorrect: false },
		];
	}

	return [...question.choices]
		.sort((left, right) => left.position - right.position)
		.map((choice) => ({
			key: choice.id,
			id: choice.id,
			label: choice.label,
			isCorrect: choice.isCorrect,
		}));
}

function errorsFromIssues(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
	const errors: FieldErrors = {};
	for (const issue of issues) {
		const key = String(issue.path[0] ?? "");
		if (
			(key === "name" || key === "question" || key === "description" || key === "choices") &&
			!errors[key]
		) {
			errors[key] = issue.message;
		}
	}
	return errors;
}

export function McqEditor({ question }: { question?: McqQuestion }) {
	const router = useRouter();
	const teacher = useSyncExternalStore(subscribeToTeacher, readTeacherSnapshot, readTeacherOnServer);
	const [name, setName] = useState(question?.name ?? "");
	const [prompt, setPrompt] = useState(question?.question ?? "");
	const [description, setDescription] = useState(question?.description ?? "");
	const [rows, setRows] = useState<ChoiceRow[]>(() => startingRows(question));
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
	const [formError, setFormError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [nextKey, setNextKey] = useState(3);

	if (!question && !teacher) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>New question</CardTitle>
				</CardHeader>
				<CardContent>
					<Link href="/login" className="underline underline-offset-4">
						Log in to create a question
					</Link>
				</CardContent>
			</Card>
		);
	}

	const correctKey = rows.find((row) => row.isCorrect)?.key ?? rows[0]?.key;

	function updateLabel(key: string, label: string) {
		setRows((current) => current.map((row) => (row.key === key ? { ...row, label } : row)));
	}

	function markCorrect(key: string) {
		setRows((current) => current.map((row) => ({ ...row, isCorrect: row.key === key })));
	}

	function addChoice() {
		setRows((current) => {
			if (current.length >= 7) {
				return current;
			}
			return [...current, { key: `choice-${nextKey}`, label: "", isCorrect: false }];
		});
		setNextKey((current) => current + 1);
	}

	function removeChoice(key: string) {
		setRows((current) => {
			if (current.length <= 2) {
				return current;
			}
			const next = current.filter((row) => row.key !== key);
			if (!next.some((row) => row.isCorrect) && next[0]) {
				next[0] = { ...next[0], isCorrect: true };
			}
			return next;
		});
	}

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError(null);

		const choices = rows.map((row) => ({
			...(row.id ? { id: row.id } : {}),
			label: row.label,
			isCorrect: row.isCorrect,
		}));
		const parsed = question
			? updateMcqSchema.safeParse({ name, question: prompt, description, choices })
			: createMcqSchema.safeParse({
					name,
					question: prompt,
					description,
					userId: teacher?.id,
					choices,
				});

		if (!parsed.success) {
			setFieldErrors(errorsFromIssues(parsed.error.issues));
			return;
		}

		setFieldErrors({});
		setPending(true);
		try {
			const response = await fetch(question ? `/api/mcqs/${question.id}` : "/api/mcqs", {
				method: question ? "PUT" : "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(parsed.data),
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as {
					error?: string;
					fields?: FieldErrors;
				} | null;
				if (response.status === 400 && body?.fields) {
					setFieldErrors(body.fields);
					return;
				}
				setFormError(body?.error || "Unable to save question");
				return;
			}
			router.push("/mcq");
			router.refresh();
		} catch {
			setFormError("Unable to save question");
		} finally {
			setPending(false);
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>{question ? "Edit question" : "New question"}</CardTitle>
			</CardHeader>
			<CardContent>
				<form onSubmit={onSubmit} noValidate>
					<FieldGroup>
						<Field data-invalid={fieldErrors.name ? true : undefined}>
							<FieldLabel htmlFor="mcq-name">Name</FieldLabel>
							<Input
								id="mcq-name"
								value={name}
								aria-invalid={fieldErrors.name ? true : undefined}
								onChange={(event) => setName(event.target.value)}
							/>
							{fieldErrors.name ? <FieldError>{fieldErrors.name}</FieldError> : null}
						</Field>
						<Field data-invalid={fieldErrors.question ? true : undefined}>
							<FieldLabel htmlFor="mcq-question">Question</FieldLabel>
							<Textarea
								id="mcq-question"
								value={prompt}
								aria-invalid={fieldErrors.question ? true : undefined}
								onChange={(event) => setPrompt(event.target.value)}
							/>
							{fieldErrors.question ? <FieldError>{fieldErrors.question}</FieldError> : null}
						</Field>
						<Field data-invalid={fieldErrors.description ? true : undefined}>
							<FieldLabel htmlFor="mcq-description">Description (optional)</FieldLabel>
							<Textarea
								id="mcq-description"
								value={description}
								aria-invalid={fieldErrors.description ? true : undefined}
								onChange={(event) => setDescription(event.target.value)}
							/>
							{fieldErrors.description ? <FieldError>{fieldErrors.description}</FieldError> : null}
						</Field>

						<FieldSet>
							<FieldLegend>Choices</FieldLegend>
							<FieldDescription>Add 2 to 7 choices and mark the correct one.</FieldDescription>
							<RadioGroup
								value={correctKey}
								onValueChange={(value) => {
									if (value != null) {
										markCorrect(String(value));
									}
								}}
							>
								{rows.map((row, index) => (
									<div key={row.key} className="flex items-end gap-2">
										<RadioGroupItem
											value={row.key}
											aria-label={`Choice ${index + 1} is correct`}
											className="mb-2"
										/>
										<Field className="flex-1">
											<FieldLabel htmlFor={`choice-${row.key}`}>Choice {index + 1}</FieldLabel>
											<Input
												id={`choice-${row.key}`}
												value={row.label}
												onChange={(event) => updateLabel(row.key, event.target.value)}
											/>
										</Field>
										<Button
											type="button"
											variant="outline"
											aria-label={`Remove choice ${index + 1}`}
											disabled={rows.length <= 2}
											onClick={() => removeChoice(row.key)}
										>
											Remove
										</Button>
									</div>
								))}
							</RadioGroup>
							{fieldErrors.choices ? <FieldError>{fieldErrors.choices}</FieldError> : null}
							<Button type="button" variant="outline" disabled={rows.length >= 7} onClick={addChoice}>
								Add choice
							</Button>
						</FieldSet>

						{formError ? <FieldError>{formError}</FieldError> : null}
						<div className="flex gap-2">
							<Button type="submit" disabled={pending}>
								{pending ? "Saving…" : "Save"}
							</Button>
							<Button type="button" variant="outline" onClick={() => router.push("/mcq")}>
								Cancel
							</Button>
						</div>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
