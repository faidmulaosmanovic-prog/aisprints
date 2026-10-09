import { NextResponse } from "next/server";
import { readJson, serviceError, validationError } from "@/lib/http";
import { createUser } from "@/lib/services/users";
import { registerSchema } from "@/lib/validators/auth";

export async function POST(request: Request) {
	const parsed = registerSchema.safeParse(await readJson(request));
	if (!parsed.success) {
		return validationError(parsed.error);
	}

	try {
		const user = await createUser(parsed.data);
		return NextResponse.json({ user }, { status: 201 });
	} catch (error) {
		return serviceError(error, "Unable to create account");
	}
}
