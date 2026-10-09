import { NextResponse } from "next/server";
import { readJson, serviceError, validationError } from "@/lib/http";
import { authenticateUser } from "@/lib/services/users";
import { loginSchema } from "@/lib/validators/auth";

export async function POST(request: Request) {
	const parsed = loginSchema.safeParse(await readJson(request));
	if (!parsed.success) {
		return validationError(parsed.error);
	}

	try {
		const user = await authenticateUser(parsed.data.identifier, parsed.data.password);
		return NextResponse.json({ user });
	} catch (error) {
		return serviceError(error, "Unable to sign in");
	}
}
