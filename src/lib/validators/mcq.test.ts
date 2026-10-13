import { describe, expect, it } from "vitest";
import { createAttemptSchema, createMcqSchema, updateMcqSchema } from "@/lib/validators/mcq";

const validQuestion = {
	userId: "user-ada",
	name: "Photosynthesis basics",
	question: "Which gas do plants absorb during photosynthesis?",
	description: "Grade 6 science",
	choices: [
		{ label: "Oxygen", isCorrect: false },
		{ label: "Carbon dioxide", isCorrect: true },
	],
};

function choices(count: number, correctIndex = 0) {
	return Array.from({ length: count }, (_, index) => ({
		label: `Choice ${index + 1}`,
		isCorrect: index === correctIndex,
	}));
}

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }): string[] {
	if (result.success || !result.error) {
		return [];
	}

	return result.error.issues.map((issue) => issue.message);
}

describe("create question validation", () => {
	it("accepts a question with 2 choices and a question with 7 choices", () => {
		expect(createMcqSchema.safeParse(validQuestion).success).toBe(true);
		expect(createMcqSchema.safeParse({ ...validQuestion, choices: choices(7) }).success).toBe(true);
	});

	it("rejects a blank name, a blank question, a name longer than 120 characters, and a description longer than 500 characters", () => {
		expect(createMcqSchema.safeParse({ ...validQuestion, name: " " }).success).toBe(false);
		expect(createMcqSchema.safeParse({ ...validQuestion, question: " " }).success).toBe(false);
		expect(createMcqSchema.safeParse({ ...validQuestion, name: "a".repeat(121) }).success).toBe(false);
		expect(createMcqSchema.safeParse({ ...validQuestion, description: "d".repeat(501) }).success).toBe(false);
		expect(createMcqSchema.safeParse({ ...validQuestion, name: "a".repeat(120) }).success).toBe(true);
		expect(createMcqSchema.safeParse({ ...validQuestion, description: "d".repeat(500) }).success).toBe(true);
	});

	it("rejects fewer than 2 choices and more than 7 choices", () => {
		expect(messages(createMcqSchema.safeParse({ ...validQuestion, choices: choices(1) }))).toContain(
			"Add at least 2 choices",
		);
		expect(messages(createMcqSchema.safeParse({ ...validQuestion, choices: choices(8) }))).toContain(
			"A question can have at most 7 choices",
		);
	});

	it("rejects zero correct choices and two correct choices", () => {
		const none = choices(2).map((choice) => ({ ...choice, isCorrect: false }));
		const both = choices(2).map((choice) => ({ ...choice, isCorrect: true }));

		expect(messages(createMcqSchema.safeParse({ ...validQuestion, choices: none }))).toContain(
			"Mark exactly one choice as correct",
		);
		expect(messages(createMcqSchema.safeParse({ ...validQuestion, choices: both }))).toContain(
			"Mark exactly one choice as correct",
		);
	});

	it("rejects a blank choice label and labels that differ only by case or spaces", () => {
		expect(
			messages(
				createMcqSchema.safeParse({
					...validQuestion,
					choices: [
						{ label: "   ", isCorrect: false },
						{ label: "Carbon dioxide", isCorrect: true },
					],
				}),
			),
		).toContain("Every choice needs text");
		expect(
			messages(
				createMcqSchema.safeParse({
					...validQuestion,
					choices: [
						{ label: "Oxygen", isCorrect: false },
						{ label: " oxygen ", isCorrect: true },
					],
				}),
			),
		).toContain("Choices must be different");
	});

	it("stores a missing description as an empty string and trims labels", () => {
		const { description, ...withoutDescription } = validQuestion;
		const parsed = createMcqSchema.parse({
			...withoutDescription,
			choices: [
				{ label: " Oxygen ", isCorrect: false },
				{ label: " Carbon dioxide ", isCorrect: true },
			],
		});

		expect(description).toBe("Grade 6 science");
		expect(parsed.description).toBe("");
		expect(parsed.choices.map((choice) => choice.label)).toEqual(["Oxygen", "Carbon dioxide"]);
	});

	it("requires a user id and drops a choice id", () => {
		expect(createMcqSchema.safeParse({ ...validQuestion, userId: undefined }).success).toBe(false);
		expect(createMcqSchema.safeParse({ ...validQuestion, userId: " " }).success).toBe(false);

		const parsed = createMcqSchema.parse({
			...validQuestion,
			choices: [
				{ id: "c1", label: "Oxygen", isCorrect: false },
				{ id: "c2", label: "Carbon dioxide", isCorrect: true },
			],
		});

		expect(parsed.userId).toBe("user-ada");
		expect(parsed.choices[0]).not.toHaveProperty("id");
		expect(parsed.choices[1]).not.toHaveProperty("id");
	});
});

describe("update question validation", () => {
	it("accepts an optional choice id and ignores a user id", () => {
		const parsed = updateMcqSchema.parse({
			...validQuestion,
			userId: "someone-else",
			choices: [
				{ id: "c1", label: "Oxygen", isCorrect: false },
				{ label: "Carbon dioxide", isCorrect: true },
			],
		});

		expect(parsed).not.toHaveProperty("userId");
		expect(parsed.choices[0]?.id).toBe("c1");
		expect(parsed.choices[1]?.id).toBeUndefined();
	});
});

describe("attempt validation", () => {
	it("requires a choice id and a user id", () => {
		expect(createAttemptSchema.safeParse({}).success).toBe(false);
		expect(createAttemptSchema.safeParse({ choiceId: "c1" }).success).toBe(false);
		expect(createAttemptSchema.safeParse({ userId: "user-ada" }).success).toBe(false);
		expect(createAttemptSchema.safeParse({ choiceId: " ", userId: " " }).success).toBe(false);
		expect(createAttemptSchema.safeParse({ choiceId: "c1", userId: "user-ada" }).success).toBe(true);
	});
});
