export function HomeLinks() {
	return (
		<main className="mx-auto flex min-h-svh w-full max-w-lg flex-col justify-center gap-4 p-6">
			<h1 className="text-2xl font-medium">Quiz Maker</h1>
			<p>Quiz Maker is where teachers create an account before multiple-choice quizzes exist.</p>
			<div className="flex gap-4">
				<a className="underline underline-offset-4" href="/register">
					Register
				</a>
				<a className="underline underline-offset-4" href="/login">
					Log in
				</a>
			</div>
		</main>
	);
}
