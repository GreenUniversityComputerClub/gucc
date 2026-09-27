import { NEWS, PostDetail, detailMetadata } from "@/components/content/post-pages";

export const revalidate = 3600;

/** Rendered on the first visit, then served from the cache until a change or the hour is up. */
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return detailMetadata(NEWS, (await params).slug);
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <PostDetail kind={NEWS} slug={(await params).slug} />;
}
