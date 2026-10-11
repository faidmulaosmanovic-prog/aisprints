import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/login-form";

const { push, fetchMock } = vi.hoisted(() => ({
	push: vi.fn(),
	fetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

describe("LoginForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", fetchMock);
	});

	it("rejects a blank username or email before the request", async () => {
		const user = userEvent.setup();
		render(<LoginForm />);

		await user.type(screen.getByLabelText("Username or email"), "   ");
		await user.type(screen.getByLabelText("Password"), "correct-horse-1");
		await user.click(screen.getByRole("button", { name: "Login" }));

		expect(screen.getByText("Enter a username or email.")).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("navigates to /mcq after a 200", async () => {
		const user = userEvent.setup();
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ user: { id: "abc123" } }),
		});
		render(<LoginForm />);

		const identifier = screen.getByLabelText("Username or email");
		expect(identifier.getAttribute("id")).toBe("email");
		expect(identifier.getAttribute("placeholder")).toBe("m@example.com");

		await user.type(identifier, "ada@school.edu");
		await user.type(screen.getByLabelText("Password"), "correct-horse-1");
		await user.click(screen.getByRole("button", { name: "Login" }));

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/auth/login",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					identifier: "ada@school.edu",
					password: "correct-horse-1",
				}),
			}),
		);
		expect(push).toHaveBeenCalledWith("/mcq");
	});

	it("shows the shared failure message from a 401", async () => {
		const user = userEvent.setup();
		fetchMock.mockResolvedValue({
			ok: false,
			status: 401,
			json: async () => ({ error: "Incorrect username, email, or password" }),
		});
		render(<LoginForm />);

		await user.type(screen.getByLabelText("Username or email"), "ada");
		await user.type(screen.getByLabelText("Password"), "wrong-password-1");
		await user.click(screen.getByRole("button", { name: "Login" }));

		expect(await screen.findByText("Incorrect username, email, or password")).toBeTruthy();
		expect(push).not.toHaveBeenCalled();
	});

	it("links to the register page", () => {
		render(<LoginForm />);

		expect(screen.getByRole("link", { name: "Sign up" }).getAttribute("href")).toBe("/register");
		expect(screen.queryByRole("link", { name: /forgot your password/i })).toBeNull();
		expect(screen.queryByRole("button", { name: /google/i })).toBeNull();
	});
});
