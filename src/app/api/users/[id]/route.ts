import { NextResponse } from "next/server";
import { readJson, serviceError, validationError } from "@/lib/http";
import { deleteUser, updateUser } from "@/lib/services/users";
import { deleteUserSchema, updateUserSchema } from "@/lib/validators/auth";

type UserRouteContext = {
	params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: UserRouteContext) {
	const { id } = await context.params;
	const parsed = updateUserSchema.safeParse(await readJson(request));
	if (!parsed.success) {
		return validationError(parsed.error);
	}

	try {
		const user = await updateUser(id, parsed.data);
		return NextResponse.json({ user });
	} catch (error) {
		return serviceError(error, "Unable to update account");
	}
}

export async function DELETE(request: Request, context: UserRouteContext) {
	const { id } = await context.params;
	const parsed = deleteUserSchema.safeParse(await readJson(request));
	if (!parsed.success) {
		return validationError(parsed.error);
	}

	try {
		await deleteUser(id, parsed.data.currentPassword);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return serviceError(error, "Unable to delete account");
	}
}
