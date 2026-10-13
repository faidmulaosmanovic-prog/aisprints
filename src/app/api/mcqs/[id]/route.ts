import { NextResponse } from "next/server";
import { readJson, serviceError, validationError } from "@/lib/http";
import { deleteQuestion, updateQuestion } from "@/lib/services/mcq";
import { updateMcqSchema } from "@/lib/validators/mcq";

type McqRouteContext = {
	params: Promise<{ id: string }>;
};

export async function PUT(request: Request, context: McqRouteContext) {
	const { id } = await context.params;
	const parsed = updateMcqSchema.safeParse(await readJson(request));
	if (!parsed.success) {
		return validationError(parsed.error);
	}

	try {
		const question = await updateQuestion(id, parsed.data);
		return NextResponse.json({ question });
	} catch (error) {
		return serviceError(error, "Unable to update question");
	}
}

export async function DELETE(_request: Request, context: McqRouteContext) {
	const { id } = await context.params;

	try {
		await deleteQuestion(id);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return serviceError(error, "Unable to delete question");
	}
}
