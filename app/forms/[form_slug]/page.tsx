import { notFound } from "next/navigation";
import Head from "next/head";
import formsData from "@/data/forms.json";

type Params = { 
  params: { 
    form_slug: string; 
  }; 
};

export default async function FormPage({ params }: Params) {
  const { form_slug } = await Promise.resolve(params);
  const form = formsData.find((f) => f.slug === form_slug);

  if (!form) {
    return notFound();
  }

  const embedUrl = form.url.includes('?')
    ? `${form.url}&embedded=true`
    : `${form.url}?embedded=true`;

  return (
    <>
      <Head>
        <title>{form.title} | My Website</title>
        <meta
          name="description"
          content={`Fill out the ${form.title} form seamlessly on our website.`}
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className="bg-white min-h-screen">
        <div className="container mx-auto px-4 py-8">
          <header className="mb-8 text-center">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900">
              {form.title}
            </h1>
            <p className="mt-4 text-base sm:text-lg text-gray-700">
              Please complete the form below.
            </p>
          </header>
          <section className="w-full">
            <iframe
              src={embedUrl}
              title={form.title}
              className="w-full border-0 h-[100vh] sm:h-[80vh] md:h-[70vh] lg:h-[60vh]"
              allowFullScreen
            >
              Your browser does not support iframes.
            </iframe>
          </section>
        </div>
      </main>
    </>
  );
}
