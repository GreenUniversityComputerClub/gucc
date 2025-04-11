export interface Collaboration {
  name: string;
  description: string;
  image: string;
  website?: string;
}

export const featuredCollaborations: Collaboration[] = [
  {
    name: "IEEE Computer Society",
    description: "Partnering with IEEE Computer Society for technical workshops and conferences",
    image: "/collaborations/ieee.png",
    website: "https://www.computer.org/"
  },
  {
    name: "Microsoft Learn Student Ambassadors",
    description: "Collaborating with MLSA to bring Microsoft technologies to students",
    image: "/collaborations/mlsa.png",
    website: "https://studentambassadors.microsoft.com/"
  },
  {
    name: "Google Developer Student Clubs",
    description: "Working with GDSC to organize coding bootcamps and hackathons",
    image: "/collaborations/gdsc.png",
    website: "https://developers.google.com/community/gdsc"
  },
  {
    name: "ACM Student Chapter",
    description: "Partnering with ACM for programming contests and tech talks",
    image: "/collaborations/acm.png",
    website: "https://www.acm.org/chapters/students"
  },
  {
    name: "GitHub Campus Program",
    description: "Collaborating with GitHub to provide students with developer tools and resources",
    image: "/collaborations/github.png",
    website: "https://education.github.com/schools"
  },
  {
    name: "Meta Developer Circles",
    description: "Working with Meta to bring social technology innovations to campus",
    image: "/collaborations/meta.png",
    website: "https://developers.facebook.com/developercircles/"
  }
]; 