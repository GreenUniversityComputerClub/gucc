import { NEWS, PostIndex, indexMetadata } from "@/components/content/post-pages";

export const revalidate = 3600;
export const metadata = indexMetadata(NEWS);

export default function Page() {
  return <PostIndex kind={NEWS} />;
}
