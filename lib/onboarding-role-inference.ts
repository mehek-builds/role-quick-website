import type { ParsedProfile, RoleType } from "./api";

export type ResumeTargetingGuess = {
  roles: string[];
  roleType: RoleType;
  categories: string[];
  yearsExperience: number;
};

const ROLE_FAMILIES: { match: RegExp; roles: string[]; category: string }[] = [
  {
    match: /software|developer|frontend|front-end|backend|back-end|full.?stack|web|mobile|ios|android|react|typescript|javascript|java|python|c\+\+/i,
    roles: ["Software Engineer", "Full Stack Engineer", "Backend Engineer", "Frontend Engineer", "Product Engineer"],
    category: "software-engineering",
  },
  {
    match: /machine learning|\bml\b|data|analytics|artificial intelligence|\bai\b|pytorch|tensorflow|sql/i,
    roles: ["Machine Learning Engineer", "Data Scientist", "Data Engineer", "Data Analyst", "AI Engineer"],
    category: "data-ml",
  },
  {
    match: /product manager|product management|product strategy|roadmap|product owner/i,
    roles: ["Product Manager", "Associate Product Manager", "Technical Product Manager", "Program Manager", "Business Analyst"],
    category: "product",
  },
  {
    match: /design|figma|ux|ui|user experience|visual/i,
    roles: ["Product Designer", "UX Designer", "UI Designer", "UX Researcher", "Design Engineer"],
    category: "design",
  },
  {
    match: /quant|trading|portfolio|financial|finance|economics/i,
    roles: ["Quantitative Researcher", "Quantitative Trader", "Financial Analyst", "Trader", "Business Analyst"],
    category: "quant-trading",
  },
  {
    match: /hardware|embedded|electrical|mechanical|robotics|firmware|cad/i,
    roles: ["Hardware Engineer", "Embedded Systems Engineer", "Robotics Engineer", "Systems Engineer", "Mechanical Engineer"],
    category: "hardware",
  },
  {
    match: /research|laboratory|scientist|publication|thesis/i,
    roles: ["Research Assistant", "Research Scientist", "Research Engineer", "Lab Technician", "Program Analyst"],
    category: "research",
  },
  {
    match: /marketing|growth|content|brand|social media/i,
    roles: ["Marketing Associate", "Growth Marketing Associate", "Product Marketing Associate", "Content Strategist", "Marketing Analyst"],
    category: "other",
  },
  {
    match: /sales|account executive|customer success|business development|partnerships/i,
    roles: ["Account Executive", "Business Development Representative", "Customer Success Manager", "Account Manager", "Sales Engineer"],
    category: "other",
  },
];

function cleanTitle(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s*[-|,]\s*(intern(ship)?|co-?op)\b.*$/i, "")
    .trim();
}

function addUnique(target: string[], values: string[]) {
  for (const value of values) {
    const clean = cleanTitle(value);
    if (!clean || target.some((item) => item.toLowerCase() === clean.toLowerCase())) continue;
    target.push(clean);
  }
}

function yearFrom(value: string): number | null {
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

export function experienceYears(profile: ParsedProfile, currentYear = new Date().getFullYear()): number {
  let months = 0;
  for (const experience of profile.experience ?? []) {
    const start = yearFrom(experience.start ?? "");
    if (!start) continue;
    const statedEnd = yearFrom(experience.end ?? "");
    const end = /present|current|now/i.test(experience.end ?? "") ? currentYear : statedEnd ?? start;
    months += Math.max(3, (Math.max(start, end) - start) * 12);
  }
  return Math.round((months / 12) * 10) / 10;
}

export function inferRoleType(
  profile: ParsedProfile,
  years = experienceYears(profile),
  currentYear = new Date().getFullYear(),
): RoleType {
  if (years >= 5) return "full-time";
  const experiences = profile.experience ?? [];
  const currentCoOp = experiences.some((item) => {
    if (!/co-?op/i.test(item.title)) return false;
    const end = item.end?.trim() ?? "";
    return !end || /present|current|now/i.test(end) || yearFrom(end) === currentYear;
  });
  if (currentCoOp) return "co-op";
  if (profile.grad_year >= currentYear && profile.grad_year <= currentYear + 1) return "new-grad";
  if (profile.currently_enrolled || profile.grad_year > currentYear + 1) return "internship";
  const titles = experiences.map((item) => item.title).join(" ");
  if (/intern(ship)?/i.test(titles) && years < 2) return "internship";
  if (years >= 2) return "full-time";
  return "full-time";
}

export function categoriesForRoles(roles: string[], fallback: string[] = ["other"]): string[] {
  const categories = Array.from(new Set(
    ROLE_FAMILIES
      .filter((family) => roles.some((role) =>
        family.match.test(role)
        || family.roles.some((knownRole) => knownRole.toLowerCase() === role.toLowerCase()),
      ))
      .map((family) => family.category),
  )).slice(0, 3);
  return categories.length > 0 ? categories : fallback.slice(0, 3);
}

export function inferResumeTargeting(profile: ParsedProfile, currentYear = new Date().getFullYear()): ResumeTargetingGuess {
  const roles: string[] = [];
  addUnique(roles, profile.target_roles ?? []);

  const evidence = [
    ...(profile.experience ?? []).map((item) => `${item.title} ${item.description}`),
    ...(profile.skills ?? []),
    ...(profile.projects ?? []).map((item) => `${item.name} ${item.description}`),
  ].join(" ");
  const targetEvidence = (profile.target_roles ?? []).join(" ");
  const matched = ROLE_FAMILIES
    .filter((family) => family.match.test(evidence) || family.match.test(targetEvidence))
    .sort((a, b) => Number(b.match.test(targetEvidence)) - Number(a.match.test(targetEvidence)));
  for (const family of matched) addUnique(roles, family.roles);
  addUnique(roles, (profile.experience ?? []).map((item) => item.title));

  const categories = Array.from(new Set(matched.map((family) => family.category))).slice(0, 3);
  const yearsExperience = experienceYears(profile, currentYear);
  return {
    roles: roles.slice(0, 5),
    roleType: inferRoleType(profile, yearsExperience, currentYear),
    categories: categories.length > 0 ? categories : ["other"],
    yearsExperience,
  };
}
