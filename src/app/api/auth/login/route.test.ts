import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserServiceError, type PublicUser } from "@/lib/services/users";
import { POST } from "./route";

const { authenticateUser } = vi.hoisted(() => ({
	authenticateUser: vi.fn(),
}));

vi.mock("@/lib/services/users", async () => {
	const actual = await vi.importActual<typeof import("@/lib/services/users")>("@/lib/services/users");
	return { ...actual, authenticateUser };
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

function login(body: unknown) {
	return POST(
		new Request("http://localhost/api/auth/login", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

describe("POST /api/auth/login", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 and the public user for a username or email, without a session cookie or token", async () => {
		authenticateUser.mockResolvedValue(publicUser);

		const byUsername = await login({ identifier: "ada", password: "correct-horse-1" });
		const byEmail = await login({ identifier: "ada@school.edu", password: "correct-horse-1" });

		expect(byUsername.status).toBe(200);
		expect(byEmail.status).toBe(200);
		expect(await byUsername.json()).toEqual({ user: publicUser });
		expect(await byEmail.json()).toEqual({ user: publicUser });
		expect(byUsername.headers.get("set-cookie")).toBeNull();
		expect(byEmail.headers.get("set-cookie")).toBeNull();
		expect(authenticateUser).toHaveBeenNthCalledWith(1, "ada", "correct-horse-1");
		expect(authenticateUser).toHaveBeenNthCalledWith(2, "ada@school.edu", "correct-horse-1");
	});

	it("returns the same 401 for an unknown account and a wrong password", async () => {
		authenticateUser.mockRejectedValue(new UserServiceError("invalid_credentials"));

		const unknown = await login({ identifier: "missing", password: "correct-horse-1" });
		const wrongPassword = await login({ identifier: "ada", password: "wrong-password-1" });
		const unknownBody = await unknown.json();
		const wrongBody = await wrongPassword.json();

		expect(unknown.status).toBe(401);
		expect(wrongPassword.status).toBe(401);
		expect(unknownBody).toEqual({ error: "Incorrect username, email, or password" });
		expect(wrongBody).toEqual(unknownBody);
		expect(unknown.headers.get("set-cookie")).toBeNull();
		expect(wrongPassword.headers.get("set-cookie")).toBeNull();
	});

	it("returns 400 and field errors for an invalid body", async () => {
		const response = await login({});
		const body = (await response.json()) as { error: string; fields: Record<string, string> };

		expect(response.status).toBe(400);
		expect(body.error).toBe("Validation failed");
		expect(body.fields.identifier).toEqual(expect.any(String));
		expect(body.fields.password).toEqual(expect.any(String));
		expect(authenticateUser).not.toHaveBeenCalled();
	});

	it("returns 500 when sign in fails", async () => {
		authenticateUser.mockRejectedValue(new Error("database down"));

		const response = await login({ identifier: "ada", password: "correct-horse-1" });

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ error: "Unable to sign in" });
	});
});
