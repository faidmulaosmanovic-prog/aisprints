import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserServiceError, type PublicUser } from "@/lib/services/users";
import { POST } from "./route";

const { createUser } = vi.hoisted(() => ({
	createUser: vi.fn(),
}));

vi.mock("@/lib/services/users", async () => {
	const actual = await vi.importActual<typeof import("@/lib/services/users")>("@/lib/services/users");
	return { ...actual, createUser };
});

const publicUser: PublicUser = {
	id: "abc123",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
	createdAt: "2026-10-09T12:00:00.000Z",
	updatedAt: "2026-10-09T12:00:00.000Z",
};

const validBody = {
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
	password: "correct-horse-1",
};

function register(body: unknown) {
	return POST(
		new Request("http://localhost/api/auth/register", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

describe("POST /api/auth/register", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 201 and the public user without a session cookie or token", async () => {
		createUser.mockResolvedValue(publicUser);

		const response = await register(validBody);
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body).toEqual({ user: publicUser });
		expect(body).not.toHaveProperty("token");
		expect(response.headers.get("set-cookie")).toBeNull();
		expect(createUser).toHaveBeenCalledWith(validBody);
	});

	it("returns 400 and field errors for an invalid body", async () => {
		const response = await register({ ...validBody, email: "not-an-email" });
		const body = (await response.json()) as { error: string; fields: Record<string, string> };

		expect(response.status).toBe(400);
		expect(body.error).toBe("Validation failed");
		expect(body.fields.email).toEqual(expect.any(String));
		expect(createUser).not.toHaveBeenCalled();
	});

	it("returns 409 when the username or email already exists", async () => {
		createUser.mockRejectedValue(new UserServiceError("duplicate"));

		const response = await register(validBody);

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: "An account with that username or email already exists",
		});
	});

	it("returns 500 when the account cannot be created", async () => {
		createUser.mockRejectedValue(new Error("database down"));

		const response = await register(validBody);

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ error: "Unable to create account" });
	});
});
