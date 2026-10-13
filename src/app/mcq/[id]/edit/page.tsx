import { notFound } from "next/navigation";
import { McqEditor } from "@/components/mcq/mcq-editor";
import { getQuestion } from "@/lib/services/mcq";

export const dynamic = "force-dynamic";

export default async function EditMcqPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const question = await getQuestion(id);
	if (!question) {
		notFound();
	}

	return (
		<main className="mx-auto flex w-full max-w-2xl flex-col px-4 py-10">
			<McqEditor question={question} />
		</main>
	);
}
