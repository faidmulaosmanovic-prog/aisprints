import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqStub } from "@/components/auth/mcq-stub";

const { push, fetchMock } = vi.hoisted(() => ({
	push: vi.fn(),
	fetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

describe("McqStub", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", fetchMock);
	});

	it("says multiple-choice quizzes are not built yet", () => {
		render(<McqStub />);

		expect(screen.getByRole("heading", { name: "Multiple-choice quizzes" })).toBeTruthy();
		expect(screen.getByText("Multiple-choice quizzes are not built yet.")).toBeTruthy();
	});

	it("does not show a question list or a create-question form", () => {
		render(<McqStub />);

		expect(screen.queryByRole("textbox")).toBeNull();
		expect(screen.queryByRole("button", { name: /question/i })).toBeNull();
		expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Logout"]);
	});

	it("posts logout and then navigates to /login", async () => {
		const user = userEvent.setup();
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ ok: true }),
		});
		render(<McqStub />);

		await user.click(screen.getByRole("button", { name: "Logout" }));

		expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
		expect(push).toHaveBeenCalledWith("/login");
	});
});
