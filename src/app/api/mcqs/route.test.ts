import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqServiceError, type McqQuestion } from "@/lib/services/mcq";
import { POST } from "./route";

const { createQuestion } = vi.hoisted(() => ({
	createQuestion: vi.fn(),
}));

vi.mock("@/lib/services/mcq", async () => {
	const actual = await vi.importActual<typeof import("@/lib/services/mcq")>("@/lib/services/mcq");
	return { ...actual, createQuestion };
});

const question: McqQuestion = {
	id: "q1",
	name: "Photosynthesis basics",
	question: "Which gas do plants absorb during photosynthesis?",
	description: "Grade 6 science, unit 3",
	choices: [
		{ id: "c1", label: "Oxygen", position: 1, isCorrect: false },
		{ id: "c2", label: "Carbon dioxide", position: 2, isCorrect: true },
	],
	createdBy: { id: "u1", firstName: "Ada", lastName: "Lovelace", username: "ada" },
	createdAt: "2026-10-13T12:00:00.000Z",
	updatedAt: "2026-10-13T12:00:00.000Z",
};

const validBody = {
	name: "Photosynthesis basics",
	question: "Which gas do plants absorb during photosynthesis?",
	description: "Grade 6 science, unit 3",
	userId: "u1",
	choices: [
		{ label: "Oxygen", isCorrect: false },
		{ label: "Carbon dioxide", isCorrect: true },
	],
};

function create(body: unknown) {
	return POST(
		new Request("http://localhost/api/mcqs", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: typeof body === "string" ? body : JSON.stringify(body),
		}),
	);
}

describe("POST /api/mcqs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 201 and the question, including the user id passed to the service", async () => {
		createQuestion.mockResolvedValue(question);

		const response = await create(validBody);

		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({ question });
		expect(createQuestion).toHaveBeenCalledWith(validBody);
	});

	it("returns 400 and field errors for an invalid body and does not create a question", async () => {
		const badJson = await create("{");
		expect(badJson.status).toBe(400);
		expect((await badJson.json()).error).toBe("Validation failed");

		const tooFew = await create({ ...validBody, choices: [validBody.choices[1]] });
		const tooFewBody = (await tooFew.json()) as { error: string; fields: Record<string, string> };
		expect(tooFew.status).toBe(400);
		expect(tooFewBody.error).toBe("Validation failed");
		expect(tooFewBody.fields.choices).toBe("Add at least 2 choices");

		const noneCorrect = await create({
			...validBody,
			choices: validBody.choices.map((choice) => ({ ...choice, isCorrect: false })),
		});
		const noneBody = (await noneCorrect.json()) as { fields: Record<string, string> };
		expect(noneCorrect.status).toBe(400);
		expect(noneBody.fields.choices).toBe("Mark exactly one choice as correct");

		const missingUser = await create({ ...validBody, userId: " " });
		const missingUserBody = (await missingUser.json()) as { fields: Record<string, string> };
		expect(missingUser.status).toBe(400);
		expect(missingUserBody.fields.userId).toEqual(expect.any(String));
		expect(createQuestion).not.toHaveBeenCalled();
	});

	it("returns 404 when the user does not exist", async () => {
		createQuestion.mockRejectedValue(new McqServiceError("user_not_found"));

		const response = await create(validBody);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "User not found" });
	});

	it("returns 500 when the question cannot be created", async () => {
		createQuestion.mockRejectedValue(new Error("database down"));

		const response = await create(validBody);

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ error: "Unable to create question" });
	});
});
