import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPassword } from "@/lib/password";
import {
	authenticateUser,
	createUser,
	deleteUser,
	findUserByIdentifier,
	updateUser,
	UserServiceError,
} from "@/lib/services/users";

type UserRow = {
	id: string;
	first_name: string;
	last_name: string;
	username: string;
	email: string;
	password_hash: string;
	created_at: string;
	updated_at: string;
};

const { fakeDb, rows, statements, resetFakeDb } = vi.hoisted(() => {
	const rows: UserRow[] = [];
	const statements: { sql: string; params: unknown[] }[] = [];

	function collapse(sql: string) {
		return sql.replace(/\s+/g, " ").trim().toUpperCase();
	}

	function query(sql: string, params: unknown[]): UserRow[] {
		const text = collapse(sql);

		if (text.includes("SELECT ID FROM USERS") && text.includes("ID != ?3")) {
			const username = String(params[0]);
			const email = String(params[1]);
			const id = String(params[2]);
			return rows.filter((row) => row.id !== id && (row.username === username || row.email === email));
		}

		if (text.includes("SELECT ID FROM USERS") && text.includes("EMAIL = ?2")) {
			const username = String(params[0]);
			const email = String(params[1]);
			return rows.filter((row) => row.username === username || row.email === email);
		}

		if (text.includes("USERNAME = ?1 OR EMAIL = ?1")) {
			const identifier = String(params[0]);
			return rows.filter((row) => row.username === identifier || row.email === identifier);
		}

		if (text.includes("WHERE ID = ?1")) {
			return rows.filter((row) => row.id === params[0]);
		}

		throw new Error(`Unexpected query: ${text}`);
	}

	function execute(sql: string, params: unknown[]) {
		const text = collapse(sql);

		if (text.startsWith("INSERT INTO USERS")) {
			const [id, firstName, lastName, username, email, passwordHash] = params.map(String);
			if (rows.some((row) => row.username === username || row.email === email)) {
				throw new Error("UNIQUE constraint failed: users.username");
			}
			const now = new Date().toISOString();
			rows.push({
				id,
				first_name: firstName,
				last_name: lastName,
				username,
				email,
				password_hash: passwordHash,
				created_at: now,
				updated_at: now,
			});
			return;
		}

		if (text.startsWith("UPDATE USERS")) {
			const [firstName, lastName, username, email, passwordHash, updatedAt, id] = params.map(String);
			const row = rows.find((item) => item.id === id);
			if (!row) {
				return;
			}
			if (rows.some((item) => item.id !== id && (item.username === username || item.email === email))) {
				throw new Error("UNIQUE constraint failed: users.email");
			}
			row.first_name = firstName;
			row.last_name = lastName;
			row.username = username;
			row.email = email;
			row.password_hash = passwordHash;
			row.updated_at = updatedAt;
			return;
		}

		if (text.startsWith("DELETE FROM USERS") && text.includes("ID = ?1")) {
			const index = rows.findIndex((row) => row.id === params[0]);
			if (index >= 0) {
				rows.splice(index, 1);
			}
			return;
		}

		throw new Error(`Unexpected statement: ${text}`);
	}

	const fakeDb = {
		prepare(sql: string) {
			return {
				bind(...params: unknown[]) {
					return {
						async all() {
							statements.push({ sql, params });
							return { results: query(sql, params) };
						},
						async run() {
							statements.push({ sql, params });
							execute(sql, params);
							return { success: true };
						},
					};
				},
			};
		},
	};

	return {
		rows,
		statements,
		fakeDb,
		resetFakeDb() {
			rows.splice(0, rows.length);
			statements.splice(0, statements.length);
		},
	};
});

vi.mock("@/lib/db", () => ({
	getDb: vi.fn(async () => fakeDb),
}));

const account = {
	firstName: " Ada ",
	lastName: " Lovelace ",
	username: "Ada",
	email: "Ada@School.edu",
	password: "correct-horse-1",
};

