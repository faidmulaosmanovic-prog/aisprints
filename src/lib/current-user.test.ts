import { beforeEach, describe, expect, it } from "vitest";
import { clearCurrentUser, readCurrentUser, saveCurrentUser } from "@/lib/current-user";

const ada = {
	id: "user-ada",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
};

describe("current user", () => {
	beforeEach(() => {
		sessionStorage.clear();
	});

	it("saves and reads the user under quiz-maker.user", () => {
		saveCurrentUser(ada);

		expect(sessionStorage.getItem("quiz-maker.user")).toBe(JSON.stringify(ada));
		expect(readCurrentUser()).toEqual(ada);
	});

	it("returns null when nothing is stored", () => {
		expect(readCurrentUser()).toBeNull();
	});

	it("returns null when the stored value is not a user", () => {
		sessionStorage.setItem("quiz-maker.user", "not-json");
		expect(readCurrentUser()).toBeNull();

		sessionStorage.setItem("quiz-maker.user", JSON.stringify({ id: 1 }));
		expect(readCurrentUser()).toBeNull();
	});

	it("clears the stored user", () => {
		saveCurrentUser(ada);
		clearCurrentUser();

		expect(sessionStorage.getItem("quiz-maker.user")).toBeNull();
		expect(readCurrentUser()).toBeNull();
	});
});
