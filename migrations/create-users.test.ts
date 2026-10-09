import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const userColumns = [
	"id",
	"first_name",
	"last_name",
	"username",
	"email",
	"password_hash",
	"created_at",
	"updated_at",
] as const;

function stripJsoncComments(source: string): string {
	const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, "");
	return withoutBlocks.replace(/^\s*\/\/.*$/gm, "");
}

function readCreateUsersSql(): string {
	const migrationsDir = join(root, "migrations");
	expect(existsSync(migrationsDir)).toBe(true);

	const files = readdirSync(migrationsDir).filter(
		(name) => name.endsWith(".sql") && name.includes("create-users"),
	);
	expect(files).toHaveLength(1);

	return readFileSync(join(migrationsDir, files[0]), "utf8");
}

function usersTableBody(sql: string): string {
	const match = sql.match(/CREATE TABLE users\s*\(([\s\S]*?)\)\s*;/i);
	expect(match).not.toBeNull();
	return match?.[1] ?? "";
}

describe("create-users migration", () => {
	it("creates users with the account columns", () => {
		const body = usersTableBody(readCreateUsersSql());

		for (const column of userColumns) {
			expect(body).toMatch(new RegExp(`\\b${column}\\b`, "i"));
		}
	});

	it("uses id as the primary key", () => {
		const body = usersTableBody(readCreateUsersSql());
		expect(body).toMatch(/\bid\b[\s\S]*\bPRIMARY KEY\b/i);
	});

	it("compares username and email case-insensitively", () => {
		const body = usersTableBody(readCreateUsersSql());
		expect(body).toMatch(/username\s+TEXT\s+NOT NULL\s+COLLATE NOCASE/i);
		expect(body).toMatch(/email\s+TEXT\s+NOT NULL\s+COLLATE NOCASE/i);
	});

	it("puts unique indexes on username and email", () => {
		const sql = readCreateUsersSql();
		expect(sql).toMatch(
			/CREATE UNIQUE INDEX idx_users_username ON users\s*\(\s*username\s*\)/i,
		);
		expect(sql).toMatch(
			/CREATE UNIQUE INDEX idx_users_email ON users\s*\(\s*email\s*\)/i,
		);
	});
});

describe("wrangler D1 binding", () => {
	it("binds faid-quiz-maker as DB", () => {
		const source = readFileSync(join(root, "wrangler.jsonc"), "utf8");
		const config = JSON.parse(stripJsoncComments(source)) as {
			d1_databases?: Array<{
				binding?: string;
				database_name?: string;
				database_id?: string;
			}>;
		};

		const database = config.d1_databases?.find((entry) => entry.binding === "DB");
		expect(database?.database_name).toBe("faid-quiz-maker");
		expect(database?.database_id).toEqual(expect.stringMatching(/\S+/));
	});
});
