import { beforeEach, describe, expect, it, vi } from "vitest";
import { attempts, choices, resetFakeDb, users } from "@/lib/services/fake-mcq-db";
import { getQuestionForAttempt, recordAttempt } from "@/lib/services/attempts";
import { createQuestion } from "@/lib/services/mcq";

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

describe("attempts service", () => {
	beforeEach(() => {
		resetFakeDb();
		vi.clearAllMocks();
		users.push({ ...teacher });
	});

	it("returns choices in order without revealing the correct answer", async () => {
		const created = await createQuestion(questionInput);

		const question = await getQuestionForAttempt(created.id);

		expect(question?.choices).toEqual([
			{ id: created.choices[0]?.id, label: "Oxygen", position: 1 },
			{ id: created.choices[1]?.id, label: "Carbon dioxide", position: 2 },
		]);
		expect(question?.choices[0]).not.toHaveProperty("isCorrect");
		expect(question?.createdBy).toEqual({
			id: teacher.id,
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
		});
		expect(await getQuestionForAttempt("missing")).toBeNull();
	});

	it("records a correct attempt with the user and the correct choice", async () => {
		const created = await createQuestion(questionInput);
		const correct = created.choices[1];
		if (!correct) {
			throw new Error("expected a correct choice");
		}

		const result = await recordAttempt(created.id, correct.id, teacher.id);

		expect(result.attempt.isCorrect).toBe(true);
		expect(result.attempt.userId).toBe(teacher.id);
		expect(result.correctChoiceId).toBe(correct.id);
		expect(attempts).toEqual([
			expect.objectContaining({
				question_id: created.id,
				choice_id: correct.id,
				user_id: teacher.id,
				is_correct: 1,
			}),
		]);
	});

	it("records a wrong attempt and still returns the correct choice", async () => {
		const created = await createQuestion(questionInput);
		const wrong = created.choices[0];
		const correct = created.choices[1];
		if (!wrong || !correct) {
			throw new Error("expected choices");
		}

		const result = await recordAttempt(created.id, wrong.id, teacher.id);

		expect(result.attempt.isCorrect).toBe(false);
		expect(result.correctChoiceId).toBe(correct.id);
		expect(attempts[0]?.is_correct).toBe(0);
	});

	it("writes nothing for a missing question, a missing user, or a choice from another question", async () => {
		const created = await createQuestion(questionInput);
		const other = await createQuestion({
			...questionInput,
			name: "Water cycle",
			question: "What falls from clouds?",
		});
		const local = created.choices[1];
		const foreign = other.choices[0];
		if (!local || !foreign) {
			throw new Error("expected choices");
		}

		await expect(recordAttempt("missing", local.id, teacher.id)).rejects.toMatchObject({ code: "not_found" });
		await expect(recordAttempt(created.id, local.id, "missing")).rejects.toMatchObject({ code: "user_not_found" });
		await expect(recordAttempt(created.id, foreign.id, teacher.id)).rejects.toMatchObject({ code: "invalid_choice" });
		expect(attempts).toHaveLength(0);
		expect(choices.length).toBeGreaterThan(0);
	});
});
