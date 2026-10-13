import { NextResponse } from "next/server";
import { McqServiceError } from "@/lib/services/mcq";
import { UserServiceError } from "@/lib/services/users";

const userStatusByCode = {
	duplicate: 409,
	invalid_password: 401,
	not_found: 404,
	invalid_credentials: 401,
} as const;

const mcqStatusByCode = {
	not_found: 404,
	user_not_found: 404,
	invalid_choice: 400,
} as const;

export async function readJson(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return null;
	}
}

export function validationError(error: { issues: { path: PropertyKey[]; message: string }[] }) {
	const fields: Record<string, string> = {};
	for (const issue of error.issues) {
		const field = String(issue.path[0] ?? "body");
		if (!fields[field]) {
			fields[field] = issue.message;
		}
	}

	return NextResponse.json({ error: "Validation failed", fields }, { status: 400 });
}

export function serviceError(error: unknown, fallback: string) {
	if (error instanceof UserServiceError) {
		return NextResponse.json({ error: error.message }, { status: userStatusByCode[error.code] });
	}

	if (error instanceof McqServiceError) {
		return NextResponse.json({ error: error.message }, { status: mcqStatusByCode[error.code] });
	}

	return NextResponse.json({ error: fallback }, { status: 500 });
}
