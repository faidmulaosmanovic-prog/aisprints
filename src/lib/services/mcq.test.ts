import { beforeEach, describe, expect, it, vi } from "vitest";
import { attempts, batches, choices, questions, resetFakeDb, statements, users } from "@/lib/services/fake-mcq-db";
import { createQuestion, deleteQuestion, getQuestion, listQuestions, updateQuestion } from "@/lib/services/mcq";

vi.mock("@/lib/db", async () => {
	const { fakeDb } = await import("@/lib/services/fake-mcq-db");
	return { getDb: async () => fakeDb };
});

const teacher = {
	id: "user-ada",
	first_name: "Ada",
	last_name: "Lovelace",
	username: "ada",
};

const questionInput = {
	userId: teacher.id,
	name: "Photosynthesis basics",
	question: "Which gas do plants absorb during photosynthesis?",
	description: "Grade 6 science",
	choices: [
		{ label: "Oxygen", isCorrect: false },
		{ label: "Carbon dioxide", isCorrect: true },
	],
};

function collapse(sql: string): string {
	return sql.replace(/\s+/g, " ").trim().toUpperCase();
}

describe("mcq service", () => {
	beforeEach(() => {
		resetFakeDb();
		vi.clearAllMocks();
		users.push({ ...teacher });
	});

	it("inserts the question and choices in one batch, in order, with one correct choice", async () => {
		const question = await createQuestion(questionInput);

		expect(batches).toHaveLength(1);
		const batch = batches[0] ?? [];
		const questionInserts = batch.filter((statement) => collapse(statement.sql).startsWith("INSERT INTO MCQ_QUESTIONS"));
		const choiceInserts = batch.filter((statement) => collapse(statement.sql).startsWith("INSERT INTO MCQ_CHOICES"));
		expect(questionInserts).toHaveLength(1);
		expect(choiceInserts).toHaveLength(2);
		expect(questionInserts[0]?.params[4]).toBe(teacher.id);
		expect(choiceInserts.map((statement) => statement.params[3])).toEqual([1, 2]);
		expect(choiceInserts.filter((statement) => statement.params[4] === 1)).toHaveLength(1);
		expect(question.choices).toEqual([
			{ id: expect.any(String), label: "Oxygen", position: 1, isCorrect: false },
			{ id: expect.any(String), label: "Carbon dioxide", position: 2, isCorrect: true },
		]);
		expect(question.createdBy).toEqual({
			id: teacher.id,
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
		});

		await expect(
			createQuestion({
				...questionInput,
				choices: questionInput.choices.map((choice) => ({ ...choice, isCorrect: false })),
			}),
		).rejects.toThrow("Mark exactly one choice as correct");
		await expect(
			createQuestion({
				...questionInput,
				choices: questionInput.choices.map((choice) => ({ ...choice, isCorrect: true })),
			}),
		).rejects.toThrow("Mark exactly one choice as correct");
		expect(batches).toHaveLength(1);
		expect(questions).toHaveLength(1);
	});

	it("stores a blank description as an empty string", async () => {
		const question = await createQuestion({ ...questionInput, description: "" });

		expect(question.description).toBe("");
		expect(questions[0]?.description).toBe("");
	});

	it("leaves no rows when the batch fails", async () => {
		vi.spyOn(crypto, "randomUUID").mockReturnValue("same-id");

		await expect(createQuestion(questionInput)).rejects.toThrow(/UNIQUE constraint failed/);
		expect(questions).toHaveLength(0);
		expect(choices).toHaveLength(0);
		expect(users).toHaveLength(1);

		vi.mocked(crypto.randomUUID).mockRestore();
	});

	it("reports a missing user and writes nothing", async () => {
		await expect(createQuestion({ ...questionInput, userId: "missing" })).rejects.toMatchObject({
			name: "McqServiceError",
			code: "user_not_found",
		});
		expect(batches).toHaveLength(0);
		expect(questions).toHaveLength(0);
	});

	it("lists the newest question first with a choice count and no choices", async () => {
		const older = await createQuestion(questionInput);
		const newer = await createQuestion({
			...questionInput,
			name: "Water cycle",
			question: "What falls from clouds?",
		});

		const listed = await listQuestions();

		expect(listed.map((question) => question.id)).toEqual([newer.id, older.id]);
		expect(listed[0]).toMatchObject({
			name: "Water cycle",
			choiceCount: 2,
			createdBy: { id: teacher.id, firstName: "Ada", lastName: "Lovelace", username: "ada" },
		});
		expect(listed[0]).not.toHaveProperty("choices");
	});

	it("returns one question with choices in position order, or null when it is missing", async () => {
		const created = await createQuestion(questionInput);

		expect(await getQuestion(created.id)).toMatchObject({
			id: created.id,
			createdBy: { id: teacher.id },
			choices: [
				{ label: "Oxygen", position: 1 },
				{ label: "Carbon dioxide", position: 2 },
			],
		});
		expect(await getQuestion("missing")).toBeNull();
	});

	it("updates the question, keeps submitted choice ids, adds new choices, and deletes omitted choices", async () => {
		const created = await createQuestion({
			...questionInput,
			choices: [
				{ label: "Oxygen", isCorrect: false },
				{ label: "Carbon dioxide", isCorrect: true },
				{ label: "Nitrogen", isCorrect: false },
			],
		});
		const kept = created.choices[0];
		const alsoKept = created.choices[1];
		const omitted = created.choices[2];
		if (!kept || !alsoKept || !omitted) {
			throw new Error("expected three choices");
		}

		const updated = await updateQuestion(created.id, {
			name: "Photosynthesis revised",
			question: "Which gas do plants take in?",
			description: "",
			choices: [
				{ id: kept.id, label: "Oxygen gas", isCorrect: false },
				{ id: alsoKept.id, label: "Carbon dioxide", isCorrect: true },
				{ label: "Water vapor", isCorrect: false },
			],
		});

		expect(updated.name).toBe("Photosynthesis revised");
		expect(updated.description).toBe("");
		expect(updated.createdBy.id).toBe(teacher.id);
		expect(updated.updatedAt).not.toBe(created.updatedAt);
		expect(updated.choices.map((choice) => choice.id)).toEqual([kept.id, alsoKept.id, expect.any(String)]);
		expect(updated.choices[2]?.id).not.toBe(omitted.id);
		expect(choices.some((choice) => choice.id === omitted.id)).toBe(false);
		expect(questions[0]?.created_by).toBe(teacher.id);
	});

	it("moves the correct answer by clearing the old flag before setting the new one", async () => {
		const created = await createQuestion(questionInput);
		const oxygen = created.choices[0];
		const carbon = created.choices[1];
		if (!oxygen || !carbon) {
			throw new Error("expected two choices");
		}

		const updated = await updateQuestion(created.id, {
			name: questionInput.name,
			question: questionInput.question,
			description: questionInput.description,
			choices: [
				{ id: oxygen.id, label: "Oxygen", isCorrect: true },
				{ id: carbon.id, label: "Carbon dioxide", isCorrect: false },
			],
		});

		expect(updated.choices).toEqual([
			{ id: oxygen.id, label: "Oxygen", position: 1, isCorrect: true },
			{ id: carbon.id, label: "Carbon dioxide", position: 2, isCorrect: false },
		]);
		const batch = batches.at(-1) ?? [];
		const clearIndex = batch.findIndex((statement) => collapse(statement.sql).includes("SET IS_CORRECT = 0"));
		const setIndex = batch.findIndex(
			(statement) =>
				collapse(statement.sql).startsWith("UPDATE MCQ_CHOICES") &&
				!collapse(statement.sql).includes("SET IS_CORRECT = 0") &&
				statement.params.includes(1),
		);
		expect(clearIndex).toBeGreaterThanOrEqual(0);
		expect(setIndex).toBeGreaterThan(clearIndex);
	});

	it("writes nothing for a missing question, a foreign choice, or the wrong number of correct choices", async () => {
		const created = await createQuestion(questionInput);
		const other = await createQuestion({
			...questionInput,
			name: "Water cycle",
			question: "What falls from clouds?",
		});
		const before = structuredClone(choices);
		const foreign = other.choices[0];
		const local = created.choices[1];
		if (!foreign || !local) {
			throw new Error("expected choices");
		}

		await expect(
			updateQuestion("missing", {
				name: questionInput.name,
				question: questionInput.question,
				description: questionInput.description,
				choices: questionInput.choices,
			}),
		).rejects.toMatchObject({ code: "not_found" });
		await expect(
			updateQuestion(created.id, {
				name: questionInput.name,
				question: questionInput.question,
				description: questionInput.description,
				choices: [
					{ id: foreign.id, label: "Foreign", isCorrect: true },
					{ id: local.id, label: local.label, isCorrect: false },
				],
			}),
		).rejects.toMatchObject({ code: "invalid_choice" });
		await expect(
			updateQuestion(created.id, {
				name: questionInput.name,
				question: questionInput.question,
				description: questionInput.description,
				choices: questionInput.choices.map((choice) => ({ ...choice, isCorrect: false })),
			}),
		).rejects.toThrow("Mark exactly one choice as correct");
		await expect(
			updateQuestion(created.id, {
				name: questionInput.name,
				question: questionInput.question,
				description: questionInput.description,
				choices: questionInput.choices.map((choice) => ({ ...choice, isCorrect: true })),
			}),
		).rejects.toThrow("Mark exactly one choice as correct");
		expect(choices).toEqual(before);
	});

	it("deletes the question, its choices, and its attempts, and reports a missing question", async () => {
		const created = await createQuestion(questionInput);
		const choice = created.choices[1];
		if (!choice) {
			throw new Error("expected a choice");
		}
		attempts.push({
			id: "attempt-1",
			question_id: created.id,
			choice_id: choice.id,
			user_id: teacher.id,
			is_correct: 1,
			created_at: "2026-01-01T00:00:00.000Z",
		});

		await deleteQuestion(created.id);

		expect(questions).toHaveLength(0);
		expect(choices).toHaveLength(0);
		expect(attempts).toHaveLength(0);
		await expect(deleteQuestion(created.id)).rejects.toMatchObject({ code: "not_found" });
	});

	it("keeps submitted values out of the SQL text and uses numbered placeholders", async () => {
		await createQuestion(questionInput);

		const sensitive = [questionInput.name, questionInput.question, questionInput.userId, "Oxygen", "Carbon dioxide"];
		expect(statements.length).toBeGreaterThan(0);
		for (const statement of statements) {
			expect(statement.sql).toMatch(/\?1/);
			for (const value of sensitive) {
				expect(statement.sql).not.toContain(value);
			}
		}
	});
});
