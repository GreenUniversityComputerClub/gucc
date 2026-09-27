import { ANNOUNCEMENTS, PostIndex, indexMetadata } from "@/components/content/post-pages";

export const revalidate = 3600;
export const metadata = indexMetadata(ANNOUNCEMENTS);

export default function Page() {
  return <PostIndex kind={ANNOUNCEMENTS} />;
}
