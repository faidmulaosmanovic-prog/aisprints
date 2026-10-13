import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqEditor } from "@/components/mcq/mcq-editor";
import { saveCurrentUser } from "@/lib/current-user";

const { push, refresh, fetchMock } = vi.hoisted(() => ({
	push: vi.fn(),
	refresh: vi.fn(),
	fetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push, refresh }),
}));

const ada = {
	id: "user-ada",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
};

const savedQuestion = {
	id: "q1",
	name: "Photosynthesis basics",
	question: "Which gas do plants absorb?",
	description: "Intro biology",
	choices: [
		{ id: "c1", label: "Oxygen", position: 1, isCorrect: false },
		{ id: "c2", label: "Carbon dioxide", position: 2, isCorrect: true },
	],
	createdBy: ada,
	createdAt: "2026-10-13T00:00:00.000Z",
	updatedAt: "2026-10-13T00:00:00.000Z",
};

function fieldValue(label: string) {
	return (screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement).value;
}

function radioChecked(name: string) {
	return screen.getByRole("radio", { name }).getAttribute("aria-checked");
}

async function fillCreate(user: ReturnType<typeof userEvent.setup>) {
	await user.type(screen.getByLabelText("Name"), "Photosynthesis basics");
	await user.type(screen.getByLabelText("Question"), "Which gas do plants absorb?");
	await user.type(screen.getByLabelText("Description (optional)"), "Intro biology");
	await user.type(screen.getByLabelText("Choice 1"), "Oxygen");
	await user.type(screen.getByLabelText("Choice 2"), "Carbon dioxide");
	await user.click(screen.getByRole("radio", { name: "Choice 2 is correct" }));
}

