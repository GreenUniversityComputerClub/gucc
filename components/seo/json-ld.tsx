/**
 * Emits a structured-data block. Server component: the JSON ships in the
 * initial HTML so crawlers see it without executing JavaScript.
 */
export function JsonLd({ data, id }: { data: unknown; id?: string }) {
  return (
    <script
      type="application/ld+json"
      id={id}
      // Structured data is built from trusted local data; `<` is escaped to
      // keep the payload from breaking out of the script element.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
