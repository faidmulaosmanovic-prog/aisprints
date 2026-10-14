import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqPreview } from "@/components/mcq/mcq-preview";
import { saveCurrentUser } from "@/lib/current-user";

const { fetchMock } = vi.hoisted(() => ({
	fetchMock: vi.fn(),
}));

const ada = {
	id: "user-ada",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
};

const question = {
	id: "q1",
	name: "Photosynthesis basics",
	question: "Which gas do plants absorb?",
	description: "Intro biology",
	choices: [
		{ id: "c2", label: "Carbon dioxide", position: 2 },
		{ id: "c1", label: "Oxygen", position: 1 },
	],
	createdBy: ada,
	createdAt: "2026-10-13T00:00:00.000Z",
	updatedAt: "2026-10-13T00:00:00.000Z",
};

function result(isCorrect: boolean, choiceId: string) {
	return {
		attempt: {
			id: "attempt-1",
			questionId: "q1",
			choiceId,
			userId: "user-ada",
			isCorrect,
			createdAt: "2026-10-14T00:00:00.000Z",
		},
		correctChoiceId: "c2",
	};
}

describe("McqPreview", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		vi.stubGlobal("fetch", fetchMock);
	});

	it("shows the question and its choices in order", () => {
		saveCurrentUser(ada);
		render(<McqPreview question={question} />);

		expect(screen.getByText("Photosynthesis basics")).toBeTruthy();
		expect(screen.getByText("Intro biology")).toBeTruthy();
		expect(screen.getByText("Which gas do plants absorb?")).toBeTruthy();
		expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"))).toEqual([
			"Oxygen",
			"Carbon dioxide",
		]);
	});

	it("keeps submit disabled until a choice is picked", async () => {
		saveCurrentUser(ada);
		const user = userEvent.setup();
		render(<McqPreview question={question} />);

		expect(screen.getByRole("button", { name: "Submit answer" })).toHaveProperty("disabled", true);

		await user.click(screen.getByRole("radio", { name: "Oxygen" }));

		expect(screen.getByRole("button", { name: "Submit answer" })).toHaveProperty("disabled", false);
	});

	it("records the selected choice without sending whether it is correct", async () => {
		saveCurrentUser(ada);
		fetchMock.mockResolvedValue({
			ok: true,
			status: 201,
			json: async () => result(false, "c1"),
		});
		const user = userEvent.setup();
		render(<McqPreview question={question} />);

		await user.click(screen.getByRole("radio", { name: "Oxygen" }));
		await user.click(screen.getByRole("button", { name: "Submit answer" }));

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/mcqs/q1/attempts",
			expect.objectContaining({ method: "POST" }),
		);
		const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
			choiceId: string;
			userId: string;
			isCorrect?: boolean;
		};
		expect(body).toEqual({ choiceId: "c1", userId: "user-ada" });
		expect("isCorrect" in body).toBe(false);
	});

	it("shows the question and a login link when nobody is stored", () => {
		render(<McqPreview question={question} />);

		expect(screen.getByText("Which gas do plants absorb?")).toBeTruthy();
		expect(screen.getByRole("radio", { name: "Oxygen" })).toBeTruthy();
		expect(screen.getByRole("link", { name: "Log in to answer this question" }).getAttribute("href")).toBe(
			"/login",
		);
		expect(screen.queryByRole("button", { name: "Submit answer" })).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("shows Correct, or Incorrect with the correct choice", async () => {
		saveCurrentUser(ada);
		const user = userEvent.setup();
		fetchMock.mockResolvedValueOnce({
			ok: true,
			status: 201,
			json: async () => result(true, "c2"),
		});
		const { unmount } = render(<McqPreview question={question} />);

		await user.click(screen.getByRole("radio", { name: "Carbon dioxide" }));
		await user.click(screen.getByRole("button", { name: "Submit answer" }));

		expect(screen.getByText("Correct")).toBeTruthy();
		expect(screen.queryByText("Incorrect")).toBeNull();

		unmount();
		fetchMock.mockResolvedValueOnce({
			ok: true,
			status: 201,
			json: async () => result(false, "c1"),
		});
		render(<McqPreview question={question} />);

		await user.click(screen.getByRole("radio", { name: "Oxygen" }));
		await user.click(screen.getByRole("button", { name: "Submit answer" }));

		expect(screen.getByText("Incorrect")).toBeTruthy();
		expect(screen.getByText("Correct answer")).toBeTruthy();
	});

	it("locks the choices after a result and starts over on Try again", async () => {
		saveCurrentUser(ada);
		fetchMock.mockResolvedValue({
			ok: true,
			status: 201,
			json: async () => result(false, "c1"),
		});
		const user = userEvent.setup();
		render(<McqPreview question={question} />);

		await user.click(screen.getByRole("radio", { name: "Oxygen" }));
		await user.click(screen.getByRole("button", { name: "Submit answer" }));

		expect(screen.getByRole("radio", { name: "Oxygen" }).getAttribute("aria-disabled")).toBe("true");
		expect(screen.getByRole("radio", { name: "Carbon dioxide" }).getAttribute("aria-disabled")).toBe(
			"true",
		);

		await user.click(screen.getByRole("button", { name: "Try again" }));

		expect(screen.queryByText("Incorrect")).toBeNull();
		expect(screen.queryByText("Correct answer")).toBeNull();
		expect(screen.getByRole("radio", { name: "Oxygen" }).getAttribute("aria-checked")).not.toBe("true");
		expect(screen.getByRole("button", { name: "Submit answer" })).toHaveProperty("disabled", true);

		await user.click(screen.getByRole("radio", { name: "Carbon dioxide" }));
		await user.click(screen.getByRole("button", { name: "Submit answer" }));

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("shows the API error and keeps the selection when submit fails", async () => {
		saveCurrentUser(ada);
		fetchMock.mockResolvedValue({
			ok: false,
			status: 400,
			json: async () => ({ error: "Choice does not belong to this question" }),
		});
		const user = userEvent.setup();
		render(<McqPreview question={question} />);

		await user.click(screen.getByRole("radio", { name: "Oxygen" }));
		await user.click(screen.getByRole("button", { name: "Submit answer" }));

		expect(await screen.findByText("Choice does not belong to this question")).toBeTruthy();
		expect(screen.getByRole("radio", { name: "Oxygen" }).getAttribute("aria-checked")).toBe("true");
		expect(screen.queryByText("Incorrect")).toBeNull();
		expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
	});

	it("links to the editor and back to the list", () => {
		saveCurrentUser(ada);
		render(<McqPreview question={question} />);

		expect(screen.getByRole("link", { name: "Edit question" }).getAttribute("href")).toBe("/mcq/q1/edit");
		expect(screen.getByRole("link", { name: "Back to questions" }).getAttribute("href")).toBe("/mcq");
	});
});
