import { notFound } from "next/navigation";
import { McqPreview } from "@/components/mcq/mcq-preview";
import { getQuestionForAttempt } from "@/lib/services/attempts";

export const dynamic = "force-dynamic";

export default async function PreviewMcqPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const question = await getQuestionForAttempt(id);
	if (!question) {
		notFound();
	}

	return (
		<main className="mx-auto flex w-full max-w-2xl flex-col px-4 py-10">
			<McqPreview question={question} />
		</main>
	);
}
