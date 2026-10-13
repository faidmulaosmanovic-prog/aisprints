import { z } from "zod";

const nameSchema = z.string().trim().min(1).max(120);
const questionSchema = z.string().trim().min(1).max(1000);
const descriptionSchema = z
	.string()
	.trim()
	.max(500)
	.optional()
	.transform((value) => value ?? "");
const userIdSchema = z.string().trim().min(1);
const choiceLabelSchema = z.string().trim().min(1, "Every choice needs text").max(200);

const createChoiceSchema = z.object({
	label: choiceLabelSchema,
	isCorrect: z.boolean(),
});

const updateChoiceSchema = createChoiceSchema.extend({
	id: z.string().trim().min(1).optional(),
});

type ChoiceInput = {
	label: string;
	isCorrect: boolean;
};

function refineChoices(choices: ChoiceInput[], ctx: z.RefinementCtx): void {
	const correctCount = choices.filter((choice) => choice.isCorrect).length;
	if (correctCount !== 1) {
		ctx.addIssue({
			code: "custom",
			message: "Mark exactly one choice as correct",
			path: ["choices"],
		});
	}

	const labels = choices.map((choice) => choice.label.toLowerCase());
	if (new Set(labels).size !== labels.length) {
		ctx.addIssue({
			code: "custom",
			message: "Choices must be different",
			path: ["choices"],
		});
	}
}

const questionFields = {
	name: nameSchema,
	question: questionSchema,
	description: descriptionSchema,
};

export const createMcqSchema = z
	.object({
		...questionFields,
		userId: userIdSchema,
		choices: z
			.array(createChoiceSchema)
			.min(2, "Add at least 2 choices")
			.max(7, "A question can have at most 7 choices"),
	})
	.superRefine((value, ctx) => {
		refineChoices(value.choices, ctx);
	});

export const updateMcqSchema = z
	.object({
		...questionFields,
		choices: z
			.array(updateChoiceSchema)
			.min(2, "Add at least 2 choices")
			.max(7, "A question can have at most 7 choices"),
	})
	.superRefine((value, ctx) => {
		refineChoices(value.choices, ctx);
	});

export const createAttemptSchema = z.object({
	choiceId: z.string().trim().min(1),
	userId: userIdSchema,
});

export type CreateMcqInput = z.infer<typeof createMcqSchema>;
export type UpdateMcqInput = z.infer<typeof updateMcqSchema>;
export type CreateAttemptInput = z.infer<typeof createAttemptSchema>;
