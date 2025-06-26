import PohelaBoishakhGreeting from "@/components/PohelaBoishakhGreeting";
import { HeroSection } from "@/components/hero";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import eventsData from "@/data/events.json";
import { Award, BookOpen, CalendarDays, Users } from "lucide-react";
import Link from "next/link";
import { AnimatedStat } from "./component";
import { CollaborationScroll } from "./components/collaboration-scroll";
import { EventCard } from "./events/components";

const upcomingEvents = eventsData.filter(
  (event) => new Date(event.date) > new Date()
);
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
      {new Date().getMonth() === 3 && new Date().getDate() === 14 && (
        <PohelaBoishakhGreeting />
      )}
      {/* Hero Section */}
      <HeroSection />

      {/* About Section */}
      <section className="w-full py-16 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
            <div className="space-y-6">
              <div className="inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium">
                About Us
              </div>
              <h2 className="text-3xl font-bold tracking-tighter md:text-4xl lg:text-5xl">
                Who We Are
              </h2>
              <div className="space-y-4 text-muted-foreground md:text-lg">
                <p>
                  Welcome to the Green University Computer Club (GUCC), a
                  dynamic and student-driven non-profit and non-political
                  organization operating in collaboration with the Department of
                  Computer Science and Engineering (CSE) at the esteemed Green
                  University of Bangladesh. As the flagship club of the
                  university, GUCC boasts a thriving community of over 7000+
                  members.
                </p>
                <p>
                  Our primary objective is to empower and guide students within
                  the Department of CSE on their journey to carve out successful
                  careers in the ever-evolving realms of modern computer science
                  and engineering. Under the vigilant supervision of the
                  department, GUCC serves as a catalyst for excellence,
                  fostering development and leadership among its members.
                </p>
              </div>
            </div>
            <div className="space-y-8">
              <div className="space-y-4">
                <h3 className="text-2xl font-bold">Our Vision</h3>
                <p className="text-muted-foreground md:text-lg">
                  The vision of the Green University Computer Club is to
                  increase the leadership and develop the professional skills of
                  the CSE students of the Green University of Bangladesh.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-6">
                <Card className="hover:shadow-lg transition-shadow duration-300">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center">
                      <Users className="h-5 w-5 mr-2 text-primary" />
                      Community
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Building a vibrant community of tech enthusiasts
                    </p>
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
                    <p className="text-sm text-muted-foreground">
                      Striving for excellence in all our endeavors
                    </p>
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
                    <p className="text-sm text-muted-foreground">
                      Promoting continuous learning and growth
                    </p>
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
                    <p className="text-sm text-muted-foreground">
                      Organizing impactful events and workshops
                    </p>
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
            <h2 className="text-3xl font-bold tracking-tighter md:text-4xl lg:text-5xl">
              GUCC in Numbers
            </h2>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-lg">
              Our impact in the university and beyond
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-16">
            <div className="text-center p-6 rounded-lg bg-background/50 backdrop-blur-sm hover:bg-background/80 transition-colors duration-300">
              <AnimatedStat
                end={7000}
                suffix="+"
                className="text-4xl md:text-5xl font-bold text-primary"
              />
              <div className="text-sm text-muted-foreground mt-3">Members</div>
            </div>
            <div className="text-center p-6 rounded-lg bg-background/50 backdrop-blur-sm hover:bg-background/80 transition-colors duration-300">
              <AnimatedStat
                end={50}
                suffix="+"
                className="text-4xl md:text-5xl font-bold text-primary"
              />
              <div className="text-sm text-muted-foreground mt-3">
                Events Per Year
              </div>
            </div>
            <div className="text-center p-6 rounded-lg bg-background/50 backdrop-blur-sm hover:bg-background/80 transition-colors duration-300">
              <AnimatedStat
                end={20}
                suffix="+"
                className="text-4xl md:text-5xl font-bold text-primary"
              />
              <div className="text-sm text-muted-foreground mt-3">
                Workshops
              </div>
            </div>
            <div className="text-center p-6 rounded-lg bg-background/50 backdrop-blur-sm hover:bg-background/80 transition-colors duration-300">
              <AnimatedStat
                end={10}
                suffix="+"
                className="text-4xl md:text-5xl font-bold text-primary"
              />
              <div className="text-sm text-muted-foreground mt-3">
                Years of Excellence
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Words from Our Moderators Section */}
      <section className="w-full py-16 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="text-center space-y-6">
            <h2 className="text-3xl font-bold tracking-tighter md:text-4xl lg:text-5xl">
              Messages from Our Moderators
            </h2>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-lg">
              Inspiring messages from our faculty moderators who guide and shape our journey
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-16">
            <Card className="hover:shadow-lg transition-shadow duration-300 border-primary/10">
              <CardContent className="p-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <Avatar className="w-20 h-20">
                    <AvatarImage src="/executives/monirul.cse.png" alt="Md. Monirul Islam" />
                    <AvatarFallback>MI</AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold text-lg">Md. Monirul Islam</h3>
                    <p className="text-sm text-muted-foreground">Assistant Professor</p>
                  </div>
                  <blockquote className="text-sm text-muted-foreground italic">
                    "GUCC has been a cornerstone in shaping the future of our CSE students. Through this platform, we witness remarkable growth in leadership, technical skills, and collaborative spirit among our members."
                  </blockquote>
                </div>
              </CardContent>
            </Card>
            
            <Card className="hover:shadow-lg transition-shadow duration-300 border-primary/10">
              <CardContent className="p-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <Avatar className="w-20 h-20">
                    <AvatarImage src="/executives/feroza.png" alt="Feroza Naznin" />
                    <AvatarFallback>JT</AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold text-lg">Feroza Naznin</h3>
                    <p className="text-sm text-muted-foreground">Deputy Moderator</p>
                  </div>
                  <blockquote className="text-sm text-muted-foreground italic">
                    "The dedication and enthusiasm of GUCC members never ceases to amaze me. This club serves as a bridge between academic learning and real-world application, fostering innovation and creativity."
                  </blockquote>
                </div>
              </CardContent>
            </Card>
            
            <Card className="hover:shadow-lg transition-shadow duration-300 border-primary/10">
              <CardContent className="p-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <Avatar className="w-20 h-20">
                    <AvatarImage src="/executives/montaser.cse.png" alt="Montaser Abdul Quader" />
                    <AvatarFallback>MQ</AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold text-lg">Montaser Abdul Quader</h3>
                    <p className="text-sm text-muted-foreground">Deputy Moderator</p>
                  </div>
                  <blockquote className="text-sm text-muted-foreground italic">
                    "GUCC represents the spirit of excellence and collaboration. It's inspiring to see how our students transform challenges into opportunities, building a stronger tech community for tomorrow."
                  </blockquote>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Club Collaborations Scroll Section */}
      <CollaborationScroll />

      {/* Featured Events Section */}
      <section className="w-full">
        <div className="container px-6">
          <div className="flex flex-col items-center justify-center space-y-6 text-center">
            <div className="space-y-4">
              <h2 className="text-3xl mt-12 font-bold tracking-tighter md:text-4xl lg:text-5xl">
                Recent and Upcoming Events
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-12">
            {eventsData
              .sort(
                (a, b) =>
                  new Date(b.date).getTime() - new Date(a.date).getTime()
              )
              .slice(0, 6)
              .map((event, index) => (
                <EventCard key={index} event={event} index={index} />
              ))}
          </div>
        </div>
      </section>

      <div className="flex justify-center m-12">
        <Button
          asChild
          variant="outline"
          className="border-primary/20 hover:bg-primary/10"
        >
          <Link href="/events">View All Events</Link>
        </Button>
      </div>
    </div>
  );
}
