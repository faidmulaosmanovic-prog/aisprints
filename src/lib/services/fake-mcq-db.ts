export type FakeUser = {
	id: string;
	first_name: string;
	last_name: string;
	username: string;
};

export type FakeQuestion = {
	id: string;
	name: string;
	question: string;
	description: string;
	created_by: string;
	created_at: string;
	updated_at: string;
};

export type FakeChoice = {
	id: string;
	question_id: string;
	label: string;
	position: number;
	is_correct: number;
	created_at: string;
	updated_at: string;
};

export type FakeAttempt = {
	id: string;
	question_id: string;
	choice_id: string;
	user_id: string;
	is_correct: number;
	created_at: string;
};

export type FakeStatement = {
	sql: string;
	params: unknown[];
};

export const users: FakeUser[] = [];
export const questions: FakeQuestion[] = [];
export const choices: FakeChoice[] = [];
export const attempts: FakeAttempt[] = [];
export const statements: FakeStatement[] = [];
export const batches: FakeStatement[][] = [];

let clock = 0;

function timestamp(): string {
	clock += 1;
	return new Date(Date.UTC(2026, 0, 1, 0, 0, clock)).toISOString();
}

function collapse(sql: string): string {
	return sql.replace(/\s+/g, " ").trim().toUpperCase();
}

export function resetFakeDb(): void {
	users.splice(0, users.length);
	questions.splice(0, questions.length);
	choices.splice(0, choices.length);
	attempts.splice(0, attempts.length);
	statements.splice(0, statements.length);
	batches.splice(0, batches.length);
	clock = 0;
}

function snapshot() {
	return {
		users: structuredClone(users),
		questions: structuredClone(questions),
		choices: structuredClone(choices),
		attempts: structuredClone(attempts),
	};
}

function restore(saved: ReturnType<typeof snapshot>): void {
	users.splice(0, users.length, ...saved.users);
	questions.splice(0, questions.length, ...saved.questions);
	choices.splice(0, choices.length, ...saved.choices);
	attempts.splice(0, attempts.length, ...saved.attempts);
}

function assertOneCorrect(questionId: string, choiceId: string, isCorrect: number): void {
	if (isCorrect !== 1) {
		return;
	}

	const other = choices.find(
		(choice) => choice.question_id === questionId && choice.id !== choiceId && choice.is_correct === 1,
	);
	if (other) {
		throw new Error("UNIQUE constraint failed: idx_mcq_choices_one_correct");
	}
}

function deleteChoice(id: string): void {
	for (let index = attempts.length - 1; index >= 0; index -= 1) {
		if (attempts[index]?.choice_id === id) {
			attempts.splice(index, 1);
		}
	}

	const choiceIndex = choices.findIndex((choice) => choice.id === id);
	if (choiceIndex >= 0) {
		choices.splice(choiceIndex, 1);
	}
}

function deleteQuestion(id: string): void {
	for (let index = attempts.length - 1; index >= 0; index -= 1) {
		if (attempts[index]?.question_id === id) {
			attempts.splice(index, 1);
		}
	}

	for (let index = choices.length - 1; index >= 0; index -= 1) {
		if (choices[index]?.question_id === id) {
			choices.splice(index, 1);
		}
	}

	const questionIndex = questions.findIndex((question) => question.id === id);
	if (questionIndex >= 0) {
		questions.splice(questionIndex, 1);
	}
}

function execute(sql: string, params: unknown[]): void {
	const text = collapse(sql);

	if (text.startsWith("INSERT INTO MCQ_QUESTIONS")) {
		const [id, name, question, description, createdBy] = params;
		if (questions.some((row) => row.id === id)) {
			throw new Error("UNIQUE constraint failed: mcq_questions.id");
		}
		const now = timestamp();
		questions.push({
			id: String(id),
			name: String(name),
			question: String(question),
			description: String(description),
			created_by: String(createdBy),
			created_at: now,
			updated_at: now,
		});
		return;
	}

	if (text.startsWith("INSERT INTO MCQ_CHOICES")) {
		const [id, questionId, label, position, isCorrect] = params;
		if (choices.some((row) => row.id === id)) {
			throw new Error("UNIQUE constraint failed: mcq_choices.id");
		}
		const correct = Number(isCorrect);
		assertOneCorrect(String(questionId), String(id), correct);
		const now = timestamp();
		choices.push({
			id: String(id),
			question_id: String(questionId),
			label: String(label),
			position: Number(position),
			is_correct: correct,
			created_at: now,
			updated_at: now,
		});
		return;
	}

	if (text.startsWith("INSERT INTO MCQ_ATTEMPTS")) {
		const [id, questionId, choiceId, userId, isCorrect] = params;
		if (attempts.some((row) => row.id === id)) {
			throw new Error("UNIQUE constraint failed: mcq_attempts.id");
		}
		attempts.push({
			id: String(id),
			question_id: String(questionId),
			choice_id: String(choiceId),
			user_id: String(userId),
			is_correct: Number(isCorrect),
			created_at: timestamp(),
		});
		return;
	}

	if (text.startsWith("UPDATE MCQ_QUESTIONS")) {
		const [name, question, description, updatedAt, id] = params;
		const row = questions.find((item) => item.id === id);
		if (!row) {
			return;
		}
		row.name = String(name);
		row.question = String(question);
		row.description = String(description);
		row.updated_at = String(updatedAt);
		return;
	}

	if (text.startsWith("UPDATE MCQ_CHOICES SET IS_CORRECT = 0")) {
		const questionId = String(params[0]);
		for (const choice of choices) {
			if (choice.question_id === questionId) {
				choice.is_correct = 0;
			}
		}
		return;
	}

	if (text.startsWith("UPDATE MCQ_CHOICES")) {
		const [label, position, isCorrect, updatedAt, id, questionId] = params;
		const row = choices.find((choice) => choice.id === id && choice.question_id === questionId);
		if (!row) {
			return;
		}
		const correct = Number(isCorrect);
		assertOneCorrect(String(questionId), String(id), correct);
		row.label = String(label);
		row.position = Number(position);
		row.is_correct = correct;
		row.updated_at = String(updatedAt);
		return;
	}

	if (text.startsWith("DELETE FROM MCQ_CHOICES")) {
		const [id, questionId] = params;
		const row = choices.find((choice) => choice.id === id && choice.question_id === questionId);
		if (row) {
			deleteChoice(String(id));
		}
		return;
	}

	if (text.startsWith("DELETE FROM MCQ_QUESTIONS")) {
		deleteQuestion(String(params[0]));
		return;
	}

	throw new Error(`Unexpected statement: ${text}`);
}

