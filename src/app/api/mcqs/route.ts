import { NextResponse } from "next/server";
import { readJson, serviceError, validationError } from "@/lib/http";
import { createQuestion } from "@/lib/services/mcq";
import { createMcqSchema } from "@/lib/validators/mcq";

export async function POST(request: Request) {
	const parsed = createMcqSchema.safeParse(await readJson(request));
	if (!parsed.success) {
		return validationError(parsed.error);
	}

	try {
		const question = await createQuestion(parsed.data);
		return NextResponse.json({ question }, { status: 201 });
	} catch (error) {
		return serviceError(error, "Unable to create question");
	}
}
