import { describe, expect, it } from "vitest";
import { serviceError } from "@/lib/http";
import { McqServiceError } from "@/lib/services/mcq";
import { UserServiceError } from "@/lib/services/users";

describe("serviceError", () => {
	it("maps question errors, keeps account errors, and uses the fallback for anything else", async () => {
		const missingQuestion = serviceError(new McqServiceError("not_found"), "fallback");
		expect(missingQuestion.status).toBe(404);
		expect(await missingQuestion.json()).toEqual({ error: "Question not found" });

		const missingUser = serviceError(new McqServiceError("user_not_found"), "fallback");
		expect(missingUser.status).toBe(404);
		expect(await missingUser.json()).toEqual({ error: "User not found" });

		const foreignChoice = serviceError(new McqServiceError("invalid_choice"), "fallback");
		expect(foreignChoice.status).toBe(400);
		expect(await foreignChoice.json()).toEqual({ error: "Choice does not belong to this question" });

		const unknownAccount = serviceError(new UserServiceError("not_found"), "fallback");
		expect(unknownAccount.status).toBe(404);
		expect(await unknownAccount.json()).toEqual({ error: "User not found" });

		const duplicate = serviceError(new UserServiceError("duplicate"), "fallback");
		expect(duplicate.status).toBe(409);
		expect(await duplicate.json()).toEqual({
			error: "An account with that username or email already exists",
		});

		const other = serviceError(new Error("database down"), "Unable to create question");
		expect(other.status).toBe(500);
		expect(await other.json()).toEqual({ error: "Unable to create question" });
	});
});