describe("McqEditor", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		vi.stubGlobal("fetch", fetchMock);
	});

	it("starts a new question with two choices and the first one correct", () => {
		saveCurrentUser(ada);
		render(<McqEditor />);

		expect(screen.getByText("New question")).toBeTruthy();
		expect(fieldValue("Name")).toBe("");
		expect(fieldValue("Question")).toBe("");
		expect(fieldValue("Description (optional)")).toBe("");
		expect(fieldValue("Choice 1")).toBe("");
		expect(fieldValue("Choice 2")).toBe("");
		expect(radioChecked("Choice 1 is correct")).toBe("true");
		expect(radioChecked("Choice 2 is correct")).toBe("false");
		expect(screen.getByText("Add 2 to 7 choices and mark the correct one.")).toBeTruthy();
	});

	it("asks the visitor to log in before creating a question", () => {
		render(<McqEditor />);

		expect(screen.getByRole("link", { name: "Log in to create a question" }).getAttribute("href")).toBe(
			"/login",
		);
		expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("adds choices up to 7 and disables remove at 2", async () => {
		saveCurrentUser(ada);
		const user = userEvent.setup();
		render(<McqEditor />);

		expect(screen.getByRole("button", { name: "Remove choice 1" })).toHaveProperty("disabled", true);
		expect(screen.getByRole("button", { name: "Remove choice 2" })).toHaveProperty("disabled", true);

		for (let count = 3; count <= 7; count += 1) {
			await user.click(screen.getByRole("button", { name: "Add choice" }));
		}

		expect(screen.getAllByRole("radio")).toHaveLength(7);
		expect(screen.getByRole("button", { name: "Add choice" })).toHaveProperty("disabled", true);
		expect(radioChecked("Choice 1 is correct")).toBe("true");
		expect(radioChecked("Choice 7 is correct")).toBe("false");
	});

	it("keeps exactly one correct choice", async () => {
		saveCurrentUser(ada);
		const user = userEvent.setup();
		render(<McqEditor />);

		await user.click(screen.getByRole("radio", { name: "Choice 2 is correct" }));
		expect(radioChecked("Choice 1 is correct")).toBe("false");
		expect(radioChecked("Choice 2 is correct")).toBe("true");

		await user.click(screen.getByRole("button", { name: "Add choice" }));
		await user.click(screen.getByRole("button", { name: "Remove choice 2" }));

		expect(screen.getAllByRole("radio")).toHaveLength(2);
		expect(radioChecked("Choice 1 is correct")).toBe("true");
		expect(radioChecked("Choice 2 is correct")).toBe("false");
	});

	it("shows choice errors and does not save an invalid question", async () => {
		saveCurrentUser(ada);
		const user = userEvent.setup();
		render(<McqEditor />);

		await user.type(screen.getByLabelText("Name"), "Photosynthesis basics");
		await user.type(screen.getByLabelText("Question"), "Which gas do plants absorb?");
		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(screen.getByText("Every choice needs text")).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();

		await user.type(screen.getByLabelText("Choice 1"), "Oxygen");
		await user.type(screen.getByLabelText("Choice 2"), "oxygen");
		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(screen.getByText("Choices must be different")).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("creates the question for the stored teacher and returns to the list", async () => {
		saveCurrentUser(ada);
		fetchMock.mockResolvedValue({
			ok: true,
			status: 201,
			json: async () => ({ question: { id: "q1" } }),
		});
		const user = userEvent.setup();
		render(<McqEditor />);

		await fillCreate(user);
		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/mcqs",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					name: "Photosynthesis basics",
					question: "Which gas do plants absorb?",
					description: "Intro biology",
					userId: "user-ada",
					choices: [
						{ label: "Oxygen", isCorrect: false },
						{ label: "Carbon dioxide", isCorrect: true },
					],
				}),
			}),
		);
		expect(push).toHaveBeenCalledWith("/mcq");
		expect(refresh).toHaveBeenCalled();
	});

	it("disables save and labels it Saving while the request is in flight", async () => {
		saveCurrentUser(ada);
		let resolveFetch: (value: Response) => void = () => {};
		fetchMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveFetch = resolve as (value: Response) => void;
				}),
		);
		const user = userEvent.setup();
		render(<McqEditor />);

		await fillCreate(user);
		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(screen.getByRole("button", { name: "Saving…" })).toHaveProperty("disabled", true);

		resolveFetch({ ok: true, status: 201, json: async () => ({ question: { id: "q1" } }) } as Response);
	});

	it("shows a field error from a 400 and the API error from a 500", async () => {
		saveCurrentUser(ada);
		const user = userEvent.setup();
		render(<McqEditor />);
		await fillCreate(user);

		fetchMock.mockResolvedValueOnce({
			ok: false,
			status: 400,
			json: async () => ({ error: "Validation failed", fields: { name: "Name is already used" } }),
		});
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(screen.getByText("Name is already used")).toBeTruthy();
		expect(push).not.toHaveBeenCalled();

		fetchMock.mockResolvedValueOnce({
			ok: false,
			status: 500,
			json: async () => ({ error: "Unable to create question" }),
		});
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(screen.getByText("Unable to create question")).toBeTruthy();
		expect(push).not.toHaveBeenCalled();
	});

	it("sends the saved choice ids and no user id when editing", async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ question: savedQuestion }),
		});
		const user = userEvent.setup();
		render(<McqEditor question={savedQuestion} />);

		expect(screen.getByText("Edit question")).toBeTruthy();
		expect(fieldValue("Name")).toBe("Photosynthesis basics");
		expect(fieldValue("Question")).toBe("Which gas do plants absorb?");
		expect(fieldValue("Description (optional)")).toBe("Intro biology");
		expect(fieldValue("Choice 1")).toBe("Oxygen");
		expect(fieldValue("Choice 2")).toBe("Carbon dioxide");
		expect(radioChecked("Choice 2 is correct")).toBe("true");

		await user.click(screen.getByRole("button", { name: "Add choice" }));
		await user.type(screen.getByLabelText("Choice 3"), "Nitrogen");
		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/mcqs/q1",
			expect.objectContaining({ method: "PUT" }),
		);
		const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
			userId?: string;
			choices: { id?: string; label: string; isCorrect: boolean }[];
		};
		expect(body).toMatchObject({
			name: "Photosynthesis basics",
			question: "Which gas do plants absorb?",
			description: "Intro biology",
			choices: [
				{ id: "c1", label: "Oxygen", isCorrect: false },
				{ id: "c2", label: "Carbon dioxide", isCorrect: true },
				{ label: "Nitrogen", isCorrect: false },
			],
		});
		expect(body.userId).toBeUndefined();
		expect("id" in body.choices[2]).toBe(false);
		expect(push).toHaveBeenCalledWith("/mcq");
		expect(refresh).toHaveBeenCalled();
	});

	it("cancels back to the list without saving", async () => {
		saveCurrentUser(ada);
		const user = userEvent.setup();
		const { unmount } = render(<McqEditor />);

		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(push).toHaveBeenCalledWith("/mcq");
		expect(fetchMock).not.toHaveBeenCalled();

		unmount();
		vi.clearAllMocks();
		render(<McqEditor question={savedQuestion} />);
		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(push).toHaveBeenCalledWith("/mcq");
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
