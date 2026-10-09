import { getDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";

const userColumns = "id, first_name, last_name, username, email, password_hash, created_at, updated_at";

const messages = {
	duplicate: "An account with that username or email already exists",
	invalid_password: "Incorrect password",
	not_found: "User not found",
	invalid_credentials: "Incorrect username, email, or password",
} as const;

export class UserServiceError extends Error {
	readonly code: keyof typeof messages;

	constructor(code: keyof typeof messages) {
		super(messages[code]);
		this.name = "UserServiceError";
		this.code = code;
	}
}

export type PublicUser = {
	id: string;
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	createdAt: string;
	updatedAt: string;
};

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

export type CreateUserInput = {
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	password: string;
};

export type UpdateUserInput = {
	currentPassword: string;
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	newPassword?: string;
};

function toPublicUser(row: UserRow): PublicUser {
	return {
		id: row.id,
		firstName: row.first_name,
		lastName: row.last_name,
		username: row.username,
		email: row.email,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function isUniqueViolation(error: unknown): boolean {
	return error instanceof Error && error.message.toLowerCase().includes("unique");
}

async function selectUser(sql: string, ...params: unknown[]): Promise<UserRow | undefined> {
	const db = await getDb();
	const result = await db.prepare(sql).bind(...params).all<UserRow>();
	return result.results[0];
}

async function findRowByIdentifier(identifier: string): Promise<UserRow | undefined> {
	return selectUser(
		`SELECT ${userColumns} FROM users WHERE username = ?1 OR email = ?1`,
		identifier.trim().toLowerCase(),
	);
}

async function findRowById(id: string): Promise<UserRow | undefined> {
	return selectUser(`SELECT ${userColumns} FROM users WHERE id = ?1`, id);
}

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
	const firstName = input.firstName.trim();
	const lastName = input.lastName.trim();
	const username = input.username.trim().toLowerCase();
	const email = input.email.trim().toLowerCase();
	const db = await getDb();
	const existing = await db
		.prepare("SELECT id FROM users WHERE username = ?1 OR email = ?2")
		.bind(username, email)
		.all<{ id: string }>();

	if (existing.results[0]) {
		throw new UserServiceError("duplicate");
	}

	const id = crypto.randomUUID();
	const passwordHash = await hashPassword(input.password);

	try {
		await db
			.prepare(
				"INSERT INTO users (id, first_name, last_name, username, email, password_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
			)
			.bind(id, firstName, lastName, username, email, passwordHash)
			.run();
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw new UserServiceError("duplicate");
		}
		throw error;
	}

	const created = await findRowById(id);
	if (!created) {
		throw new Error("Unable to create account");
	}

	return toPublicUser(created);
}

export async function findUserByIdentifier(identifier: string): Promise<PublicUser | null> {
	const row = await findRowByIdentifier(identifier);
	return row ? toPublicUser(row) : null;
}

export async function authenticateUser(identifier: string, password: string): Promise<PublicUser> {
	const row = await findRowByIdentifier(identifier);
	const matches = row ? await verifyPassword(password, row.password_hash) : false;
	if (!row || !matches) {
		throw new UserServiceError("invalid_credentials");
	}

	return toPublicUser(row);
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<PublicUser> {
	const current = await findRowById(id);
	if (!current) {
		throw new UserServiceError("not_found");
	}

	const passwordMatches = await verifyPassword(input.currentPassword, current.password_hash);
	if (!passwordMatches) {
		throw new UserServiceError("invalid_password");
	}

	const firstName = input.firstName.trim();
	const lastName = input.lastName.trim();
	const username = input.username.trim().toLowerCase();
	const email = input.email.trim().toLowerCase();
	const db = await getDb();
	const conflict = await db
		.prepare("SELECT id FROM users WHERE (username = ?1 OR email = ?2) AND id != ?3")
		.bind(username, email, id)
		.all<{ id: string }>();

	if (conflict.results[0]) {
		throw new UserServiceError("duplicate");
	}

	const passwordHash = input.newPassword ? await hashPassword(input.newPassword) : current.password_hash;
	const updatedAt = new Date().toISOString();

	try {
		await db
			.prepare(
				"UPDATE users SET first_name = ?1, last_name = ?2, username = ?3, email = ?4, password_hash = ?5, updated_at = ?6 WHERE id = ?7",
			)
			.bind(firstName, lastName, username, email, passwordHash, updatedAt, id)
			.run();
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw new UserServiceError("duplicate");
		}
		throw error;
	}

	const updated = await findRowById(id);
	if (!updated) {
		throw new Error("Unable to update account");
	}

	return toPublicUser(updated);
}

export async function deleteUser(id: string, currentPassword: string): Promise<void> {
	const current = await findRowById(id);
	if (!current) {
		throw new UserServiceError("not_found");
	}

	const passwordMatches = await verifyPassword(currentPassword, current.password_hash);
	if (!passwordMatches) {
		throw new UserServiceError("invalid_password");
	}

	const db = await getDb();
	await db.prepare("DELETE FROM users WHERE id = ?1").bind(id).run();
}
