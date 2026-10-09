import { z } from "zod";

const nameSchema = z.string().trim().min(1).max(80);

const usernameSchema = z
	.string()
	.trim()
	.min(3)
	.max(32)
	.regex(/^[A-Za-z0-9_]+$/)
	.transform((value) => value.toLowerCase());

const emailSchema = z
	.string()
	.trim()
	.max(254)
	.email()
	.transform((value) => value.toLowerCase());

const passwordSchema = z
	.string()
	.min(8)
	.max(128)
	.regex(/[A-Za-z]/)
	.regex(/[0-9]/);

export const registerSchema = z.object({
	firstName: nameSchema,
	lastName: nameSchema,
	username: usernameSchema,
	email: emailSchema,
	password: passwordSchema,
});

export const loginSchema = z.object({
	identifier: z.string().trim().min(1),
	password: z.string().min(1),
});

export const updateUserSchema = z.object({
	currentPassword: z.string().min(1),
	firstName: nameSchema,
	lastName: nameSchema,
	username: usernameSchema,
	email: emailSchema,
	newPassword: passwordSchema.optional(),
});

export const deleteUserSchema = z.object({
	currentPassword: z.string().min(1),
});
