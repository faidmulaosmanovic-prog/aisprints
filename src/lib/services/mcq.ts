import { getDb } from "@/lib/db";
import type { CreateMcqInput, UpdateMcqInput } from "@/lib/validators/mcq";

const messages = {
	not_found: "Question not found",
	user_not_found: "User not found",
	invalid_choice: "Choice does not belong to this question",
} as const;

export class McqServiceError extends Error {
	readonly code: keyof typeof messages;

	constructor(code: keyof typeof messages) {
		super(messages[code]);
		this.name = "McqServiceError";
		this.code = code;
	}
}

export type McqAuthor = {
	id: string;
	firstName: string;
	lastName: string;
	username: string;
};

export type McqChoice = {
	id: string;
	label: string;
	position: number;
	isCorrect: boolean;
};

export type McqQuestion = {
	id: string;
	name: string;
	question: string;
	description: string;
	choices: McqChoice[];
	createdBy: McqAuthor;
	createdAt: string;
	updatedAt: string;
};

export type McqSummary = Omit<McqQuestion, "choices"> & {
	choiceCount: number;
};

type UserRow = {
	id: string;
	first_name: string;
	last_name: string;
	username: string;
};

type QuestionJoinRow = {
	id: string;
	name: string;
	question: string;
	description: string;
	created_by: string;
	created_at: string;
	updated_at: string;
	first_name: string;
	last_name: string;
	username: string;
};

type ListRow = QuestionJoinRow & {
	choice_count: number;
};

type ChoiceRow = {
	id: string;
	label: string;
	position: number;
	is_correct: number;
};

function toAuthor(row: { created_by: string; first_name: string; last_name: string; username: string }): McqAuthor {
	return {
		id: row.created_by,
		firstName: row.first_name,
		lastName: row.last_name,
		username: row.username,
	};
}

function toChoice(row: ChoiceRow): McqChoice {
	return {
		id: row.id,
		label: row.label,
		position: row.position,
		isCorrect: row.is_correct === 1,
	};
}

function assertOneCorrectChoice(choices: Array<{ isCorrect: boolean }>): void {
	const correctCount = choices.filter((choice) => choice.isCorrect).length;
	if (correctCount !== 1) {
		throw new Error("Mark exactly one choice as correct");
	}
}

async function selectChoices(questionId: string): Promise<McqChoice[]> {
	const db = await getDb();
	const result = await db
		.prepare("SELECT id, label, position, is_correct FROM mcq_choices WHERE question_id = ?1 ORDER BY position")
		.bind(questionId)
		.all<ChoiceRow>();
	return result.results.map(toChoice);
}

export async function listQuestions(): Promise<McqSummary[]> {
	const db = await getDb();
	const result = await db
		.prepare(
			`SELECT q.id, q.name, q.question, q.description, q.created_by, q.created_at, q.updated_at,
        u.first_name, u.last_name, u.username,
        (SELECT COUNT(*) FROM mcq_choices WHERE question_id = q.id) AS choice_count
      FROM mcq_questions q
      JOIN users u ON u.id = q.created_by
      ORDER BY q.created_at DESC, q.id`,
		)
		.all<ListRow>();

	return result.results.map((row) => ({
		id: row.id,
		name: row.name,
		question: row.question,
		description: row.description,
		choiceCount: Number(row.choice_count),
		createdBy: toAuthor(row),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}));
}

