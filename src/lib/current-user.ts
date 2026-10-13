const STORAGE_KEY = "quiz-maker.user";

export type CurrentUser = {
	id: string;
	firstName: string;
	lastName: string;
	username: string;
};

function isCurrentUser(value: unknown): value is CurrentUser {
	if (!value || typeof value !== "object") {
		return false;
	}
	const user = value as Record<string, unknown>;
	return (
		typeof user.id === "string" &&
		user.id.length > 0 &&
		typeof user.firstName === "string" &&
		typeof user.lastName === "string" &&
		typeof user.username === "string"
	);
}

export function saveCurrentUser(user: CurrentUser) {
	sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function saveReturnedUser(value: unknown) {
	if (!isCurrentUser(value)) {
		return;
	}
	saveCurrentUser({
		id: value.id,
		firstName: value.firstName,
		lastName: value.lastName,
		username: value.username,
	});
}

export function readCurrentUser(): CurrentUser | null {
	const raw = sessionStorage.getItem(STORAGE_KEY);
	if (!raw) {
		return null;
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		return isCurrentUser(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

export function clearCurrentUser() {
	sessionStorage.removeItem(STORAGE_KEY);
}
