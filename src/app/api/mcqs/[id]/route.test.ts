import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqServiceError, type McqQuestion } from "@/lib/services/mcq";
import { DELETE, PUT } from "./route";

const { deleteQuestion, updateQuestion } = vi.hoisted(() => ({
	deleteQuestion: vi.fn(),
	updateQuestion: vi.fn(),
}));

vi.mock("@/lib/services/mcq", async () => {
	const actual = await vi.importActual<typeof import("@/lib/services/mcq")>("@/lib/services/mcq");
	return { ...actual, deleteQuestion, updateQuestion };
});

const question: McqQuestion = {
	id: "q1",
	name: "Photosynthesis basics",
	question: "Which gas do plants absorb during photosynthesis?",
	description: "",
	choices: [
		{ id: "c1", label: "Oxygen", position: 1, isCorrect: false },
		{ id: "c2", label: "Carbon dioxide", position: 2, isCorrect: true },
		{ id: "c3", label: "Nitrogen", position: 3, isCorrect: false },
	],
	createdBy: { id: "u1", firstName: "Ada", lastName: "Lovelace", username: "ada" },
	createdAt: "2026-10-13T12:00:00.000Z",
	updatedAt: "2026-10-13T12:00:00.000Z",
};

const validUpdate = {
	name: "Photosynthesis basics",
	question: "Which gas do plants absorb during photosynthesis?",
	description: "",
	choices: [
		{ id: "c1", label: "Oxygen", isCorrect: false },
		{ id: "c2", label: "Carbon dioxide", isCorrect: true },
		{ label: "Nitrogen", isCorrect: false },
	],
};

function request(method: string, body?: unknown) {
	return new Request("http://localhost/api/mcqs/q1", {
		method,
		headers: body === undefined ? undefined : { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

function context(id = "q1") {
	return { params: Promise.resolve({ id }) };
}

describe("PUT /api/mcqs/[id]", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 and the question for the id in the route", async () => {
		updateQuestion.mockResolvedValue(question);

		const response = await PUT(request("PUT", validUpdate), context());

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ question });
		expect(updateQuestion).toHaveBeenCalledWith("q1", validUpdate);
	});

	it("returns 400, 404, and 500 for validation, a foreign choice, a missing question, and a service failure", async () => {
		const invalid = await PUT(request("PUT", { ...validUpdate, name: " " }), context());
		const invalidBody = (await invalid.json()) as { error: string; fields: Record<string, string> };
		expect(invalid.status).toBe(400);
		expect(invalidBody.error).toBe("Validation failed");
		expect(invalidBody.fields.name).toEqual(expect.any(String));
		expect(updateQuestion).not.toHaveBeenCalled();

		updateQuestion.mockRejectedValueOnce(new McqServiceError("invalid_choice"));
		const foreign = await PUT(request("PUT", validUpdate), context());
		expect(foreign.status).toBe(400);
		expect(await foreign.json()).toEqual({ error: "Choice does not belong to this question" });

		updateQuestion.mockRejectedValueOnce(new McqServiceError("not_found"));
		const missing = await PUT(request("PUT", validUpdate), context());
		expect(missing.status).toBe(404);
		expect(await missing.json()).toEqual({ error: "Question not found" });

		updateQuestion.mockRejectedValueOnce(new Error("database down"));
		const failed = await PUT(request("PUT", validUpdate), context());
		expect(failed.status).toBe(500);
		expect(await failed.json()).toEqual({ error: "Unable to update question" });
	});
});

describe("DELETE /api/mcqs/[id]", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 when the question is deleted", async () => {
		deleteQuestion.mockResolvedValue(undefined);

		const response = await DELETE(request("DELETE"), context("q1"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(deleteQuestion).toHaveBeenCalledWith("q1");
	});

	it("returns 404 for a missing question and 500 when deletion fails", async () => {
		deleteQuestion.mockRejectedValueOnce(new McqServiceError("not_found"));
		const missing = await DELETE(request("DELETE"), context());
		expect(missing.status).toBe(404);
		expect(await missing.json()).toEqual({ error: "Question not found" });

		deleteQuestion.mockRejectedValueOnce(new Error("database down"));
		const failed = await DELETE(request("DELETE"), context());
		expect(failed.status).toBe(500);
		expect(await failed.json()).toEqual({ error: "Unable to delete question" });
	});
});
