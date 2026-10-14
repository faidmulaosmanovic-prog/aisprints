"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { readCurrentUser } from "@/lib/current-user";
import type { AttemptableQuestion, AttemptResult } from "@/lib/services/attempts";

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

export function McqPreview({ question }: { question: AttemptableQuestion }) {
	const teacher = useSyncExternalStore(subscribeToTeacher, readTeacherSnapshot, readTeacherOnServer);
	const choices = [...question.choices].sort((left, right) => left.position - right.position);
	const [selected, setSelected] = useState<string | null>(null);
	const [result, setResult] = useState<AttemptResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const locked = result !== null;

	async function submit() {
		if (!teacher || !selected || locked) {
			return;
		}
		setPending(true);
		setError(null);
		try {
			const response = await fetch(`/api/mcqs/${question.id}/attempts`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ choiceId: selected, userId: teacher.id }),
			});
			const body = (await response.json().catch(() => null)) as (AttemptResult & { error?: string }) | null;
			if (!response.ok) {
				setError(body?.error || "Unable to record attempt");
				return;
			}
			if (!body?.attempt || !body.correctChoiceId) {
				setError("Unable to record attempt");
				return;
			}
			setResult(body);
		} catch {
			setError("Unable to record attempt");
		} finally {
			setPending(false);
		}
	}

	function tryAgain() {
		setSelected(null);
		setResult(null);
		setError(null);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>{question.name}</CardTitle>
				{question.description ? <CardDescription>{question.description}</CardDescription> : null}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<p>{question.question}</p>
				<RadioGroup
					value={selected ?? ""}
					disabled={locked}
					onValueChange={(value) => {
						if (value != null && !locked) {
							setSelected(String(value));
						}
					}}
				>
					{choices.map((choice) => (
						<div key={choice.id} className="flex items-center gap-2">
							<RadioGroupItem value={choice.id} aria-label={choice.label} disabled={locked} />
							<span>{choice.label}</span>
							{result && choice.id === result.correctChoiceId ? (
								<span className="text-sm text-muted-foreground">Correct answer</span>
							) : null}
						</div>
					))}
				</RadioGroup>
				{result ? (
					<Badge variant={result.attempt.isCorrect ? "default" : "destructive"}>
						{result.attempt.isCorrect ? "Correct" : "Incorrect"}
					</Badge>
				) : null}
				{error ? <FieldError>{error}</FieldError> : null}
				{teacher ? (
					result ? (
						<Button type="button" variant="outline" onClick={tryAgain} className="w-fit">
							Try again
						</Button>
					) : (
						<Button type="button" disabled={!selected || pending} onClick={submit} className="w-fit">
							Submit answer
						</Button>
					)
				) : (
					<Link href="/login" className="w-fit underline underline-offset-4">
						Log in to answer this question
					</Link>
				)}
				<div className="flex gap-4 text-sm">
					<Link href={`/mcq/${question.id}/edit`} className="underline underline-offset-4">
						Edit question
					</Link>
					<Link href="/mcq" className="underline underline-offset-4">
						Back to questions
					</Link>
				</div>
			</CardContent>
		</Card>
	);
}