export async function getQuestion(id: string): Promise<McqQuestion | null> {
	const db = await getDb();
	const result = await db
		.prepare(
			`SELECT q.id, q.name, q.question, q.description, q.created_by, q.created_at, q.updated_at,
        u.id AS user_id, u.first_name, u.last_name, u.username
      FROM mcq_questions q
      JOIN users u ON u.id = q.created_by
      WHERE q.id = ?1`,
		)
		.bind(id)
		.all<QuestionJoinRow>();
	const row = result.results[0];
	if (!row) {
		return null;
	}

	return {
		id: row.id,
		name: row.name,
		question: row.question,
		description: row.description,
		choices: await selectChoices(id),
		createdBy: toAuthor(row),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

async function requireUser(userId: string): Promise<void> {
	const db = await getDb();
	const result = await db
		.prepare("SELECT id, first_name, last_name, username FROM users WHERE id = ?1")
		.bind(userId)
		.all<UserRow>();
	if (!result.results[0]) {
		throw new McqServiceError("user_not_found");
	}
}

export async function createQuestion(input: CreateMcqInput): Promise<McqQuestion> {
	assertOneCorrectChoice(input.choices);
	await requireUser(input.userId);

	const db = await getDb();
	const questionId = crypto.randomUUID();
	const description = input.description.trim();
	await db.batch([
		db
			.prepare(
				"INSERT INTO mcq_questions (id, name, question, description, created_by) VALUES (?1, ?2, ?3, ?4, ?5)",
			)
			.bind(questionId, input.name.trim(), input.question.trim(), description, input.userId),
		...input.choices.map((choice, index) =>
			db
				.prepare(
					"INSERT INTO mcq_choices (id, question_id, label, position, is_correct) VALUES (?1, ?2, ?3, ?4, ?5)",
				)
				.bind(crypto.randomUUID(), questionId, choice.label.trim(), index + 1, choice.isCorrect ? 1 : 0),
		),
	]);

	const created = await getQuestion(questionId);
	if (!created) {
		throw new Error("Unable to create question");
	}

	return created;
}

export async function updateQuestion(id: string, input: UpdateMcqInput): Promise<McqQuestion> {
	const current = await getQuestion(id);
	if (!current) {
		throw new McqServiceError("not_found");
	}

	const knownIds = new Set(current.choices.map((choice) => choice.id));
	for (const choice of input.choices) {
		if (choice.id && !knownIds.has(choice.id)) {
			throw new McqServiceError("invalid_choice");
		}
	}

	assertOneCorrectChoice(input.choices);

	const db = await getDb();
	const updatedAt = new Date().toISOString();
	const keptIds = new Set(input.choices.flatMap((choice) => (choice.id ? [choice.id] : [])));
	const removed = current.choices.filter((choice) => !keptIds.has(choice.id));

	await db.batch([
		db
			.prepare("UPDATE mcq_questions SET name = ?1, question = ?2, description = ?3, updated_at = ?4 WHERE id = ?5")
			.bind(input.name.trim(), input.question.trim(), input.description.trim(), updatedAt, id),
		...removed.map((choice) =>
			db.prepare("DELETE FROM mcq_choices WHERE id = ?1 AND question_id = ?2").bind(choice.id, id),
		),
		db.prepare("UPDATE mcq_choices SET is_correct = 0 WHERE question_id = ?1").bind(id),
		...input.choices.map((choice, index) => {
			const position = index + 1;
			const correct = choice.isCorrect ? 1 : 0;
			if (choice.id) {
				return db
					.prepare(
						"UPDATE mcq_choices SET label = ?1, position = ?2, is_correct = ?3, updated_at = ?4 WHERE id = ?5 AND question_id = ?6",
					)
					.bind(choice.label.trim(), position, correct, updatedAt, choice.id, id);
			}

			return db
				.prepare(
					"INSERT INTO mcq_choices (id, question_id, label, position, is_correct) VALUES (?1, ?2, ?3, ?4, ?5)",
				)
				.bind(crypto.randomUUID(), id, choice.label.trim(), position, correct);
		}),
	]);

	const updated = await getQuestion(id);
	if (!updated) {
		throw new Error("Unable to update question");
	}

	return updated;
}

export async function deleteQuestion(id: string): Promise<void> {
	const current = await getQuestion(id);
	if (!current) {
		throw new McqServiceError("not_found");
	}

	const db = await getDb();
	await db.prepare("DELETE FROM mcq_questions WHERE id = ?1").bind(id).run();
}
