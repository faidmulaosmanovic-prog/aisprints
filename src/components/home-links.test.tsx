import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeLinks } from "@/components/home-links";

describe("HomeLinks", () => {
	it("shows Quiz Maker and links to register and login", () => {
		render(<HomeLinks />);

		expect(screen.getByText("Quiz Maker")).toBeTruthy();
		expect(screen.getByRole("link", { name: "Register" }).getAttribute("href")).toBe("/register");
		expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/login");
	});
});
