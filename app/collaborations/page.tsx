import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

const featuredCollaborations = [
  {
    name: 'UAP EEE',
    image: '/collaborators/uap-eee.png',
    description: 'Collaboration with UAP EEE Club',
  },
  {
    name: 'AUST PIC',
    image: '/collaborators/aust-pic.jpg',
    description: 'Partnership with AUST Programming & Informatics Club',
  },
  {
    name: 'IIEC-IUBAT',
    image: '/collaborators/iiec-iubat.jpg',
    description: 'Joint initiatives with IIEC-IUBAT',
  },
  {
    name: 'HackCSB',
    image: '/collaborators/hack-csb.png',
    description: 'Collaboration with HackCSB',
  },
  {
    name: 'AUST RPC',
    image: '/collaborators/aust-rpc.jpg',
    description: 'Partnership with AUST Robotics & Programming Club',
  },
];

export default function CollaborationsPage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="w-full py-16 md:py-24 bg-gradient-to-b from-primary/20 via-primary/10 to-background">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center space-y-4 text-center">
            <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl">
              Our Collaborations
            </h1>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">
              Working together with leading tech clubs and organizations to create impactful experiences
            </p>
          </div>
        </div>
      </section>

      {/* Collaborations Grid */}
      <section className="w-full py-12">
        <div className="container px-4 md:px-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredCollaborations.map((collab, index) => (
              <Card key={index} className="overflow-hidden">
                <div className="relative h-48 w-full bg-gray-100">
                  <Image
                    src={collab.image}
                    alt={collab.name}
                    fill
                    className="object-contain p-4"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    priority={index < 6}
                  />
                </div>
                <CardHeader>
                  <CardTitle>{collab.name}</CardTitle>
                  <CardDescription>{collab.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="w-full py-16 md:py-24 bg-primary/5">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center space-y-4 text-center">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">
              Want to Collaborate?
            </h2>
            <p className="mx-auto max-w-[600px] text-muted-foreground">
              We're always open to new partnerships that align with our mission of empowering students in technology.
            </p>
            <Button asChild size="lg">
              <a href="mailto:gucc@green.edu.bd">Get in Touch</a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
