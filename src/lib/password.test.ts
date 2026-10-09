import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

const password = "correct-horse-1";

describe("password hashing", () => {
	it("stores a PBKDF2 hash that does not contain the plaintext password", async () => {
		const hash = await hashPassword(password);

		expect(hash.startsWith("pbkdf2_sha256$")).toBe(true);
		expect(hash).not.toContain(password);
	});

	it("uses a different salt for each hash of the same password", async () => {
		const first = await hashPassword(password);
		const second = await hashPassword(password);

		expect(first).not.toBe(second);
	});

	it("accepts the original password and rejects a different one", async () => {
		const hash = await hashPassword(password);

		expect(await verifyPassword(password, hash)).toBe(true);
		expect(await verifyPassword("wrong-password-1", hash)).toBe(false);
		expect(await verifyPassword(password, "not-a-hash")).toBe(false);
	});
});
