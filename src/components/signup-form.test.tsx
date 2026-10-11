import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignupForm } from "@/components/signup-form";

const { push, fetchMock } = vi.hoisted(() => ({
	push: vi.fn(),
	fetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

const account = {
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
	password: "correct-horse-1",
};

async function fillAccount(user: ReturnType<typeof userEvent.setup>, confirmPassword = account.password) {
	await user.type(screen.getByLabelText("First name"), account.firstName);
	await user.type(screen.getByLabelText("Last name"), account.lastName);
	await user.type(screen.getByLabelText("Username"), account.username);
	await user.type(screen.getByLabelText("Email"), account.email);
	await user.type(screen.getByLabelText("Password"), account.password);
	await user.type(screen.getByLabelText("Confirm password"), confirmPassword);
}

describe("SignupForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", fetchMock);
	});

	it("shows a mismatch error and does not call fetch when confirm password differs", async () => {
		const user = userEvent.setup();
		render(<SignupForm />);

		await fillAccount(user, "correct-horse-2");
		await user.click(screen.getByRole("button", { name: "Create Account" }));

		expect(screen.getByText("Passwords do not match.")).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(push).not.toHaveBeenCalled();
	});

	it("rejects a password with no number before the request", async () => {
		const user = userEvent.setup();
		render(<SignupForm />);

		await fillAccount(user);
		await user.clear(screen.getByLabelText("Password"));
		await user.clear(screen.getByLabelText("Confirm password"));
		await user.type(screen.getByLabelText("Password"), "correcthorse");
		await user.type(screen.getByLabelText("Confirm password"), "correcthorse");
		await user.click(screen.getByRole("button", { name: "Create Account" }));

		expect(screen.getByText("Password must be 8–128 characters and include a letter and a number.")).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("navigates to /mcq after a 201 and does not send the confirm password", async () => {
		const user = userEvent.setup();
		fetchMock.mockResolvedValue({
			ok: true,
			status: 201,
			json: async () => ({ user: { id: "abc123" } }),
		});
		render(<SignupForm />);

		await fillAccount(user);
		await user.click(screen.getByRole("button", { name: "Create Account" }));

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/auth/register",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify(account),
			}),
		);
		expect(push).toHaveBeenCalledWith("/mcq");
	});

	it("shows the duplicate-account message from a 409", async () => {
		const user = userEvent.setup();
		fetchMock.mockResolvedValue({
			ok: false,
			status: 409,
			json: async () => ({ error: "An account with that username or email already exists" }),
		});
		render(<SignupForm />);

		await fillAccount(user);
		await user.click(screen.getByRole("button", { name: "Create Account" }));

		expect(await screen.findByText("An account with that username or email already exists")).toBeTruthy();
		expect(push).not.toHaveBeenCalled();
	});

	it("links to the login page", () => {
		render(<SignupForm />);

		expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
		expect(screen.queryByRole("button", { name: /google/i })).toBeNull();
	});
});
