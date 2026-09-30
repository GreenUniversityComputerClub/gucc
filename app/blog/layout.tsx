// Article typography (headings, lists, quotes, code): only the pages that show articles load it.
import "./[slug]/blog.css";

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