describe("user service", () => {
	beforeEach(() => {
		resetFakeDb();
		vi.clearAllMocks();
	});

	it("stores a PBKDF2 hash, lowercases username and email, and returns a public user", async () => {
		const user = await createUser(account);

		expect(user).toEqual({
			id: expect.any(String),
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
			email: "ada@school.edu",
			createdAt: expect.any(String),
			updatedAt: expect.any(String),
		});
		expect(user).not.toHaveProperty("password_hash");

		const insert = statements.find((statement) => statement.sql.includes("INSERT INTO users"));
		expect(insert?.sql).toMatch(/\?1/);
		expect(insert?.params.slice(1, 5)).toEqual(["Ada", "Lovelace", "ada", "ada@school.edu"]);
		const hash = String(insert?.params[5]);
		expect(hash.startsWith("pbkdf2_sha256$")).toBe(true);
		expect(hash).not.toContain(account.password);
		expect(rows).toHaveLength(1);
	});

	it("reports a duplicate username or email and does not insert a second row", async () => {
		await createUser(account);

		await expect(
			createUser({ ...account, username: "ADA", email: "other@school.edu" }),
		).rejects.toMatchObject({ name: "UserServiceError", code: "duplicate" });
		await expect(
			createUser({ ...account, username: "other", email: "ADA@school.edu" }),
		).rejects.toMatchObject({ name: "UserServiceError", code: "duplicate" });
		expect(rows).toHaveLength(1);
	});

	it("finds the same account by username or by email", async () => {
		const created = await createUser(account);

		expect(await findUserByIdentifier("ADA")).toEqual(created);
		expect(await findUserByIdentifier("ADA@SCHOOL.EDU")).toEqual(created);
		expect(await findUserByIdentifier("missing")).toBeNull();
	});

	it("signs in by username or email only when the password matches", async () => {
		const created = await createUser(account);

		expect(await authenticateUser("Ada", account.password)).toEqual(created);
		expect(await authenticateUser("ADA@SCHOOL.EDU", account.password)).toEqual(created);

		const wrongPassword = await authenticateUser("ada", "wrong-password-1").then(
			() => null,
			(error: unknown) => error,
		);
		const unknownAccount = await authenticateUser("missing", account.password).then(
			() => null,
			(error: unknown) => error,
		);

		expect(wrongPassword).toBeInstanceOf(UserServiceError);
		expect(unknownAccount).toBeInstanceOf(UserServiceError);
		expect(wrongPassword).toMatchObject({ code: "invalid_credentials" });
		expect(unknownAccount).toMatchObject({
			code: "invalid_credentials",
			message: wrongPassword instanceof Error ? wrongPassword.message : "",
		});
	});

	it("updates the profile when the current password matches and replaces the hash when a new password is present", async () => {
		const created = await createUser(account);
		const previousHash = rows[0]?.password_hash;

		const updated = await updateUser(created.id, {
			currentPassword: account.password,
			firstName: "Ada",
			lastName: "Byron",
			username: "Ada_B",
			email: "Ada.Byron@School.edu",
			newPassword: "new-password-1",
		});

		expect(updated).toMatchObject({
			id: created.id,
			firstName: "Ada",
			lastName: "Byron",
			username: "ada_b",
			email: "ada.byron@school.edu",
		});
		expect(updated).not.toHaveProperty("password_hash");
		expect(rows[0]?.password_hash).not.toBe(previousHash);
		expect(rows[0]?.password_hash.startsWith("pbkdf2_sha256$")).toBe(true);
		expect(rows[0]?.password_hash).not.toContain("new-password-1");
		expect(await verifyPassword("new-password-1", rows[0]?.password_hash ?? "")).toBe(true);

		const keptHash = rows[0]?.password_hash;
		await updateUser(created.id, {
			currentPassword: "new-password-1",
			firstName: "Augusta",
			lastName: "Byron",
			username: "ada_b",
			email: "ada.byron@school.edu",
		});
		expect(rows[0]?.first_name).toBe("Augusta");
		expect(rows[0]?.password_hash).toBe(keptHash);
	});

	it("rejects an incorrect current password for update and delete and leaves the row in place", async () => {
		const created = await createUser(account);
		const snapshot = structuredClone(rows[0]);

		await expect(
			updateUser(created.id, {
				currentPassword: "wrong-password-1",
				firstName: "Ada",
				lastName: "Byron",
				username: "ada",
				email: "ada@school.edu",
			}),
		).rejects.toMatchObject({ code: "invalid_password" });
		await expect(deleteUser(created.id, "wrong-password-1")).rejects.toMatchObject({ code: "invalid_password" });
		expect(rows[0]).toEqual(snapshot);
	});

	it("reports a missing user for update and delete", async () => {
		await expect(
			updateUser("missing", {
				currentPassword: account.password,
				firstName: "Ada",
				lastName: "Lovelace",
				username: "ada",
				email: "ada@school.edu",
			}),
		).rejects.toMatchObject({ code: "not_found" });
		await expect(deleteUser("missing", account.password)).rejects.toMatchObject({ code: "not_found" });
		expect(rows).toHaveLength(0);
	});

	it("deletes the row when the current password matches", async () => {
		const created = await createUser(account);

		await deleteUser(created.id, account.password);

		expect(rows).toHaveLength(0);
		expect(await findUserByIdentifier("ada")).toBeNull();
	});

	it("rejects an update that reuses another account's username or email", async () => {
		const created = await createUser(account);
		await createUser({
			firstName: "Grace",
			lastName: "Hopper",
			username: "grace",
			email: "grace@school.edu",
			password: "correct-horse-1",
		});

		await expect(
			updateUser(created.id, {
				currentPassword: account.password,
				firstName: "Ada",
				lastName: "Lovelace",
				username: "grace",
				email: "ada@school.edu",
			}),
		).rejects.toMatchObject({ code: "duplicate" });
		expect(rows.find((row) => row.id === created.id)?.username).toBe("ada");
	});
});
