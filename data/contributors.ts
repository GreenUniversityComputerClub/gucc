export interface Contributor {
  login: string;
  name: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
}

/**
 * GUCC member contributors ordered by GitHub contribution count.
 * Source: https://github.com/GreenUniversityComputerClub/gucc/graphs/contributors
 * Bot accounts (e.g. Copilot) are excluded to spotlight actual club members.
 */
export const STATIC_CONTRIBUTORS: Contributor[] = [
  {
    login: "nurulhudaapon",
    name: "Nurul Huda (Apon)",
    avatar_url: "https://avatars.githubusercontent.com/u/55424194?v=4",
    html_url: "https://github.com/nurulhudaapon",
    contributions: 78,
  },
  {
    login: "BakulBd",
    name: "Bakul Ahmed",
    avatar_url: "https://avatars.githubusercontent.com/u/143816025?v=4",
    html_url: "https://github.com/BakulBd",
    contributions: 47,
  },
  {
    login: "imranonweb",
    name: "Al Imran Emon",
    avatar_url: "https://avatars.githubusercontent.com/u/138112368?v=4",
    html_url: "https://github.com/imranonweb",
    contributions: 25,
  },
  {
    login: "MrMajharul",
    name: "Majharul Islam",
    avatar_url: "https://avatars.githubusercontent.com/u/158082213?v=4",
    html_url: "https://github.com/MrMajharul",
    contributions: 24,
  },
  {
    login: "jawadhossainmahi",
    name: "Jawad Hossain Mahi",
    avatar_url: "https://avatars.githubusercontent.com/u/100514487?v=4",
    html_url: "https://github.com/jawadhossainmahi",
    contributions: 23,
  },
  {
    login: "srtanveer",
    name: "MD Showaib Rahman Tanveer",
    avatar_url: "https://avatars.githubusercontent.com/u/118148681?v=4",
    html_url: "https://github.com/srtanveer",
    contributions: 13,
  },
  {
    login: "ShipluSaha995",
    name: "Shiplu Saha",
    avatar_url: "https://avatars.githubusercontent.com/u/182983099?v=4",
    html_url: "https://github.com/ShipluSaha995",
    contributions: 13,
  },
  {
    login: "Andrew-Velox",
    name: "Mohabbat Marjuk Muttaki",
    avatar_url: "https://avatars.githubusercontent.com/u/99073463?v=4",
    html_url: "https://github.com/Andrew-Velox",
    contributions: 7,
  },
  {
    login: "Sajjad-Mahmud-Suton",
    name: "MD. Sajjad Mahmud Suton",
    avatar_url: "https://avatars.githubusercontent.com/u/152319548?v=4",
    html_url: "https://github.com/Sajjad-Mahmud-Suton",
    contributions: 5,
  },
  {
    login: "itshimelz",
    name: "Rahat Hossain Himel",
    avatar_url: "https://avatars.githubusercontent.com/u/51039076?v=4",
    html_url: "https://github.com/itshimelz",
    contributions: 5,
  },
  {
    login: "mahmudaakternadia",
    name: "Mahmuda Akter Nadia",
    avatar_url: "https://avatars.githubusercontent.com/u/116658441?v=4",
    html_url: "https://github.com/mahmudaakternadia",
    contributions: 5,
  },
  {
    login: "zahinafsar",
    name: "Zahin Afsar",
    avatar_url: "https://avatars.githubusercontent.com/u/43959210?v=4",
    html_url: "https://github.com/zahinafsar",
    contributions: 3,
  },
  {
    login: "ShahJahanApurbo",
    name: "Md Shajahan Apurba",
    avatar_url: "https://avatars.githubusercontent.com/u/102844859?v=4",
    html_url: "https://github.com/ShahJahanApurbo",
    contributions: 3,
  },
  {
    login: "imtiazahmadtanvir",
    name: "Imtiaz Ahmad Tanvir",
    avatar_url: "https://avatars.githubusercontent.com/u/169084828?v=4",
    html_url: "https://github.com/imtiazahmadtanvir",
    contributions: 2,
  },
  {
    login: "fahmida-nupur",
    name: "Fahmida Akter Nupur",
    avatar_url: "https://avatars.githubusercontent.com/u/146472606?v=4",
    html_url: "https://github.com/fahmida-nupur",
    contributions: 2,
  },
  {
    login: "Arafahmed1314",
    name: "Naimul Islam",
    avatar_url: "https://avatars.githubusercontent.com/u/112814299?v=4",
    html_url: "https://github.com/Arafahmed1314",
    contributions: 1,
  },
  {
    login: "naimulhasannabil",
    name: "Naimul Hasan Nabil",
    avatar_url: "https://avatars.githubusercontent.com/u/147473435?v=4",
    html_url: "https://github.com/naimulhasannabil",
    contributions: 1,
  },
  {
    login: "thimel07",
    name: "Tasnimul Hasan Himel",
    avatar_url: "https://avatars.githubusercontent.com/u/211148768?v=4",
    html_url: "https://github.com/thimel07",
    contributions: 1,
  },
  {
    login: "ammarbinanwarfuad",
    name: "Ammar Bin Anwar Fuad",
    avatar_url: "https://avatars.githubusercontent.com/u/71203673?v=4",
    html_url: "https://github.com/ammarbinanwarfuad",
    contributions: 1,
  },
];
