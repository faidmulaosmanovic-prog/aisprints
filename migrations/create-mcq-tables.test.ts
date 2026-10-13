import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const questionColumns = [
	"id",
	"name",
	"question",
	"description",
	"created_by",
	"created_at",
	"updated_at",
] as const;

const choiceColumns = [
	"id",
	"question_id",
	"label",
	"position",
	"is_correct",
	"created_at",
	"updated_at",
] as const;

const attemptColumns = ["id", "question_id", "choice_id", "user_id", "is_correct", "created_at"] as const;

function readSqlFile(namePart: string): string {
	const migrationsDir = join(root, "migrations");
	expect(existsSync(migrationsDir)).toBe(true);

	const files = readdirSync(migrationsDir).filter(
		(name) => name.endsWith(".sql") && name.includes(namePart),
	);
	expect(files).toHaveLength(1);

	return readFileSync(join(migrationsDir, files[0]), "utf8");
}

function tableBody(sql: string, table: string): string {
	const start = sql.search(new RegExp(`CREATE TABLE ${table}\\s*\\(`, "i"));
	expect(start).toBeGreaterThanOrEqual(0);

	const open = sql.indexOf("(", start);
	let depth = 0;
	for (let index = open; index < sql.length; index += 1) {
		if (sql[index] === "(") {
			depth += 1;
		} else if (sql[index] === ")") {
			depth -= 1;
			if (depth === 0) {
				return sql.slice(open + 1, index);
			}
		}
	}

	expect.fail(`CREATE TABLE ${table} is missing a closing parenthesis`);
}

describe("create-mcq-tables migration", () => {
	it("creates mcq_questions with the question columns and a primary key", () => {
		const body = tableBody(readSqlFile("create-mcq-tables"), "mcq_questions");

		for (const column of questionColumns) {
			expect(body).toMatch(new RegExp(`\\b${column}\\b`, "i"));
		}

		expect(body).toMatch(/\bid\b[\s\S]*\bPRIMARY KEY\b/i);
		expect(body).toMatch(
			/created_by\s+TEXT\s+NOT NULL\s+REFERENCES\s+users\s*\(\s*id\s*\)\s+ON DELETE CASCADE/i,
		);
	});

	it("creates mcq_choices with a cascading question foreign key", () => {
		const body = tableBody(readSqlFile("create-mcq-tables"), "mcq_choices");

		for (const column of choiceColumns) {
			expect(body).toMatch(new RegExp(`\\b${column}\\b`, "i"));
		}

		expect(body).toMatch(
			/question_id\s+TEXT\s+NOT NULL\s+REFERENCES\s+mcq_questions\s*\(\s*id\s*\)\s+ON DELETE CASCADE/i,
		);
	});

	it("limits choice position to 1 through 7 and is_correct to 0 or 1", () => {
		const body = tableBody(readSqlFile("create-mcq-tables"), "mcq_choices");

		expect(body).toMatch(/position\s+INTEGER\s+NOT NULL\s+CHECK\s*\(\s*position\s+BETWEEN\s+1\s+AND\s+7\s*\)/i);
		expect(body).toMatch(
			/is_correct\s+INTEGER\s+NOT NULL\s+DEFAULT\s+0\s+CHECK\s*\(\s*is_correct\s+IN\s*\(\s*0\s*,\s*1\s*\)\s*\)/i,
		);
	});

	it("allows only one correct choice per question", () => {
		const sql = readSqlFile("create-mcq-tables");

		expect(sql).toMatch(
			/CREATE UNIQUE INDEX idx_mcq_choices_one_correct ON mcq_choices\s*\(\s*question_id\s*\)\s+WHERE\s+is_correct\s*=\s*1/i,
		);
	});

	it("creates mcq_attempts with cascading foreign keys to the question, choice, and user", () => {
		const body = tableBody(readSqlFile("create-mcq-tables"), "mcq_attempts");

		for (const column of attemptColumns) {
			expect(body).toMatch(new RegExp(`\\b${column}\\b`, "i"));
		}

		expect(body).toMatch(
			/question_id\s+TEXT\s+NOT NULL\s+REFERENCES\s+mcq_questions\s*\(\s*id\s*\)\s+ON DELETE CASCADE/i,
		);
		expect(body).toMatch(
			/choice_id\s+TEXT\s+NOT NULL\s+REFERENCES\s+mcq_choices\s*\(\s*id\s*\)\s+ON DELETE CASCADE/i,
		);
		expect(body).toMatch(
			/user_id\s+TEXT\s+NOT NULL\s+REFERENCES\s+users\s*\(\s*id\s*\)\s+ON DELETE CASCADE/i,
		);
		expect(body).toMatch(/is_correct\s+INTEGER\s+NOT NULL\s+CHECK\s*\(\s*is_correct\s+IN\s*\(\s*0\s*,\s*1\s*\)\s*\)/i);
	});

	it("indexes questions by creator, choices by question, and attempts by question, choice, and user", () => {
		const sql = readSqlFile("create-mcq-tables");

		expect(sql).toMatch(/CREATE INDEX idx_mcq_questions_created_by ON mcq_questions\s*\(\s*created_by\s*\)/i);
		expect(sql).toMatch(
			/CREATE INDEX idx_mcq_choices_question_id ON mcq_choices\s*\(\s*question_id\s*,\s*position\s*\)/i,
		);
		expect(sql).toMatch(/CREATE INDEX idx_mcq_attempts_question_id ON mcq_attempts\s*\(\s*question_id\s*\)/i);
		expect(sql).toMatch(/CREATE INDEX idx_mcq_attempts_choice_id ON mcq_attempts\s*\(\s*choice_id\s*\)/i);
		expect(sql).toMatch(/CREATE INDEX idx_mcq_attempts_user_id ON mcq_attempts\s*\(\s*user_id\s*\)/i);
	});

	it("does not change the users migration", () => {
		const usersFiles = readdirSync(join(root, "migrations")).filter(
			(name) => name.endsWith(".sql") && name.includes("create-users"),
		);
		expect(usersFiles).toEqual(["0001_create-users.sql"]);

		const usersSql = readFileSync(join(root, "migrations", "0001_create-users.sql"), "utf8");
		expect(usersSql).not.toMatch(/mcq_/i);
		expect(usersSql).toMatch(/CREATE TABLE users\s*\(/i);
	});
});
