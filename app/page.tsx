import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CalendarDays, Users, Award, BookOpen } from "lucide-react"

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="w-full py-12 md:py-24 lg:py-32 bg-linear-to-b from-primary/10 to-background">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl">
                Green University Computer Club
              </h1>
              <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">
                Empowering students to excel in the world of technology
              </p>
            </div>
            <div className="space-x-4">
              <Button asChild size="lg">
                <Link href="/events">Explore Events</Link>
              </Button>
              {/* <Button variant="outline" size="lg" asChild>
                <Link href="https://forms.gle/example" target="_blank" rel="noopener noreferrer">
                  Join Us
                </Link>
              </Button> */}
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="w-full py-12 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-12 items-center">
            <div className="space-y-4">
              <div className="inline-block rounded-lg bg-primary/10 px-3 py-1 text-sm">About Us</div>
              <h2 className="text-3xl font-bold tracking-tighter md:text-4xl">Who We Are</h2>
              <p className="text-muted-foreground md:text-lg">
                Welcome to the Green University Computer Club (GUCC), a dynamic and student-driven non-profit and
                non-political organization operating in collaboration with the Department of Computer Science and
                Engineering (CSE) at the esteemed Green University of Bangladesh. As the flagship club of the
                university, GUCC boasts a thriving community of over 7000+ members.
              </p>
              <p className="text-muted-foreground md:text-lg">
                Our primary objective is to empower and guide students within the Department of CSE on their journey to
                carve out successful careers in the ever-evolving realms of modern computer science and engineering.
                Under the vigilant supervision of the department, GUCC serves as a catalyst for excellence, fostering
                development and leadership among its members.
              </p>
            </div>
            <div className="space-y-4">
              <h3 className="text-2xl font-bold">Our Vision</h3>
              <p className="text-muted-foreground md:text-lg">
                The vision of the Green University Computer Club is to increase the leadership and develop the
                professional skills of the CSE students of the Green University of Bangladesh.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center">
                      <Users className="h-5 w-5 mr-2 text-primary" />
                      Community
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Building a vibrant community of tech enthusiasts</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center">
                      <Award className="h-5 w-5 mr-2 text-primary" />
                      Excellence
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Striving for excellence in all our endeavors</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center">
                      <BookOpen className="h-5 w-5 mr-2 text-primary" />
                      Learning
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Promoting continuous learning and growth</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center">
                      <CalendarDays className="h-5 w-5 mr-2 text-primary" />
                      Events
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Organizing impactful events and workshops</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="w-full py-12 md:py-24 lg:py-32 bg-primary/5">
        <div className="container px-4 md:px-6">
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-bold tracking-tighter md:text-4xl">GUCC in Numbers</h2>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-lg">
              Our impact in the university and beyond
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-12">
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">7000+</div>
              <div className="text-sm text-muted-foreground mt-2">Members</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">50+</div>
              <div className="text-sm text-muted-foreground mt-2">Events Per Year</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">20+</div>
              <div className="text-sm text-muted-foreground mt-2">Workshops</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">10+</div>
              <div className="text-sm text-muted-foreground mt-2">Years of Excellence</div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Events Section */}
      <section className="w-full py-12 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tighter md:text-4xl">Upcoming Events</h2>
              <p className="mx-auto max-w-[700px] text-muted-foreground md:text-lg">
                Join us for our exciting upcoming events
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            <Card>
              <CardHeader>
                <CardTitle>Green University Gaming Battle</CardTitle>
                <CardDescription>1st Jun 2024</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Compete in various gaming competitions and show your skills.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Leadership Workshop</CardTitle>
                <CardDescription>16th Jun 2024</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Develop your leadership skills in this collaborative workshop with CETL.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Seminar on Research and Publication</CardTitle>
                <CardDescription>17th May 2024</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Learn about research methodologies and how to get your work published.
                </p>
              </CardContent>
            </Card>
          </div>
          <div className="flex justify-center mt-8">
            <Button asChild variant="outline">
              <Link href="/events">View All Events</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

