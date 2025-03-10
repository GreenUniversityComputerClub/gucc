import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CalendarDays, Users, Award, BookOpen } from "lucide-react"
import { AnimatedStat } from "./component"
import eventsData from "@/data/events.json"
import { EventCard } from "./events/page"

const upcomingEvents = eventsData.filter((event) => new Date(event.date) > new Date());
// Events of this year
const recentEvents = eventsData.filter((event) => {
  const eventDate = new Date(event.date);
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return eventDate >= sixMonthsAgo;
});

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="w-full py-16 md:py-24 lg:py-32 bg-gradient-to-b from-primary/20 via-primary/10 to-background relative overflow-hidden">
        {/* <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:60px_60px]" /> */}
        <div className="container relative px-4 md:px-6">
          <div className="flex flex-col items-center space-y-6 text-center">
            <div className="space-y-4">
              <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
                Green University Computer Club
              </h1>
              <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl text-lg">
                Empowering students to excel in the world of technology
              </p>
            </div>

            {/* Hero Section Buttons */}
            {/* <div className="space-x-4">
              <Button asChild size="lg" className="bg-primary hover:bg-primary/90 hover:scale-95 transition-all duration-300">
                <Link href="/events">Explore Events</Link>
              </Button>
              <Button variant="outline" size="lg" asChild className="border-primary/20 hover:bg-primary/10 hover:scale-95 transition-all duration-300">
                <Link href="https://forms.gle/example" target="_blank" rel="noopener noreferrer">
                  Join Us
                </Link>
              </Button>
            </div> */}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="w-full py-16 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
            <div className="space-y-6">
              <div className="inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium">About Us</div>
              <h2 className="text-3xl font-bold tracking-tighter md:text-4xl lg:text-5xl">Who We Are</h2>
              <div className="space-y-4 text-muted-foreground md:text-lg">
                <p>
                  Welcome to the Green University Computer Club (GUCC), a dynamic and student-driven non-profit and
                  non-political organization operating in collaboration with the Department of Computer Science and
                  Engineering (CSE) at the esteemed Green University of Bangladesh. As the flagship club of the
                  university, GUCC boasts a thriving community of over 7000+ members.
                </p>
                <p>
                  Our primary objective is to empower and guide students within the Department of CSE on their journey to
                  carve out successful careers in the ever-evolving realms of modern computer science and engineering.
                  Under the vigilant supervision of the department, GUCC serves as a catalyst for excellence, fostering
                  development and leadership among its members.
                </p>
              </div>
            </div>
            <div className="space-y-8">
              <div className="space-y-4">
                <h3 className="text-2xl font-bold">Our Vision</h3>
                <p className="text-muted-foreground md:text-lg">
                  The vision of the Green University Computer Club is to increase the leadership and develop the
                  professional skills of the CSE students of the Green University of Bangladesh.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <Card className="hover:shadow-lg transition-shadow duration-300">
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
                <Card className="hover:shadow-lg transition-shadow duration-300">
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
                <Card className="hover:shadow-lg transition-shadow duration-300">
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
                <Card className="hover:shadow-lg transition-shadow duration-300">
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
      <section className="w-full py-16 md:py-24 lg:py-32 bg-gradient-to-b from-background to-primary/5">
        <div className="container px-4 md:px-6">
          <div className="text-center space-y-6">
            <h2 className="text-3xl font-bold tracking-tighter md:text-4xl lg:text-5xl">GUCC in Numbers</h2>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-lg">
              Our impact in the university and beyond
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-16">
            <div className="text-center p-6 rounded-lg bg-background/50 backdrop-blur-sm hover:bg-background/80 transition-colors duration-300">
              <AnimatedStat end={7000} suffix="+" className="text-4xl md:text-5xl font-bold text-primary" />
              <div className="text-sm text-muted-foreground mt-3">Members</div>
            </div>
            <div className="text-center p-6 rounded-lg bg-background/50 backdrop-blur-sm hover:bg-background/80 transition-colors duration-300">
              <AnimatedStat end={50} suffix="+" className="text-4xl md:text-5xl font-bold text-primary" />
              <div className="text-sm text-muted-foreground mt-3">Events Per Year</div>
            </div>
            <div className="text-center p-6 rounded-lg bg-background/50 backdrop-blur-sm hover:bg-background/80 transition-colors duration-300">
              <AnimatedStat end={20} suffix="+" className="text-4xl md:text-5xl font-bold text-primary" />
              <div className="text-sm text-muted-foreground mt-3">Workshops</div>
            </div>
            <div className="text-center p-6 rounded-lg bg-background/50 backdrop-blur-sm hover:bg-background/80 transition-colors duration-300">
              <AnimatedStat end={10} suffix="+" className="text-4xl md:text-5xl font-bold text-primary" />
              <div className="text-sm text-muted-foreground mt-3">Years of Excellence</div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Events Section */}
      <section className="w-full">
        <div className="container px-6">
          <div className="flex flex-col items-center justify-center space-y-6 text-center">
            <div className="space-y-4">
              <h2 className="text-3xl mt-12 font-bold tracking-tighter md:text-4xl lg:text-5xl">Recent and Upcoming Events</h2>
          
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-12">
            {[...upcomingEvents, ...recentEvents].slice(0, 6).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((event, index) => (<EventCard key={index} event={event} index={index} />))}
          </div>
        </div>
      </section>
      <div className="flex justify-center m-12">
            <Button asChild variant="outline" className="border-primary/20 hover:bg-primary/10">
              <Link href="/events">View All Events</Link>
            </Button>
          </div>
    </div>
  )
}

