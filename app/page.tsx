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
import { Award, BookOpen, CalendarDays, Users, Clock, Trophy, Zap, ExternalLink } from "lucide-react";
import Link from "next/link";
import { AnimatedStat } from "./component";
import { CollaborationScroll } from "./components/collaboration-scroll";
import { EventCard } from "./events/components";
import HackathonActions from "@/components/HackathonActions";

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

      {/* Hackathon Announcement Section */}
      <section className="w-full py-16 md:py-24 lg:py-32 bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:from-green-950/20 dark:via-emerald-950/20 dark:to-teal-950/20">
        <div className="container px-4 md:px-6">
          <div className="text-center space-y-6 mb-12">
            <div className="inline-flex items-center gap-2 rounded-full bg-green-100 dark:bg-green-900/50 px-4 py-2 text-sm font-medium text-green-700 dark:text-green-300">
              <Trophy className="h-4 w-4" />
              Organized by GUCC
            </div>
            <h2 className="text-3xl font-bold tracking-tighter md:text-4xl lg:text-5xl text-green-800 dark:text-green-200">
              🚀 Hack The AI - Inter University Hackathon
            </h2>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-lg">
              Join us in this exciting hackathon organized by Green University Computer Club. 
              Build innovative AI solutions and compete with the brightest minds from universities across the country!
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Announcement Card */}
            <div className="lg:col-span-2">
              <Card className="h-full bg-gradient-to-br from-green-600 to-emerald-600 text-white border-0 shadow-2xl hover:shadow-3xl transition-all duration-300 transform hover:-translate-y-1">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-2xl md:text-3xl font-bold flex items-center gap-3">
                      <Zap className="h-8 w-8" />
                      Deadline Extended!
                    </CardTitle>
                    <div className="bg-white/20 backdrop-blur-sm rounded-full px-3 py-1 text-sm font-semibold">
                      NEW
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 text-lg">
                      <Clock className="h-6 w-6 text-green-200" />
                      <span className="font-semibold">
                        Registration extended to September 13th, 2025 at 8:00 PM
                      </span>
                    </div>
                    <p className="text-green-100 leading-relaxed">
                      We've extended the deadline to give more talented students the opportunity to participate in this 
                      prestigious hackathon. Don't miss your chance to showcase your AI skills and win amazing prizes!
                    </p>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3 pt-4">
                    <Button
                      asChild
                      className="flex-1 bg-white text-green-600 hover:bg-green-50 font-semibold py-3 shadow-lg hover:shadow-xl transition-all duration-200"
                    >
                      <Link 
                        href="https://forms.gle/QvzXYQ3hdAHPkkWVA" 
                        target="_blank"
                        className="flex items-center justify-center gap-2"
                      >
                        Register Now
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                    <HackathonActions />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Side Information Cards */}
            <div className="space-y-6">
              {/* Event Details Card */}
              <Card className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-green-200 dark:border-green-800 hover:shadow-lg transition-all duration-300">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-bold text-green-700 dark:text-green-300 flex items-center gap-2">
                    <CalendarDays className="h-5 w-5" />
                    Event Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Event Type:</span>
                      <span className="font-semibold">AI Hackathon</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Scope:</span>
                      <span className="font-semibold">Inter University</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Organized by:</span>
                      <span className="font-semibold text-green-600 dark:text-green-400">GUCC</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Registration:</span>
                      <span className="font-semibold text-orange-600">Till Sept 13, 8PM</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Why Participate Card */}
              <Card className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-green-200 dark:border-green-800 hover:shadow-lg transition-all duration-300">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-bold text-green-700 dark:text-green-300 flex items-center gap-2">
                    <Trophy className="h-5 w-5" />
                    Why Participate?
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                      <span>Compete with top universities</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                      <span>Build innovative AI solutions</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                      <span>Win amazing prizes</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                      <span>Network with industry experts</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                      <span>Gain valuable experience</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

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


      {/* Messages from Our Chairperson Section */}
      <section className="w-full py-12 md:py-16 lg:py-20">
        <div className="container px-4 md:px-6">
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-bold tracking-tighter md:text-4xl lg:text-5xl">
              Messages from Our Chairperson
            </h2>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-lg">
              A message from the Chairperson of the Department of CSE
            </p>
          </div>
          <div className="flex justify-center mt-10">
            <Card className="hover:shadow-lg transition-shadow duration-300 border-primary/10 max-w-xl w-full">
              <CardContent className="p-5 flex flex-col items-center text-center space-y-3">
                <Avatar className="w-20 h-20">
                  <AvatarImage src="/executives/mahabib.cse.png" alt="Professor Dr. Md. Ahsan Habib" />
                  <AvatarFallback>AR</AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <h3 className="font-semibold text-lg">Professor Dr. Md. Ahsan Habib</h3>
                  <p className="text-sm text-muted-foreground">Chairperson, Department of CSE</p>
                </div>
                <blockquote className="text-sm text-muted-foreground italic leading-relaxed">
                  "It gives me great pride to see the Green University Computer Club (GUCC) flourishing as a platform for student innovation, leadership, and collaboration. GUCC is more than just a club — it's a space where ideas come to life, where students learn by doing, and where futures are shaped through teamwork and creativity. I wholeheartedly support the club's mission and encourage every student to take part in this journey of growth and excellence."
                </blockquote>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Messages from Our Moderators Section */}
      <section className="w-full py-12 md:py-16 lg:py-20">
        <div className="container px-4 md:px-6">
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-bold tracking-tighter md:text-4xl lg:text-5xl">
              Messages from Our Moderators
            </h2>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-lg">
              Inspiring messages from our faculty moderators who guide and shape our journey
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
            <Card className="hover:shadow-lg transition-shadow duration-300 border-primary/10">
              <CardContent className="p-5">
                <div className="flex flex-col items-center text-center space-y-3">
                  <Avatar className="w-16 h-16">
                    <AvatarImage src="/executives/monirul.cse.png" alt="Md. Monirul Islam" />
                    <AvatarFallback>MI</AvatarFallback>
                  </Avatar>
                  <div className="space-y-1">
                    <h3 className="font-semibold">Md. Monirul Islam</h3>
                    <p className="text-xs text-muted-foreground">Assistant Professor & Moderator, GUCC</p>
                  </div>
                  <blockquote className="text-xs text-muted-foreground italic leading-relaxed">
                    "At GUCC, we witness remarkable growth in our CSE students — not just in technical expertise, but also in leadership and teamwork. This platform has become a cornerstone for empowering the next generation of tech leaders."
                  </blockquote>
                </div>
              </CardContent>
            </Card>
            
            <Card className="hover:shadow-lg transition-shadow duration-300 border-primary/10">
              <CardContent className="p-5">
                <div className="flex flex-col items-center text-center space-y-3">
                  <Avatar className="w-16 h-16">
                    <AvatarImage src="/executives/feroza.png" alt="Feroza Naznin" />
                    <AvatarFallback>FN</AvatarFallback>
                  </Avatar>
                  <div className="space-y-1">
                    <h3 className="font-semibold">Feroza Naznin</h3>
                    <p className="text-xs text-muted-foreground">Deputy Moderator, GUCC</p>
                  </div>
                  <blockquote className="text-xs text-muted-foreground italic leading-relaxed">
                    "The energy and dedication our members bring to GUCC is truly inspiring. By bridging academic knowledge with real-world innovation, this club continues to nurture creativity, confidence, and community."
                  </blockquote>
                </div>
              </CardContent>
            </Card>
            
            <Card className="hover:shadow-lg transition-shadow duration-300 border-primary/10">
              <CardContent className="p-5">
                <div className="flex flex-col items-center text-center space-y-3">
                  <Avatar className="w-16 h-16">
                    <AvatarImage src="/executives/montaser.cse.png" alt="Montaser Abdul Quader" />
                    <AvatarFallback>MQ</AvatarFallback>
                  </Avatar>
                  <div className="space-y-1">
                    <h3 className="font-semibold">Montaser Abdul Quader</h3>
                    <p className="text-xs text-muted-foreground">Deputy Moderator, GUCC</p>
                  </div>
                  <blockquote className="text-xs text-muted-foreground italic leading-relaxed">
                    "GUCC embodies the spirit of collaboration and continuous improvement. It's a pleasure to watch our students take on challenges and transform them into meaningful impact, building a stronger tech future."
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
