import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { createUser, deleteUser, updateUser } = vi.hoisted(() => ({
	createUser: vi.fn(),
	updateUser: vi.fn(),
	deleteUser: vi.fn(),
}));

vi.mock("@/lib/services/users", async () => {
	const actual = await vi.importActual<typeof import("@/lib/services/users")>("@/lib/services/users");
	return { ...actual, createUser, updateUser, deleteUser };
});

describe("POST /api/auth/logout", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns ok without creating, updating, or deleting a user", async () => {
		const response = await POST();

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(response.headers.get("set-cookie")).toBeNull();
		expect(createUser).not.toHaveBeenCalled();
		expect(updateUser).not.toHaveBeenCalled();
		expect(deleteUser).not.toHaveBeenCalled();
	});
});
