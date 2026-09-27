import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicForm } from "@/lib/public/data";
import { buildMetadata } from "@/lib/seo/metadata";
import { FormViewer } from "./form-viewer";

export const revalidate = 21600;

/** Rendered on the first visit, then cached (edits refresh it through the forms tag). */
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ form_slug: string }> }): Promise<Metadata> {
  const form = await getPublicForm((await params).form_slug);
  return buildMetadata({ title: form?.title ?? "Form", description: "A Green University Computer Club form.", path: `/forms/${(await params).form_slug}`, noIndex: !form });
}

export default async function FormPage({ params }: { params: Promise<{ form_slug: string }> }) {
  const form = await getPublicForm((await params).form_slug);
  if (!form) notFound();
  return <FormViewer form={form} />;
}