function query(sql: string, params: unknown[]): unknown[] {
	const text = collapse(sql);

	if (text.includes("FROM USERS") && text.includes("WHERE ID = ?1")) {
		return users.filter((user) => user.id === params[0]);
	}

	if (text.includes("FROM MCQ_ATTEMPTS") && text.includes("WHERE ID = ?1")) {
		return attempts.filter((attempt) => attempt.id === params[0]);
	}

	if (text.includes("FROM MCQ_QUESTIONS") && text.includes("JOIN USERS") && text.includes("ORDER BY")) {
		return [...questions]
			.sort((left, right) => {
				if (left.created_at !== right.created_at) {
					return left.created_at < right.created_at ? 1 : -1;
				}
				return left.id < right.id ? -1 : 1;
			})
			.map((question) => {
				const user = users.find((item) => item.id === question.created_by);
				return {
					id: question.id,
					name: question.name,
					question: question.question,
					description: question.description,
					created_by: question.created_by,
					created_at: question.created_at,
					updated_at: question.updated_at,
					first_name: user?.first_name,
					last_name: user?.last_name,
					username: user?.username,
					choice_count: choices.filter((choice) => choice.question_id === question.id).length,
				};
			});
	}

	if (text.includes("FROM MCQ_QUESTIONS") && text.includes("JOIN USERS")) {
		const question = questions.find((item) => item.id === params[0]);
		if (!question) {
			return [];
		}
		const user = users.find((item) => item.id === question.created_by);
		return [
			{
				...question,
				user_id: user?.id,
				first_name: user?.first_name,
				last_name: user?.last_name,
				username: user?.username,
			},
		];
	}

	if (text.includes("FROM MCQ_QUESTIONS") && text.includes("WHERE ID = ?1")) {
		return questions.filter((question) => question.id === params[0]).map((question) => ({ id: question.id }));
	}

	if (text.includes("FROM MCQ_CHOICES") && text.includes("IS_CORRECT = 1")) {
		return choices
			.filter((choice) => choice.question_id === params[0] && choice.is_correct === 1)
			.map((choice) => ({ id: choice.id }));
	}

	if (text.includes("FROM MCQ_CHOICES") && text.includes("ID = ?1") && text.includes("QUESTION_ID = ?2")) {
		return choices
			.filter((choice) => choice.id === params[0] && choice.question_id === params[1])
			.map((choice) => ({ id: choice.id, is_correct: choice.is_correct }));
	}

	if (text.includes("FROM MCQ_CHOICES") && text.includes("QUESTION_ID = ?1")) {
		return choices
			.filter((choice) => choice.question_id === params[0])
			.sort((left, right) => left.position - right.position)
			.map((choice) => ({
				id: choice.id,
				label: choice.label,
				position: choice.position,
				is_correct: choice.is_correct,
			}));
	}

	throw new Error(`Unexpected query: ${text}`);
}

function bound(sql: string, params: unknown[]) {
	return {
		sql,
		params,
		async all() {
			statements.push({ sql, params });
			return { results: query(sql, params) };
		},
		async run() {
			statements.push({ sql, params });
			execute(sql, params);
			return { success: true };
		},
	};
}

export const fakeDb = {
	prepare(sql: string) {
		return {
			...bound(sql, []),
			bind(...params: unknown[]) {
				return bound(sql, params);
			},
		};
	},
	async batch(prepared: Array<{ sql: string; params: unknown[] }>) {
		const saved = snapshot();
		const group: FakeStatement[] = [];
		try {
			for (const statement of prepared) {
				execute(statement.sql, statement.params);
				group.push({ sql: statement.sql, params: statement.params });
			}
			batches.push(group);
			statements.push(...group);
		} catch (error) {
			restore(saved);
			throw error;
		}
	},
};
