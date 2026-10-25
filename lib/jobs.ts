export type JobStatus = "Available" | "Applied" | "Interview";
export type StatusFilter = "All" | JobStatus;
export type JobSort = "newest" | "company" | "role";

export interface Job {
  id: string;
  company: string;
  title: string;
  location: string;
  status: JobStatus;
  salary: string;
  workType: "Hybrid" | "Remote" | "On-site";
  description: string;
  initials: string;
  color: string;
  addedOrder: number;
}

export const sampleJobs: Job[] = [
  {
    id: "linear",
    company: "Linear",
    title: "Senior Product Designer",
    location: "San Francisco, CA",
    status: "Applied",
    salary: "$160k–$200k",
    workType: "Hybrid",
    initials: "L",
    color: "violet",
    addedOrder: 12,
    description:
      "Shape thoughtful, beautifully crafted tools that help product teams do their best work. Collaborate with engineering and product to turn complex workflows into simple experiences.",
  },
  {
    id: "notion",
    company: "Notion",
    title: "Frontend Engineer",
    location: "New York, NY",
    status: "Available",
    salary: "$150k–$190k",
    workType: "Hybrid",
    initials: "N",
    color: "paper",
    addedOrder: 11,
    description:
      "Build flexible, accessible interfaces that bring notes, knowledge, and projects together. Work across product and engineering to create a connected workspace.",
  },
  {
    id: "vercel",
    company: "Vercel",
    title: "Design Engineer",
    location: "Remote",
    status: "Interview",
    salary: "$170k–$210k",
    workType: "Remote",
    initials: "V",
    color: "paper",
    addedOrder: 10,
    description:
      "Work at the intersection of design and engineering to create delightful developer experiences. Prototype interactions, refine design systems, and bring polished interfaces to production.",
  },
  {
    id: "figma",
    company: "Figma",
    title: "Product Designer",
    location: "San Francisco, CA",
    status: "Available",
    salary: "$145k–$185k",
    workType: "Hybrid",
    initials: "F",
    color: "coral",
    addedOrder: 9,
    description:
      "Help make design accessible and collaborative. Partner with multidisciplinary teams to explore new ideas and create intuitive tools for designers around the world.",
  },
  {
    id: "stripe",
    company: "Stripe",
    title: "Software Engineer",
    location: "San Francisco, CA",
    status: "Applied",
    salary: "$170k–$220k",
    workType: "Hybrid",
    initials: "S",
    color: "violet",
    addedOrder: 8,
    description:
      "Create dependable, intuitive tools for internet businesses. Solve complex engineering problems and help make financial infrastructure easier to use.",
  },
  {
    id: "airbnb",
    company: "Airbnb",
    title: "Senior UX Researcher",
    location: "Remote",
    status: "Available",
    salary: "$140k–$180k",
    workType: "Remote",
    initials: "A",
    color: "coral",
    addedOrder: 7,
    description:
      "Understand the people behind memorable travel experiences. Bring qualitative and quantitative insights into product decisions across a global marketplace.",
  },
  {
    id: "spotify",
    company: "Spotify",
    title: "Product Design Lead",
    location: "New York, NY",
    status: "Applied",
    salary: "$180k–$230k",
    workType: "Hybrid",
    initials: "S",
    color: "mint",
    addedOrder: 6,
    description:
      "Lead the design of meaningful listening experiences. Connect user insights, creative exploration, and product strategy across a collaborative team.",
  },
  {
    id: "wise",
    company: "Wise",
    title: "Frontend Developer",
    location: "London, UK",
    status: "Available",
    salary: "£80k–£110k",
    workType: "Hybrid",
    initials: "W",
    color: "mint",
    addedOrder: 5,
    description:
      "Make international money movement feel local. Build accessible, high-performance web experiences with a focus on clarity and customer trust.",
  },
  {
    id: "ramp",
    company: "Ramp",
    title: "Brand Designer",
    location: "New York, NY",
    status: "Interview",
    salary: "$130k–$170k",
    workType: "On-site",
    initials: "R",
    color: "mint",
    addedOrder: 4,
    description:
      "Translate a growing brand into cohesive digital experiences. Collaborate on campaigns, websites, and visual systems that connect with ambitious teams.",
  },
  {
    id: "webflow",
    company: "Webflow",
    title: "Senior Frontend Engineer",
    location: "Remote",
    status: "Available",
    salary: "$160k–$205k",
    workType: "Remote",
    initials: "W",
    color: "blue",
    addedOrder: 3,
    description:
      "Empower people to build for the web. Develop powerful visual tools and reliable frontend systems for a collaborative website platform.",
  },
  {
    id: "intercom",
    company: "Intercom",
    title: "Product Designer",
    location: "London, UK",
    status: "Applied",
    salary: "£85k–£115k",
    workType: "Hybrid",
    initials: "I",
    color: "blue",
    addedOrder: 2,
    description:
      "Make customer support more personal and effective. Explore complex service workflows and deliver considered, approachable product experiences.",
  },
  {
    id: "loom",
    company: "Loom",
    title: "UX Engineer",
    location: "Remote",
    status: "Available",
    salary: "$145k–$185k",
    workType: "Remote",
    initials: "L",
    color: "violet",
    addedOrder: 1,
    description:
      "Help teams communicate more naturally through video. Bring prototypes and design systems to life with thoughtful interaction and frontend engineering.",
  },
];

export interface JobFilters {
  query: string;
  status: StatusFilter;
  location: string;
  sort: JobSort;
}

export function getVisibleJobs(jobs: Job[], filters: JobFilters): Job[] {
  const query = filters.query.trim().toLowerCase();
  return jobs
    .filter(
      (job) =>
        (filters.status === "All" || job.status === filters.status) &&
        (filters.location === "All locations" ||
          job.location === filters.location) &&
        `${job.company} ${job.title} ${job.location}`
          .toLowerCase()
          .includes(query),
    )
    .sort((a, b) => {
      if (filters.sort === "company") return a.company.localeCompare(b.company);
      if (filters.sort === "role") return a.title.localeCompare(b.title);
      return b.addedOrder - a.addedOrder;
    });
}
