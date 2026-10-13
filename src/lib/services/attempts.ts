import { getDb } from "@/lib/db";
import { getQuestion, McqServiceError, type McqAuthor, type McqQuestion } from "@/lib/services/mcq";

export type AttemptableQuestion = Omit<McqQuestion, "choices"> & {
	choices: Array<{ id: string; label: string; position: number }>;
};

export type AttemptResult = {
	attempt: {
		id: string;
		questionId: string;
		choiceId: string;
		userId: string;
		isCorrect: boolean;
		createdAt: string;
	};
	correctChoiceId: string;
};

type AttemptRow = {
	id: string;
	question_id: string;
	choice_id: string;
	user_id: string;
	is_correct: number;
	created_at: string;
};

export async function getQuestionForAttempt(id: string): Promise<AttemptableQuestion | null> {
	const question = await getQuestion(id);
	if (!question) {
		return null;
	}

	return {
		id: question.id,
		name: question.name,
		question: question.question,
		description: question.description,
		createdBy: question.createdBy satisfies McqAuthor,
		createdAt: question.createdAt,
		updatedAt: question.updatedAt,
		choices: question.choices.map((choice) => ({
			id: choice.id,
			label: choice.label,
			position: choice.position,
		})),
	};
}

export async function recordAttempt(questionId: string, choiceId: string, userId: string): Promise<AttemptResult> {
	const db = await getDb();
	const question = await db.prepare("SELECT id FROM mcq_questions WHERE id = ?1").bind(questionId).all<{ id: string }>();
	if (!question.results[0]) {
		throw new McqServiceError("not_found");
	}

	const user = await db
		.prepare("SELECT id, first_name, last_name, username FROM users WHERE id = ?1")
		.bind(userId)
		.all<{ id: string }>();
	if (!user.results[0]) {
		throw new McqServiceError("user_not_found");
	}

	const selected = await db
		.prepare("SELECT id, is_correct FROM mcq_choices WHERE id = ?1 AND question_id = ?2")
		.bind(choiceId, questionId)
		.all<{ id: string; is_correct: number }>();
	const choice = selected.results[0];
	if (!choice) {
		throw new McqServiceError("invalid_choice");
	}

	const correct = await db
		.prepare("SELECT id FROM mcq_choices WHERE question_id = ?1 AND is_correct = 1")
		.bind(questionId)
		.all<{ id: string }>();
	const correctChoiceId = correct.results[0]?.id;
	if (!correctChoiceId) {
		throw new Error("Question has no correct choice");
	}

	const attemptId = crypto.randomUUID();
	await db
		.prepare(
			"INSERT INTO mcq_attempts (id, question_id, choice_id, user_id, is_correct) VALUES (?1, ?2, ?3, ?4, ?5)",
		)
		.bind(attemptId, questionId, choiceId, userId, choice.is_correct)
		.run();

	const stored = await db
		.prepare(
			"SELECT id, question_id, choice_id, user_id, is_correct, created_at FROM mcq_attempts WHERE id = ?1",
		)
		.bind(attemptId)
		.all<AttemptRow>();
	const row = stored.results[0];
	if (!row) {
		throw new Error("Unable to record attempt");
	}

	return {
		attempt: {
			id: row.id,
			questionId: row.question_id,
			choiceId: row.choice_id,
			userId: row.user_id,
			isCorrect: row.is_correct === 1,
			createdAt: row.created_at,
		},
		correctChoiceId,
	};
}
