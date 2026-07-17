import type { ElementType } from "react";
import {
  Trophy,
  Medal,
  Award,
  Calendar,
  Users,
  Megaphone,
  Mail,
  Phone,
  Sparkles,
  Shirt,
  Utensils,
  Gift,
  Server,
  CheckCircle2,
  Code2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import sponsorData from "@/data/sponsors.json";

interface Package {
  tier: string;
  slots: number;
  price: number;
  currency: string;
  highlight: boolean;
  benefits: string[];
}

const TIER_STYLES: Record<
  string,
  {
    icon: ElementType;
    ring: string;
    badge: string;
    glow: string;
    label: string;
  }
> = {
  "Gold Sponsor": {
    icon: Trophy,
    ring: "border-amber-400/60 dark:border-amber-500/40",
    badge: "bg-amber-400 text-amber-950 hover:bg-amber-400",
    glow: "from-amber-400/15 via-amber-300/5 to-transparent",
    label: "text-amber-600 dark:text-amber-400",
  },
  "Silver Sponsor": {
    icon: Medal,
    ring: "border-slate-400/50 dark:border-slate-400/30",
    badge: "bg-slate-300 text-slate-900 hover:bg-slate-300",
    glow: "from-slate-300/15 via-slate-200/5 to-transparent",
    label: "text-slate-500 dark:text-slate-300",
  },
  "Bronze Sponsor": {
    icon: Award,
    ring: "border-orange-400/40 dark:border-orange-500/30",
    badge: "bg-orange-300 text-orange-950 hover:bg-orange-300",
    glow: "from-orange-400/15 via-orange-300/5 to-transparent",
    label: "text-orange-600 dark:text-orange-400",
  },
};

const OPPORTUNITY_ICONS: Record<string, ElementType> = {
  "T-Shirt Partner": Shirt,
  "Food & Beverage Partner": Utensils,
  "Gift & Award Partner": Gift,
  "Platform / Server Partner": Server,
};

function formatBDT(amount: number) {
  return new Intl.NumberFormat("en-BD").format(amount);
}

export default function SponsorsPage() {
  const { event, about, achievements, schedule, previousPartners, whySponsor, packages, otherOpportunities, contacts } =
    sponsorData as {
      event: typeof sponsorData.event;
      about: typeof sponsorData.about;
      achievements: typeof sponsorData.achievements;
      schedule: typeof sponsorData.schedule;
      previousPartners: string[];
      whySponsor: string;
      packages: Package[];
      otherOpportunities: typeof sponsorData.otherOpportunities;
      contacts: typeof sponsorData.contacts;
    };

  return (
    <div className="relative overflow-hidden">
      {/* ---------- Hero ---------- */}
      <section className="relative py-24 sm:py-28">
        <div className="absolute inset-0 bg-gradient-to-b from-green-50 via-background to-background dark:from-green-950/30 dark:via-background dark:to-background" />
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-green-500/10 rounded-full blur-3xl" />
        <div className="absolute top-10 right-0 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl" />

        <div className="container relative mx-auto px-4 text-center max-w-4xl">
          <Badge
            variant="outline"
            className="mb-6 px-4 py-1.5 rounded-full bg-green-50/60 dark:bg-green-950/30 border-green-200 dark:border-green-800"
          >
            <Code2 className="w-3.5 h-3.5 mr-1.5" />
            {event.organizer}
          </Badge>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
            <span className="bg-gradient-to-r from-green-600 via-green-500 to-emerald-500 bg-clip-text text-transparent">
              {event.name}
            </span>
          </h1>

          <p className="mt-4 text-lg text-muted-foreground uppercase tracking-[0.2em] text-sm font-medium">
            {event.tagline}
          </p>

          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Partner with Bangladesh&apos;s next generation of problem-solvers.
            Put your brand in front of 7,000+ engaged, technically sharp students.
          </p>

          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Button size="lg" className="rounded-xl px-8" asChild>
              <a href="#packages">View Sponsorship Packages</a>
            </Button>
            <Button size="lg" variant="outline" className="rounded-xl px-8" asChild>
              <a href="#contact">Contact the Team</a>
            </Button>
          </div>
        </div>
      </section>

      {/* ---------- About ---------- */}
      <section className="container mx-auto px-4 py-16 max-w-5xl">
        <div className="grid md:grid-cols-2 gap-8">
          <Card className="border-green-200/60 dark:border-green-900/50">
            <CardHeader>
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="w-5 h-5" />
                <h2 className="font-semibold text-lg">About the Events</h2>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed text-sm">
                {about.eventDescription}
              </p>
            </CardContent>
          </Card>
          <Card className="border-green-200/60 dark:border-green-900/50">
            <CardHeader>
              <div className="flex items-center gap-2 text-primary">
                <Users className="w-5 h-5" />
                <h2 className="font-semibold text-lg">About GUCC</h2>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed text-sm">
                {about.clubDescription}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ---------- Achievements ---------- */}
      <section className="bg-muted/30 py-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2">
            Our Achievements
          </h2>
          <p className="text-center text-muted-foreground mb-10">
            A track record that speaks for itself
          </p>
          <div className="grid sm:grid-cols-2 gap-5">
            {achievements.map((a) => (
              <div
                key={a.title}
                className="flex gap-4 p-5 rounded-xl bg-background border border-border/60"
              >
                <Trophy className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">{a.title}</p>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    {a.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Schedule ---------- */}
      <section className="container mx-auto px-4 py-16 max-w-3xl">
        <div className="flex items-center justify-center gap-2 mb-10">
          <Calendar className="w-5 h-5 text-primary" />
          <h2 className="text-2xl sm:text-3xl font-bold">Program Schedule</h2>
        </div>
        <ol className="relative border-l border-border ml-3">
          {schedule.map((s, i) => (
            <li key={s.label} className="mb-8 ml-6 last:mb-0">
              <span className="absolute -left-[9px] flex items-center justify-center w-4 h-4 rounded-full bg-primary" />
              <p className="text-xs font-medium text-primary uppercase tracking-wide">
                Step {i + 1}
              </p>
              <p className="font-semibold">{s.label}</p>
              <p className="text-sm text-muted-foreground">{s.date}, 2026</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- Why Sponsor ---------- */}
      <section className="py-16 bg-gradient-to-br from-green-600 to-emerald-600 text-white">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <Megaphone className="w-8 h-8 mx-auto mb-4 opacity-90" />
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">Why Sponsor Us</h2>
          <p className="leading-relaxed text-green-50/95 text-sm sm:text-base">
            {whySponsor}
          </p>
        </div>
      </section>

      {/* ---------- Packages ---------- */}
      <section id="packages" className="container mx-auto px-4 py-20 max-w-6xl">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2">
          Sponsorship Packages
        </h2>
        <p className="text-center text-muted-foreground mb-12">
          Choose the tier that fits your brand&apos;s ambitions
        </p>

        <div className="grid md:grid-cols-3 gap-6 items-start">
          {packages.map((pkg) => {
            const style = TIER_STYLES[pkg.tier];
            const Icon = style?.icon ?? Award;
            return (
              <Card
                key={pkg.tier}
                className={`relative overflow-hidden border-2 ${style?.ring} ${
                  pkg.highlight ? "md:-translate-y-3 shadow-lg" : "shadow-sm"
                }`}
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-b ${style?.glow} pointer-events-none`}
                />
                {pkg.highlight && (
                  <Badge className="absolute top-4 right-4 bg-primary text-primary-foreground">
                    Most Prestige
                  </Badge>
                )}
                <CardHeader className="relative">
                  <Icon className={`w-8 h-8 mb-2 ${style?.label}`} />
                  <p className={`text-xs font-semibold uppercase tracking-wide ${style?.label}`}>
                    Only {pkg.slots} slot{pkg.slots > 1 ? "s" : ""} available
                  </p>
                  <h3 className="text-xl font-bold">{pkg.tier}</h3>
                  <p className="text-3xl font-bold mt-1">
                    ৳{formatBDT(pkg.price)}
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}
                      {pkg.currency}
                    </span>
                  </p>
                </CardHeader>
                <CardContent className="relative">
                  <ul className="space-y-3">
                    {pkg.benefits.map((b) => (
                      <li key={b} className="flex gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{b}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full mt-6 rounded-lg"
                    variant={pkg.highlight ? "default" : "outline"}
                    asChild
                  >
                    <a href="#contact">Become a {pkg.tier.split(" ")[0]} Sponsor</a>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ---------- Other Opportunities ---------- */}
      <section className="bg-muted/30 py-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">
            Other Partnership Opportunities
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {otherOpportunities.map((o) => {
              const Icon = OPPORTUNITY_ICONS[o.title] ?? Gift;
              return (
                <div
                  key={o.title}
                  className="p-5 rounded-xl bg-background border border-border/60 text-center hover:border-primary/50 transition-colors"
                >
                  <Icon className="w-6 h-6 mx-auto mb-3 text-primary" />
                  <p className="font-semibold text-sm">{o.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{o.detail}</p>
                </div>
              );
            })}
          </div>
          <p className="text-center text-sm text-muted-foreground mt-8 max-w-xl mx-auto">
            Join hands with us in empowering the next generation of software
            engineers — explore exclusive partnership options to make an impact
            on campus and beyond.
          </p>
        </div>
      </section>

      {/* ---------- Previous Partners ---------- */}
      <section className="container mx-auto px-4 py-16 max-w-5xl">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">
          Our Previous Sponsoring Partners
        </h2>
        <div className="flex flex-wrap justify-center gap-3">
          {previousPartners.map((p) => (
            <span
              key={p}
              className="px-4 py-2 rounded-full border border-border/60 bg-background text-sm text-muted-foreground"
            >
              {p}
            </span>
          ))}
        </div>
      </section>

      {/* ---------- Contact ---------- */}
      <section id="contact" className="container mx-auto px-4 py-20 max-w-4xl">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2">
          Get in Touch
        </h2>
        <p className="text-center text-muted-foreground mb-10">
          Ready to partner with us? Reach out directly.
        </p>
        <div className="grid sm:grid-cols-2 gap-6">
          {contacts.map((c) => (
            <Card key={c.name} className="border-green-200/60 dark:border-green-900/50">
              <CardContent className="pt-6">
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-muted-foreground mb-4">{c.role}</p>
                <div className="space-y-2 text-sm">
                  <a
                    href={`tel:${c.phone.replace(/\s/g, "")}`}
                    className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Phone className="w-4 h-4" /> {c.phone}
                  </a>
                  <a
                    href={`mailto:${c.email}`}
                    className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Mail className="w-4 h-4" /> {c.email}
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
