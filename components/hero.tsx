import { ArrowRight, Calendar, Code } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import Link from "next/link";
import { AnimatedBackground } from "./animated-background";
import { TiltShapes } from "./tilt-shapes";

export const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden -mt-[50px]">
      <AnimatedBackground />
      
      {/* Enhanced gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-green-50/60 via-background/60 to-green-50/20 dark:from-green-950/40 dark:via-background/80 dark:to-green-950/20" />
      
      {/* Enhanced floating orbs */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-10 w-72 h-72 bg-green-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-green-400/5 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/4 w-48 h-48 bg-blue-500/5 rounded-full blur-2xl animate-pulse delay-500" />
        <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-purple-500/5 rounded-full blur-2xl animate-pulse delay-1500" />
      </div>

      {/* Floating geometric shapes with tilt effect */}
      <TiltShapes />

      <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="space-y-4">
            <Badge
              variant="outline"
              className="px-4 py-2 rounded-full text-sm font-medium bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800 backdrop-blur-sm"
            >
              <Code className="w-4 h-4 mr-2" />
              Empowering Future Technologists
            </Badge>

            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-green-600 via-green-500 to-green-400 bg-clip-text text-transparent animate-pulse">
                Green University
              </span>
              <br />
              <span className="text-[60px] text-foreground">Computer Club</span>
            </h1>

            <p className="text-xl sm:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Empowering students to excel in the world of technology through
              innovation, collaboration, and continuous learning.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/executives">
              <Button
                size="lg"
                className="bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white px-8 py-6 text-lg rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 group transform hover:scale-105"
              >
                Our Community
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform duration-200" />
              </Button>
            </Link>
            <Link href="/events">
              <Button
                variant="outline"
                size="lg"
                className="px-8 py-6 text-lg rounded-xl border-2 hover:bg-accent transition-all duration-300 transform hover:scale-105 backdrop-blur-sm"
              >
                Explore Events
                <Calendar className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-muted-foreground/30 rounded-full flex justify-center">
          <div className="w-1 h-3 bg-muted-foreground/50 rounded-full mt-2 animate-pulse"></div>
        </div>
      </div>
    </section>
  );
};
