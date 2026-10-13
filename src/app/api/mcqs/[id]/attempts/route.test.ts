import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqServiceError } from "@/lib/services/mcq";
import { POST } from "./route";

const { recordAttempt } = vi.hoisted(() => ({
	recordAttempt: vi.fn(),
}));

vi.mock("@/lib/services/attempts", async () => {
	const actual = await vi.importActual<typeof import("@/lib/services/attempts")>("@/lib/services/attempts");
	return { ...actual, recordAttempt };
});

const attemptResult = {
	attempt: {
		id: "a1",
		questionId: "q1",
		choiceId: "c2",
		userId: "u1",
		isCorrect: true,
		createdAt: "2026-10-13T12:00:00.000Z",
	},
	correctChoiceId: "c2",
};

function request(body: unknown) {
	return new Request("http://localhost/api/mcqs/q1/attempts", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

function context() {
	return { params: Promise.resolve({ id: "q1" }) };
}

describe("POST /api/mcqs/[id]/attempts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 201 with the attempt and the correct choice", async () => {
		recordAttempt.mockResolvedValue(attemptResult);

		const response = await POST(request({ choiceId: "c2", userId: "u1" }), context());

		expect(response.status).toBe(201);
		expect(await response.json()).toEqual(attemptResult);
		expect(attemptResult.attempt.userId).toBe("u1");
		expect(recordAttempt).toHaveBeenCalledWith("q1", "c2", "u1");
	});

	it("returns 400 when the choice id or user id is missing and does not record an attempt", async () => {
		const missingChoice = await POST(request({ userId: "u1" }), context());
		const missingUser = await POST(request({ choiceId: "c2" }), context());

		expect(missingChoice.status).toBe(400);
		expect((await missingChoice.json()).error).toBe("Validation failed");
		expect(missingUser.status).toBe(400);
		expect((await missingUser.json()).error).toBe("Validation failed");
		expect(recordAttempt).not.toHaveBeenCalled();
	});

	it("returns 400, 404, and 500 for a foreign choice, a missing question or user, and a service failure", async () => {
		recordAttempt.mockRejectedValueOnce(new McqServiceError("invalid_choice"));
		const foreign = await POST(request({ choiceId: "c2", userId: "u1" }), context());
		expect(foreign.status).toBe(400);
		expect(await foreign.json()).toEqual({ error: "Choice does not belong to this question" });

		recordAttempt.mockRejectedValueOnce(new McqServiceError("not_found"));
		const missingQuestion = await POST(request({ choiceId: "c2", userId: "u1" }), context());
		expect(missingQuestion.status).toBe(404);
		expect(await missingQuestion.json()).toEqual({ error: "Question not found" });

		recordAttempt.mockRejectedValueOnce(new McqServiceError("user_not_found"));
		const missingUser = await POST(request({ choiceId: "c2", userId: "u1" }), context());
		expect(missingUser.status).toBe(404);
		expect(await missingUser.json()).toEqual({ error: "User not found" });

		recordAttempt.mockRejectedValueOnce(new Error("database down"));
		const failed = await POST(request({ choiceId: "c2", userId: "u1" }), context());
		expect(failed.status).toBe(500);
		expect(await failed.json()).toEqual({ error: "Unable to record attempt" });
	});

	it("ignores a client-supplied correctness flag", async () => {
		recordAttempt.mockResolvedValue(attemptResult);

		await POST(request({ choiceId: "c2", userId: "u1", isCorrect: false }), context());

		expect(recordAttempt).toHaveBeenCalledTimes(1);
		expect(recordAttempt).toHaveBeenCalledWith("q1", "c2", "u1");
		expect(recordAttempt.mock.calls[0]).toHaveLength(3);
	});
});
