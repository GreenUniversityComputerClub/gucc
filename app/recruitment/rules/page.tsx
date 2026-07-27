"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  BookOpen,
  Shield,
  Users,
  FileText,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// ─── Teal tokens (shared with recruitment page) ──────────────────────────────

const TEAL = {
  text: "text-[#006380] dark:text-[#5ec4db]",
  border: "border-[#006380] dark:border-[#5ec4db]",
  bgSubtle: "bg-[#006380]/5 dark:bg-[#5ec4db]/10",
  bgIcon: "bg-[#006380]/10 dark:bg-[#5ec4db]/15",
  link: "text-[#006380] dark:text-[#5ec4db] hover:text-[#007a99] dark:hover:text-[#7dd3e8]",
  btnBg:
    "bg-[#006380] hover:bg-[#005566] dark:bg-[#1a8fa8] dark:hover:bg-[#157d94]",
  deadlineBg:
    "bg-[#006380]/5 dark:bg-[#5ec4db]/10 border-[#006380]/20 dark:border-[#5ec4db]/20",
} as const;

// ─── Position data ───────────────────────────────────────────────────────────

interface PositionRequirement {
  code: string;
  title: string;
  count?: number;
  requirements: string[];
}

const POSITIONS: PositionRequirement[] = [
  {
    code: "EP-01",
    title: "President",
    requirements: [
      "Must have completed a minimum of 90 credits and remain a valid student for at least Three (3) semesters.",
      "Experience in organizing large-scale events of any organization is preferable.",
      "Must demonstrate strong communication, decision-making, and conflict-resolution skills to represent GUCC effectively.",
      "Should be capable of strategic planning, resource management, and strengthening teamwork to achieve GUCC's goals.",
      "Must balance academic responsibilities and leadership duties while maintaining professionalism and ethical standards.",
      "Should build partnerships with industry, organizations, and alumni while ensuring transparency in all GUCC activities.",
    ],
  },
  {
    code: "EP-02",
    title: "Vice-President",
    requirements: [
      "Must have completed a minimum of 75 credits and remain a valid student for at least Three (3) semesters.",
      "Experience in organizing large-scale events of any organization is preferable.",
      "Should excel in supporting the President by overseeing day-to-day operations and ensuring the smooth execution of planned activities.",
      "Must act as a liaison between the President and team members, ensuring effective communication and follow-up on assigned tasks.",
    ],
  },
  {
    code: "EP-03",
    title: "General Secretary",
    requirements: [
      "Must have completed a minimum of 75 credits and remain a valid student for at least Three (3) semesters.",
      "Experience at a key position, in any organization, with a proven ability to manage documentation and communication effectively is preferable.",
      "Should possess excellent organizational and multitasking skills to oversee administrative tasks and ensure the smooth functioning of GUCC.",
      "Ensure timely coordination of all activities, including event planning, team updates, and follow-ups.",
      "Must be committed to maintaining proper records and archives of GUCC events, decisions, and financial transactions.",
      "Should act as the primary point of contact for internal and external communications regarding GUCC activities.",
    ],
  },
  {
    code: "EP-04",
    title: "Joint General Secretary",
    requirements: [
      "Must have completed a minimum of 60 credits and remain a valid student for at least Four (4) semesters.",
      "Prior involvement in any organization, with a strong understanding of administrative tasks and event coordination is preferable.",
      "Must assist the General Secretary in managing official documentation, correspondence, and record-keeping.",
      "Must take the lead in specific tasks or events as delegated by the General Secretary, ensuring timely completion.",
    ],
  },
  {
    code: "EP-05",
    title: "Treasurer",
    requirements: [
      "Must have completed a minimum of 75 credits and remain a valid student for at least Three (3) semesters.",
      "Prior experience managing financial responsibilities in any organization is a plus.",
      "Should demonstrate strong skills in budgeting, expense tracking, and financial reporting to ensure transparency in all financial matters.",
      "Must oversee the collection, management, and disbursement of funds for events and activities, ensuring proper authorization and record-keeping.",
      "Must ensure all transactions comply with GUCC policies and are supported by proper documentation.",
    ],
  },
  {
    code: "EP-06",
    title: "Organizing Secretary",
    requirements: [
      "Must have completed a minimum of 60 credits and remain a valid student for at least Four (4) semesters.",
      "Prior experience in organizing events, programs, or competitions of any organization is highly preferred.",
      "Must be capable of leading teams, delegating tasks, and ensuring smooth coordination among committees.",
      "Ensure all logistical arrangements, including venue, equipment, and resources, are handled efficiently.",
      "Must maintain a detailed schedule of events and provide regular updates to the executive committee.",
    ],
  },
  {
    code: "EP-07",
    title: "Joint Organizing Secretary",
    requirements: [
      "Must have completed a minimum of 45 credits and remain a valid student for at least Five (5) semesters.",
      "Prior involvement in event management or organizational tasks in any organization is a plus.",
      "Must assist the Organizing Secretary in planning, organizing, and executing events and activities.",
      "Should take responsibility for specific aspects of event planning as assigned by the Organizing Secretary.",
    ],
  },
  {
    code: "EP-08",
    title: "Event Coordinator",
    requirements: [
      "Must have completed a minimum of 60 credits and remain a valid student for at least Four (4) semesters.",
      "Proven track record of managing or assisting in the successful execution of events of any organization is preferable.",
      "Must handle on-the-ground event operations, ensuring smooth execution of activities during the event.",
      "Should coordinate with the Organizing Secretary and team members to address last-minute changes or issues effectively.",
    ],
  },
  {
    code: "EP-09",
    title: "Programming Secretary",
    requirements: [
      "Remain a valid student for at least Four (4) semesters.",
      "Minimum 900+ Rating in Codeforces: Candidate should have achieved a rating of at least 900+ in Codeforces contests.",
      "Minimum 150+ Problems Solved on Any Platform: Candidate must have solved at least 150+ problems across any competitive programming platforms.",
      "Ability to Handle Live Contests: The candidate should have experience in handling live contests, including time management, coordination, and troubleshooting during the event.",
      "Idea about Problem Setting: Candidate should have an understanding of how to set problems for competitive programming contests, including designing problems that are fair, challenging, and solvable within a given time frame.",
    ],
  },
  {
    code: "EP-10",
    title: "Information Secretary",
    requirements: [
      "Must have completed a minimum of 60 credits and remain a valid student for at least Four (4) semesters.",
      "Must have prior experience in managing social media platforms or creating digital content for any organization is preferable.",
      "Must be highly active and agile, ensuring timely dissemination of information about GUCC events, announcements, and achievements.",
      "Must ensure all content aligns with GUCC's vision and maintains a professional and consistent tone across platforms.",
      "Should be proactive in monitoring social media engagement, responding to queries, and addressing issues promptly.",
    ],
  },
  {
    code: "EP-11",
    title: "Joint Information Secretary",
    requirements: [
      "Must have completed a minimum of 30 credits and remain a valid student for at least Five (5) semesters.",
      "Experience in assisting with social media management or digital content creation for any organizations is a plus.",
      "Must actively support the Information Secretary in planning, designing, and posting content across all social media platforms.",
      "Should take initiative in creating innovative content ideas and maintaining consistent activity on social media to promote GUCC effectively.",
    ],
  },
  {
    code: "EP-12",
    title: "Outreach Secretary",
    requirements: [
      "Must have completed a minimum of 60 credits and remain a valid student for at least Four (4) semesters.",
      "Strong communication and networking skills.",
      "Ability to build and maintain partnerships.",
      "Represent GUCC in meetings and collaborations at both national and international levels.",
      "Maintain a strong network with other public and private university computer clubs.",
      "Experience in organizing quiz sessions with school or college students is preferred.",
      "Proficiency in handling social media platforms such as Facebook, YouTube, LinkedIn, Instagram, etc., is a plus.",
    ],
  },
  {
    code: "EP-13",
    title: "Publication Secretary",
    requirements: [
      "Must have completed a minimum of 60 credits and remain a valid student for at least Four (4) semesters.",
      "Having prior experience in managing official communication or publications of any organization is a plus.",
      "Should demonstrate excellent writing and editing skills to prepare official announcements, newsletters, and other communication materials.",
      "Must maintain smooth and professional communication with the Department of CSE Coordination Office, ensuring accuracy and timeliness.",
    ],
  },
  {
    code: "EP-14",
    title: "Joint Publication Secretary",
    requirements: [
      "Must have completed a minimum of 30 credits and remain a valid student for at least Five (5) semesters.",
      "Experience in assisting with publications or managing communication tasks in any organization is a plus.",
      "Must actively support the Publication Secretary in preparing content for official publications and maintaining departmental social media platforms.",
      "Must act as a liaison between GUCC and the Department of CSE Coordination Office to ensure smooth information flow.",
    ],
  },
  {
    code: "EP-15",
    title: "Cultural Secretary",
    requirements: [
      "Must have completed a minimum of 45 credits and remain a valid student for at least Four (4) semesters.",
      "Must have prior experience organizing cultural events or activities in any organization.",
      "Possessing skills in dancing, singing, painting, acting, or other cultural arts, and anchoring is a plus.",
      "Should demonstrate strong leadership and creativity to plan, coordinate, and execute cultural programs effectively.",
      "Must establish and maintain connections with performers, participants, and external cultural organizations.",
    ],
  },
  {
    code: "EP-16",
    title: "Graphics and Multimedia Coordinators",
    count: 3,
    requirements: [
      "Must have completed a minimum of 30 credits and remain a valid student for at least Five (5) semesters.",
      "Proficiency in Adobe Illustrator and Adobe Photoshop is a must.",
      "Familiarity with Canva design is a plus.",
      "Must be responsible for designing banners, posters, certificates, and event-related materials while ensuring consistency with GUCC branding guidelines.",
      "Should manage multimedia content creation for GUCC events, including photo and video documentation and post-event highlights.",
      "Must work closely with the Information Secretary and other members to ensure timely delivery of creative assets.",
    ],
  },
  {
    code: "EP-17",
    title: "Photography Secretary",
    requirements: [
      "Must have completed a minimum of 30 credits and remain a valid student for at least Five (5) semesters.",
      "Must own a professional camera along with all necessary equipment.",
      "Must have proven expertise in photography, with prior experience capturing high-quality images for events or organizations.",
      "Must collaborate with the Graphics and Multimedia team to ensure visuals meet GUCC branding and quality standards.",
    ],
  },
  {
    code: "EP-18",
    title: "Photo and Video Editor",
    requirements: [
      "Must have completed a minimum of 30 credits and remain a valid student for at least Five (5) semesters.",
      "Must have advanced proficiency in photo and video editing software such as Adobe Photoshop, Lightroom, Premiere Pro, or equivalent tools.",
      "Should be responsible for editing and enhancing photos and videos captured during GUCC events to meet professional standards.",
      "Must ensure timely delivery of edited visuals for use in social media, publications, and other GUCC platforms while maintaining the organization's branding guidelines.",
    ],
  },
  {
    code: "EP-19",
    title: "Sports Secretary",
    requirements: [
      "Must have completed a minimum of 60 credits and remain a valid student for at least Five (5) semesters.",
      "Must have experience in organizing and managing sports events or activities in any organization.",
      "Must be proactive in managing logistics for sports activities, including booking venues, arranging equipment, and recruiting participants.",
      "Must promote sports culture within GUCC by encouraging participation and creating opportunities for members to engage in various sports.",
    ],
  },
  {
    code: "EP-20",
    title: "Executive Members",
    count: 4,
    requirements: [
      "Must have completed a minimum of 15 credits.",
      "Must be proactive, dedicated, and willing to take on various responsibilities as assigned by the executive committee.",
      "Should have a strong work ethic, attention to detail, and the ability to collaborate effectively with other committee members.",
      "Should be reliable and punctual in attending meetings, events, and completing assigned tasks on time.",
    ],
  },
];

