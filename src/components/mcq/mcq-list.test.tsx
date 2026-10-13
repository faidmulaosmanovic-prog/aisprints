import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqList } from "@/components/mcq/mcq-list";

const { refresh, fetchMock } = vi.hoisted(() => ({
	refresh: vi.fn(),
	fetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ refresh, push: vi.fn() }),
}));

const questions = [
	{
		id: "q1",
		name: "Photosynthesis basics",
		question: "Which gas do plants absorb?",
		description: "Intro biology",
		createdBy: {
			id: "user-ada",
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
		},
	},
	{
		id: "q2",
		name: "Short",
		question: "Second question text",
		description: "",
		createdBy: {
			id: "user-grace",
			firstName: "Grace",
			lastName: "Hopper",
			username: "grace",
		},
	},
];

describe("McqList", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", fetchMock);
	});

	it("lists each question with its author", () => {
		render(<McqList questions={questions} />);

		expect(screen.getByRole("heading", { name: "Multiple-choice questions" })).toBeTruthy();
		expect(screen.getByRole("link", { name: "New question" }).getAttribute("href")).toBe("/mcq/new");
		expect(screen.getByRole("columnheader", { name: "Created by" })).toBeTruthy();

		const rows = screen.getAllByRole("row");
		expect(rows[1].textContent).toContain("Photosynthesis basics");
		expect(rows[1].textContent).toContain("Which gas do plants absorb?");
		expect(rows[1].textContent).toContain("Intro biology");
		expect(rows[1].textContent).toContain("Ada Lovelace");
		expect(rows[2].textContent).toContain("Short");
		expect(rows[2].textContent).toContain("Grace Hopper");
		expect(screen.getByText("Which gas do plants absorb?").getAttribute("title")).toBe(
			"Which gas do plants absorb?",
		);
		expect(screen.getByText("—")).toBeTruthy();
	});

	it("links to create when there are no questions", () => {
		render(<McqList questions={[]} />);

		expect(screen.getByText("No questions yet.")).toBeTruthy();
		expect(screen.getByRole("link", { name: "Create your first question" }).getAttribute("href")).toBe(
			"/mcq/new",
		);
	});

	it("offers edit and preview links from the row menu", async () => {
		const user = userEvent.setup();
		render(<McqList questions={questions} />);

		await user.click(screen.getByRole("button", { name: "Actions for Photosynthesis basics" }));

		expect((await screen.findByRole("menuitem", { name: "Edit" })).getAttribute("href")).toBe(
			"/mcq/q1/edit",
		);
		expect(screen.getByRole("menuitem", { name: "Preview" }).getAttribute("href")).toBe(
			"/mcq/q1/preview",
		);
	});

	it("asks before deleting and leaves the question when cancelled", async () => {
		const user = userEvent.setup();
		render(<McqList questions={questions} />);

		await user.click(screen.getByRole("button", { name: "Actions for Photosynthesis basics" }));
		await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

		expect(await screen.findByRole("heading", { name: "Delete this question?" })).toBeTruthy();
		expect(
			screen.getByText(
				'This removes "Photosynthesis basics", its choices, and every recorded attempt. This cannot be undone.',
			),
		).toBeTruthy();

		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(fetchMock).not.toHaveBeenCalled();
		expect(screen.queryByRole("heading", { name: "Delete this question?" })).toBeNull();
	});

	it("deletes the question and refreshes the list", async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ ok: true }),
		});
		const user = userEvent.setup();
		render(<McqList questions={questions} />);

		await user.click(screen.getByRole("button", { name: "Actions for Photosynthesis basics" }));
		await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
		await user.click(await screen.findByRole("button", { name: "Delete" }));

		expect(fetchMock).toHaveBeenCalledWith("/api/mcqs/q1", { method: "DELETE" });
		expect(refresh).toHaveBeenCalled();
		expect(screen.queryByRole("heading", { name: "Delete this question?" })).toBeNull();
	});

	it("keeps the dialog open and shows the error when delete fails", async () => {
		fetchMock.mockResolvedValue({
			ok: false,
			status: 500,
			json: async () => ({ error: "Unable to delete question" }),
		});
		const user = userEvent.setup();
		render(<McqList questions={questions} />);

		await user.click(screen.getByRole("button", { name: "Actions for Photosynthesis basics" }));
		await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
		await user.click(await screen.findByRole("button", { name: "Delete" }));

		expect(await screen.findByText("Unable to delete question")).toBeTruthy();
		expect(screen.getByRole("heading", { name: "Delete this question?" })).toBeTruthy();
		expect(refresh).not.toHaveBeenCalled();
	});
});
