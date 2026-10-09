import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserServiceError, type PublicUser } from "@/lib/services/users";
import { DELETE, PATCH } from "./route";

const { deleteUser, updateUser } = vi.hoisted(() => ({
	deleteUser: vi.fn(),
	updateUser: vi.fn(),
}));

vi.mock("@/lib/services/users", async () => {
	const actual = await vi.importActual<typeof import("@/lib/services/users")>("@/lib/services/users");
	return { ...actual, deleteUser, updateUser };
});

const publicUser: PublicUser = {
	id: "abc123",
	firstName: "Ada",
	lastName: "Byron",
	username: "ada",
	email: "ada@school.edu",
	createdAt: "2026-10-09T12:00:00.000Z",
	updatedAt: "2026-10-09T12:00:00.000Z",
};

const validUpdate = {
	currentPassword: "correct-horse-1",
	firstName: "Ada",
	lastName: "Byron",
	username: "ada",
	email: "ada@school.edu",
};

function request(method: string, body: unknown) {
	return new Request("http://localhost/api/users/abc123", {
		method,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

function context() {
	return { params: Promise.resolve({ id: "abc123" }) };
}

describe("PATCH /api/users/[id]", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 and the public user when the current password matches", async () => {
		updateUser.mockResolvedValue(publicUser);

		const response = await PATCH(request("PATCH", validUpdate), context());

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ user: publicUser });
		expect(updateUser).toHaveBeenCalledWith("abc123", validUpdate);
	});

	it("returns 400, 401, 404, and 409 for validation, the wrong password, a missing user, and a duplicate username or email", async () => {
		const invalid = await PATCH(request("PATCH", { ...validUpdate, email: "not-an-email" }), context());
		const invalidBody = (await invalid.json()) as { error: string; fields: Record<string, string> };
		expect(invalid.status).toBe(400);
		expect(invalidBody.error).toBe("Validation failed");
		expect(invalidBody.fields.email).toEqual(expect.any(String));
		expect(updateUser).not.toHaveBeenCalled();

		updateUser.mockRejectedValueOnce(new UserServiceError("invalid_password"));
		const wrongPassword = await PATCH(request("PATCH", validUpdate), context());
		expect(wrongPassword.status).toBe(401);
		expect(await wrongPassword.json()).toEqual({ error: "Incorrect password" });

		updateUser.mockRejectedValueOnce(new UserServiceError("not_found"));
		const missing = await PATCH(request("PATCH", validUpdate), context());
		expect(missing.status).toBe(404);
		expect(await missing.json()).toEqual({ error: "User not found" });

		updateUser.mockRejectedValueOnce(new UserServiceError("duplicate"));
		const duplicate = await PATCH(request("PATCH", validUpdate), context());
		expect(duplicate.status).toBe(409);
		expect(await duplicate.json()).toEqual({
			error: "An account with that username or email already exists",
		});
	});
});

describe("DELETE /api/users/[id]", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns ok when the current password matches", async () => {
		deleteUser.mockResolvedValue(undefined);

		const response = await DELETE(request("DELETE", { currentPassword: "correct-horse-1" }), context());

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(deleteUser).toHaveBeenCalledWith("abc123", "correct-horse-1");
	});

	it("returns 400, 401, and 404 for validation, the wrong password, and a missing user", async () => {
		const invalid = await DELETE(request("DELETE", {}), context());
		const invalidBody = (await invalid.json()) as { error: string; fields: Record<string, string> };
		expect(invalid.status).toBe(400);
		expect(invalidBody.error).toBe("Validation failed");
		expect(invalidBody.fields.currentPassword).toEqual(expect.any(String));
		expect(deleteUser).not.toHaveBeenCalled();

		deleteUser.mockRejectedValueOnce(new UserServiceError("invalid_password"));
		const wrongPassword = await DELETE(request("DELETE", { currentPassword: "wrong-password-1" }), context());
		expect(wrongPassword.status).toBe(401);
		expect(await wrongPassword.json()).toEqual({ error: "Incorrect password" });

		deleteUser.mockRejectedValueOnce(new UserServiceError("not_found"));
		const missing = await DELETE(request("DELETE", { currentPassword: "correct-horse-1" }), context());
		expect(missing.status).toBe(404);
		expect(await missing.json()).toEqual({ error: "User not found" });
	});
});
