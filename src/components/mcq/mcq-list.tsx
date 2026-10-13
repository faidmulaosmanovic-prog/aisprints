"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { McqSummary } from "@/lib/services/mcq";

export function McqList({ questions }: { questions: McqSummary[] }) {
	const router = useRouter();
	const [pendingDelete, setPendingDelete] = useState<McqSummary | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	function closeDelete() {
		if (deleting) {
			return;
		}
		setPendingDelete(null);
		setDeleteError(null);
	}

	async function confirmDelete() {
		if (!pendingDelete) {
			return;
		}
		setDeleting(true);
		setDeleteError(null);
		try {
			const response = await fetch(`/api/mcqs/${pendingDelete.id}`, { method: "DELETE" });
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as { error?: string } | null;
				setDeleteError(body?.error || "Unable to delete question");
				return;
			}
			setPendingDelete(null);
			router.refresh();
		} catch {
			setDeleteError("Unable to delete question");
		} finally {
			setDeleting(false);
		}
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-4">
				<h1 className="text-2xl font-semibold tracking-tight">Multiple-choice questions</h1>
				<Link href="/mcq/new" className={cn(buttonVariants())}>
					<Plus />
					New question
				</Link>
			</div>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead>Question</TableHead>
						<TableHead>Description</TableHead>
						<TableHead>Created by</TableHead>
						<TableHead className="w-16 text-right">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{questions.length === 0 ? (
						<TableRow>
							<TableCell colSpan={5}>
								<p>No questions yet.</p>
								<Link href="/mcq/new" className="underline underline-offset-4">
									Create your first question
								</Link>
							</TableCell>
						</TableRow>
					) : (
						questions.map((question) => (
							<TableRow key={question.id}>
								<TableCell className="font-medium">{question.name}</TableCell>
								<TableCell>
									<span className="block max-w-xs truncate" title={question.question}>
										{question.question}
									</span>
								</TableCell>
								<TableCell>
									{question.description ? (
										<span className="block max-w-xs truncate" title={question.description}>
											{question.description}
										</span>
									) : (
										<span className="text-muted-foreground">—</span>
									)}
								</TableCell>
								<TableCell>
									{question.createdBy.firstName} {question.createdBy.lastName}
								</TableCell>
								<TableCell className="text-right">
									<DropdownMenu>
										<DropdownMenuTrigger
											render={
												<Button
													variant="ghost"
													size="icon"
													aria-label={`Actions for ${question.name}`}
												/>
											}
										>
											<MoreHorizontal />
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem render={<Link href={`/mcq/${question.id}/edit`} />}>
												<Pencil />
												Edit
											</DropdownMenuItem>
											<DropdownMenuItem render={<Link href={`/mcq/${question.id}/preview`} />}>
												<Eye />
												Preview
											</DropdownMenuItem>
											<DropdownMenuItem
												variant="destructive"
												onClick={() => {
													setDeleteError(null);
													setPendingDelete(question);
												}}
											>
												<Trash2 />
												Delete
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>

			<AlertDialog
				open={pendingDelete !== null}
				onOpenChange={(open) => {
					if (!open) {
						closeDelete();
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this question?</AlertDialogTitle>
						<AlertDialogDescription>
							This removes &quot;{pendingDelete?.name}&quot;, its choices, and every recorded attempt.
							This cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					{deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction disabled={deleting} onClick={confirmDelete}>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