const GENERAL_CRITERIA = [
  "Regular and registered students of the Green University are eligible to join GUCC.",
  "If any proctorial proceedings are ongoing against an applicant during the member recruitment period, the applicant shall be ineligible to serve as an Executive Committee Member of GUCC.",
  "Any applicant who has dropped more than Two Semesters for any kind of reason will not be eligible to be an Executive Committee Member of GUCC.",
  "Must be proactive and dedicated to performing assigned responsibilities with utmost dedication and determination.",
  "Applicants who currently hold positions in any other club, branch, society, chapter or wing are eligible to apply. However, if selected for the GUCC Executive Committee 2026\u201327, they must resign from their current position (if selected among the Top 6 positions in GUCC) and submit a written release letter approved by their organization\u2019s moderator or mentor within three (03) days of the publication of the final GUCC Executive Committee list. Failure to comply within the specified time will result in the cancellation of their selection, and the next eligible candidate will be appointed.",
  "All applicants must meet the General Eligibility Criteria mentioned above to be eligible to apply.",
];

// ─── Animated section wrapper ────────────────────────────────────────────────

function AnimatedSection({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.05, rootMargin: "0px 0px 40px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`will-change-[transform,opacity] transition-all duration-500 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// ─── Collapsible position card ───────────────────────────────────────────────

function PositionCard({
  position,
  index,
}: {
  position: PositionRequirement;
  index: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <AnimatedSection delay={Math.min(index * 30, 200)}>
      <Card className="overflow-hidden shadow-sm transition-shadow duration-200 hover:shadow-md">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/40 sm:px-5 sm:py-4"
          aria-expanded={open}
        >
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white sm:h-9 sm:w-9 sm:text-sm ${TEAL.btnBg}`}
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground sm:text-base">
              {position.code}: {position.title}
              {position.count && position.count > 1 && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  ({position.count} positions)
                </span>
              )}
            </p>
          </div>
          <div
            className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          >
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>

        {open && (
          <div className="border-t border-border/50 px-4 pb-4 pt-3 sm:px-5 animate-in fade-in-0 slide-in-from-top-1 duration-200">
            <ul className="space-y-2">
              {position.requirements.map((req, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 text-[13px] leading-relaxed text-muted-foreground sm:text-sm"
                >
                  <ChevronRight
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${TEAL.text}`}
                  />
                  <span>{req}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </AnimatedSection>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function RecruitmentRulesPage() {
  return (
    <div className="min-h-screen bg-linear-to-b from-background to-muted/20 dark:from-background dark:to-background">
      <div className="container mx-auto max-w-[800px] px-3 py-6 sm:px-4 sm:py-10 md:px-6">
        {/* Back link */}
        <AnimatedSection>
          <Link
            href="/recruitment"
            className={`mb-6 inline-flex items-center gap-1.5 text-sm font-medium transition-colors ${TEAL.link}`}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Application Form
          </Link>
        </AnimatedSection>

        {/* ─── Hero ──────────────────────────────────────────────── */}
        <AnimatedSection delay={50}>
          <Card className="mb-6 overflow-hidden shadow-sm sm:mb-8">
            <div className={`border-t-4 ${TEAL.border}`} />
            <CardContent className="px-4 py-6 sm:px-6 sm:py-8">
              <div className="flex items-start gap-3 sm:gap-4">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 ${TEAL.bgIcon}`}
                >
                  <BookOpen className={`h-5 w-5 sm:h-6 sm:w-6 ${TEAL.text}`} />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl font-bold leading-tight text-foreground sm:text-2xl lg:text-[26px]">
                    Eligibility Criteria &amp; Position Requirements
                  </h1>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                    GUCC Executive Committee 2026&ndash;27 &mdash; Complete
                    guidelines for applicants including general eligibility
                    criteria and additional requirements for each executive
                    position.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </AnimatedSection>

        {/* ─── General Eligibility ───────────────────────────────── */}
        <AnimatedSection delay={100}>
          <Card className="mb-6 shadow-sm sm:mb-8">
            <CardContent className="px-4 py-5 sm:px-6 sm:py-6">
              <div className="mb-4 flex items-center gap-2.5">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${TEAL.bgIcon}`}
                >
                  <Shield className={`h-4.5 w-4.5 ${TEAL.text}`} />
                </div>
                <h2 className="text-lg font-bold text-foreground sm:text-xl">
                  General Eligibility Criteria
                </h2>
              </div>

              <p className="mb-4 text-sm text-muted-foreground">
                The eligibility criteria for the application are mentioned
                below:
              </p>

              <ul className="space-y-3">
                {GENERAL_CRITERIA.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 text-[13px] leading-relaxed text-foreground/90 dark:text-foreground/85 sm:text-sm"
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${TEAL.btnBg}`}
                    >
                      {i + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              {/* Important notice */}
              <div
                className={`mt-5 flex items-start gap-2.5 rounded-lg border p-3.5 ${TEAL.deadlineBg}`}
              >
                <AlertTriangle
                  className={`mt-0.5 h-4 w-4 shrink-0 ${TEAL.text}`}
                />
                <p className="text-xs font-medium leading-relaxed text-foreground/85 sm:text-sm">
                  The selection committee reserves all the rights to consider
                  any applicant ineligible for any other factors. All
                  information collected will be kept confidential.
                </p>
              </div>
            </CardContent>
          </Card>
        </AnimatedSection>

        {/* ─── Position Requirements ─────────────────────────────── */}
        <AnimatedSection delay={150}>
          <div className="mb-4 flex items-center gap-2.5 px-1">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${TEAL.bgIcon}`}
            >
              <Users className={`h-4.5 w-4.5 ${TEAL.text}`} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground sm:text-xl">
                Additional Requirements for Each Position
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                Click on a position to view its specific requirements
              </p>
            </div>
          </div>
        </AnimatedSection>

        <div className="space-y-2.5 sm:space-y-3">
          {POSITIONS.map((position, index) => (
            <PositionCard key={position.code} position={position} index={index} />
          ))}
        </div>

        {/* ─── Bottom CTA ────────────────────────────────────────── */}
        <AnimatedSection delay={100} className="mt-8 sm:mt-10">
          <Card className="overflow-hidden shadow-sm">
            <CardContent className="px-4 py-5 sm:px-6 sm:py-6">
              <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TEAL.bgIcon}`}
                >
                  <FileText className={`h-5 w-5 ${TEAL.text}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground sm:text-base">
                    Ready to apply?
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                    Make sure you meet the eligibility criteria before
                    submitting your application.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
                  <Link href="/recruitment">
                    <Button
                      className={`h-10 px-6 text-sm font-medium text-white ${TEAL.btnBg}`}
                    >
                      Apply Now
                    </Button>
                  </Link>
                  <a
                    href="https://drive.google.com/file/d/1VJZBZSLUVl7FFsYLDYZuW1aCPaLAWN2h/view?usp=sharing"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" className="h-10 px-5 text-sm">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Main Circular
                    </Button>
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </AnimatedSection>

        {/* Footer */}
        <div className="mt-6 pb-8 text-center">
          <p className="text-xs text-muted-foreground/50">
            Green University Computer Club (GUCC) &mdash; Department of CSE,
            Green University of Bangladesh
          </p>
        </div>
      </div>
    </div>
  );
}
