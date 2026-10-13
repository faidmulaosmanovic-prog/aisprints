import { LogoutButton } from "@/components/auth/logout-button";
import { McqList } from "@/components/mcq/mcq-list";
import { listQuestions } from "@/lib/services/mcq";

export const dynamic = "force-dynamic";

export default async function McqPage() {
	const questions = await listQuestions();

	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
			<div className="flex justify-end">
				<LogoutButton />
			</div>
			<McqList questions={questions} />
		</main>
	);
}
