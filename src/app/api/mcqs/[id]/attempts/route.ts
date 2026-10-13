import { NextResponse } from "next/server";
import { readJson, serviceError, validationError } from "@/lib/http";
import { recordAttempt } from "@/lib/services/attempts";
import { createAttemptSchema } from "@/lib/validators/mcq";

type AttemptRouteContext = {
	params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: AttemptRouteContext) {
	const { id } = await context.params;
	const parsed = createAttemptSchema.safeParse(await readJson(request));
	if (!parsed.success) {
		return validationError(parsed.error);
	}

	try {
		const result = await recordAttempt(id, parsed.data.choiceId, parsed.data.userId);
		return NextResponse.json(result, { status: 201 });
	} catch (error) {
		return serviceError(error, "Unable to record attempt");
	}
}
