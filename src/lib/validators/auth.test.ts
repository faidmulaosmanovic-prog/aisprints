import { describe, expect, it } from "vitest";
import {
	deleteUserSchema,
	loginSchema,
	registerSchema,
	updateUserSchema,
} from "@/lib/validators/auth";

const validRegister = {
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
	password: "correct-horse-1",
};

function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
	if (result.success || !result.error) {
		return [];
	}

	return result.error.issues.map((issue) => String(issue.path[0]));
}

describe("register validation", () => {
	it("accepts a complete teacher account", () => {
		expect(registerSchema.safeParse(validRegister).success).toBe(true);
	});

	it("rejects a blank name, a bad email, a short password, a username outside the allowed characters, and a password with no digit or no letter", () => {
		expect(issuePaths(registerSchema.safeParse({ ...validRegister, firstName: " " }))).toContain("firstName");
		expect(issuePaths(registerSchema.safeParse({ ...validRegister, lastName: " " }))).toContain("lastName");
		expect(issuePaths(registerSchema.safeParse({ ...validRegister, email: "not-an-email" }))).toContain("email");
		expect(issuePaths(registerSchema.safeParse({ ...validRegister, password: "short1" }))).toContain("password");
		expect(issuePaths(registerSchema.safeParse({ ...validRegister, username: "bad name" }))).toContain("username");
		expect(issuePaths(registerSchema.safeParse({ ...validRegister, password: "abcdefgh" }))).toContain("password");
		expect(issuePaths(registerSchema.safeParse({ ...validRegister, password: "12345678" }))).toContain("password");
	});
});

describe("login validation", () => {
	it("requires an identifier and a password", () => {
		expect(loginSchema.safeParse({}).success).toBe(false);
		expect(loginSchema.safeParse({ identifier: "ada" }).success).toBe(false);
		expect(loginSchema.safeParse({ password: "correct-horse-1" }).success).toBe(false);
		expect(loginSchema.safeParse({ identifier: "ada", password: "correct-horse-1" }).success).toBe(true);
	});
});

describe("update validation", () => {
	const validUpdate = {
		currentPassword: "correct-horse-1",
		firstName: "Ada",
		lastName: "Byron",
		username: "ada",
		email: "ada@school.edu",
	};

	it("requires the current password and profile fields, and allows a new password to be omitted", () => {
		expect(updateUserSchema.safeParse(validUpdate).success).toBe(true);
		expect(updateUserSchema.safeParse({ ...validUpdate, newPassword: "new-password-1" }).success).toBe(true);
		expect(issuePaths(updateUserSchema.safeParse({ ...validUpdate, currentPassword: "" }))).toContain(
			"currentPassword",
		);
		expect(issuePaths(updateUserSchema.safeParse({ ...validUpdate, firstName: "" }))).toContain("firstName");
		expect(issuePaths(updateUserSchema.safeParse({ ...validUpdate, newPassword: "short" }))).toContain(
			"newPassword",
		);
	});
});

describe("delete validation", () => {
	it("requires the current password", () => {
		expect(deleteUserSchema.safeParse({}).success).toBe(false);
		expect(deleteUserSchema.safeParse({ currentPassword: "" }).success).toBe(false);
		expect(deleteUserSchema.safeParse({ currentPassword: "correct-horse-1" }).success).toBe(true);
	});
});
