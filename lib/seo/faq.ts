import {
  getLatestExecutiveYear,
  getYearRoster,
} from "@/app/executives/util";
import { ADDRESS, PARENT_ORGANIZATION, SITE } from "./site";

export interface FaqEntry {
  question: string;
  answer: string;
}

function nameFor(year: string, pattern: RegExp): string | undefined {
  const roster = getYearRoster(year);
  return roster?.studentExecutives.find((person) => pattern.test(person.position))
    ?.name;
}

/**
 * Home-page FAQ. The same array renders the visible section and the FAQPage
 * structured data — Google requires the answers to be on the page, so these
 * must never diverge.
 */
export function getHomeFaq(): FaqEntry[] {
  const year = getLatestExecutiveYear();
  const president = nameFor(year, /^President$/i);
  const generalSecretary = nameFor(year, /^General Secretary$/i);

  const leadership = [
    president && `${president} (President)`,
    generalSecretary && `${generalSecretary} (General Secretary)`,
  ]
    .filter(Boolean)
    .join(" and ");

  return [
    {
      question: "What is the Green University Computer Club (GUCC)?",
      answer:
        "GUCC is the flagship student-run, non-profit and non-political technology club of Green University of Bangladesh, operating in collaboration with the Department of Computer Science and Engineering (CSE). It has more than 7,000 members and exists to help CSE students build careers in modern computer science and engineering.",
    },
    {
      question: `Who are the current GUCC executives (${year})?`,
      answer: leadership
        ? `The ${year} GUCC executive committee is led by ${leadership}, supported by faculty moderators from the Department of CSE and a full panel of student executives. Every executive — current and past — has a profile page under the Executives section of this site.`
        : `The ${year} GUCC executive committee is made up of faculty moderators from the Department of CSE and a full panel of student executives. Every executive — current and past — has a profile page under the Executives section of this site.`,
    },
    {
      question: "How can I join GUCC?",
      answer:
        "GUCC opens executive recruitment periodically for students of Green University of Bangladesh. Recruitment rounds, rules and application forms are published on the Join page of this website and announced on the club's official Facebook page, so check both when a cycle opens.",
    },
    {
      question: "What events does GUCC organise?",
      answer:
        "GUCC runs seminars, workshops, programming contests, hackathons such as HackTheAI, cultural programmes and inter-university collaborations throughout the academic year — around 50 events annually. Past and upcoming events are all listed on the Events page.",
    },
    {
      question: "When was GUCC founded?",
      answer:
        "The Green University Computer Club was founded in 2013 and celebrates GUCC Day on 19 October each year.",
    },
    {
      question: "Where is GUCC located and how do I contact it?",
      answer: `GUCC is based at ${PARENT_ORGANIZATION.name}, ${ADDRESS.full}. You can reach the club at ${SITE.email} or through the contact form on this website.`,
    },
  ];
}
