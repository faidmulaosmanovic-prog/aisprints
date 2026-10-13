import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogoutButton } from "@/components/auth/logout-button";

const { push, fetchMock } = vi.hoisted(() => ({
	push: vi.fn(),
	fetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

describe("LogoutButton", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		vi.stubGlobal("fetch", fetchMock);
	});

	it("clears the stored user, posts logout, and navigates to /login", async () => {
		sessionStorage.setItem(
			"quiz-maker.user",
			JSON.stringify({
				id: "user-ada",
				firstName: "Ada",
				lastName: "Lovelace",
				username: "ada",
			}),
		);
		fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
		push.mockImplementation(() => {
			expect(sessionStorage.getItem("quiz-maker.user")).toBeNull();
		});
		const user = userEvent.setup();
		render(<LogoutButton />);

		await user.click(screen.getByRole("button", { name: "Logout" }));

		expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
		expect(push).toHaveBeenCalledWith("/login");
	});

	it("disables the button while the request is in flight", async () => {
		let resolveFetch: (value: Response) => void = () => {};
		fetchMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveFetch = resolve as (value: Response) => void;
				}),
		);
		const user = userEvent.setup();
		render(<LogoutButton />);

		await user.click(screen.getByRole("button", { name: "Logout" }));

		expect(screen.getByRole("button", { name: "Logout" })).toHaveProperty("disabled", true);
		expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });

		resolveFetch({ ok: true } as Response);
	});
});
