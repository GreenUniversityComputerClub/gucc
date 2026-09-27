import { redirect } from "next/navigation";
import { requireAdmin, rpc } from "@/lib/api/session";
import { ActionForm, PageHeader } from "@/components/admin/ui";
import { createPostAction } from "../../actions";
import { PostFields } from "../post-form";

export default async function NewPost({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const session = await requireAdmin("/dashboard/posts/new");
  if (!session.caps["posts.create"]) redirect("/dashboard/denied?from=/admin/posts/new");
  const cats = await rpc<Array<{ slug: string; name: string }>>("categories.list", { kind: "POST" });
  const t = (await searchParams).type;
  const type = t === "NEWS" || t === "ANNOUNCEMENT" ? t : "BLOG";
  return (
    <>
      <PageHeader title={`New ${type === "BLOG" ? "blog post" : type.toLowerCase()}`} description="Saved as a draft. Publishing may need approval depending on your position and the governance rules." />
      <ActionForm action={createPostAction} submitLabel="Create draft" redirectTo="/dashboard/posts/{id}">
        <PostFields type={type} categories={cats.ok ? cats.data : []} />
      </ActionForm>
    </>
  );
}
