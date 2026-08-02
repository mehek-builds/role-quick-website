export type KeywordClarification = {
  id: string;
  keyword: string;
  question: string;
};

export type ClarificationAnswers = Record<string, string | null>;

type KeywordDefinition = {
  id: string;
  keyword: string;
  terms: string[];
};

const MAX_CLARIFICATIONS = 3;
export const MAX_CLARIFICATION_ANSWER_CHARS = 500;
export const MIN_CLARIFICATION_ANSWER_CHARS = 12;

/* Ordered by how specifically each term names experience an employer can verify.
   The try feed spans software, data, product, marketing, and quantitative roles,
   so the list intentionally covers those families instead of treating every
   repeated noun in a posting as a skill. */
const KEYWORD_DEFINITIONS: KeywordDefinition[] = [
  { id: "python", keyword: "Python", terms: ["python"] },
  { id: "sql", keyword: "SQL", terms: ["sql"] },
  { id: "react", keyword: "React", terms: ["react"] },
  { id: "typescript", keyword: "TypeScript", terms: ["typescript"] },
  { id: "javascript", keyword: "JavaScript", terms: ["javascript"] },
  { id: "nodejs", keyword: "Node.js", terms: ["node.js", "nodejs"] },
  { id: "nextjs", keyword: "Next.js", terms: ["next.js", "nextjs"] },
  { id: "machine-learning", keyword: "machine learning", terms: ["machine learning"] },
  { id: "data-structures", keyword: "data structures", terms: ["data structures"] },
  { id: "algorithms", keyword: "algorithms", terms: ["algorithms", "algorithm complexity"] },
  { id: "statistics", keyword: "statistics", terms: ["statistics", "statistical analysis"] },
  { id: "probability", keyword: "probability", terms: ["probability"] },
  { id: "real-time-systems", keyword: "real-time systems", terms: ["real-time systems", "real time systems", "real-time collaborative systems"] },
  { id: "distributed-systems", keyword: "distributed systems", terms: ["distributed systems"] },
  { id: "scalable-systems", keyword: "scalable systems", terms: ["scalable systems", "scaling infrastructure"] },
  { id: "enterprise-infrastructure", keyword: "enterprise infrastructure", terms: ["enterprise infrastructure"] },
  { id: "data-analysis", keyword: "data analysis", terms: ["data analysis", "data analytics"] },
  { id: "product-analytics", keyword: "product analytics", terms: ["product analytics"] },
  { id: "client-reporting", keyword: "client reporting", terms: ["client reporting", "reporting use cases"] },
  { id: "saas", keyword: "SaaS", terms: ["saas"] },
  { id: "daas", keyword: "DaaS", terms: ["daas"] },
  { id: "market-making", keyword: "market making", terms: ["market making"] },
  { id: "options-theory", keyword: "options theory", terms: ["options theory"] },
  { id: "trade-analysis", keyword: "trade analysis", terms: ["trade analysis"] },
  { id: "product-management", keyword: "product management", terms: ["product management"] },
  { id: "commercialization", keyword: "commercialization strategy", terms: ["commercialization strategy"] },
  { id: "audience-intelligence", keyword: "audience intelligence", terms: ["audience intelligence"] },
  { id: "messaging-architecture", keyword: "messaging architecture", terms: ["messaging architecture"] },
  { id: "persona-frameworks", keyword: "persona frameworks", terms: ["persona frameworks"] },
  { id: "experimentation", keyword: "experimentation", terms: ["experimentation", "experiment design"] },
  { id: "ai-assisted-development", keyword: "AI-assisted development", terms: ["ai-assisted development"] },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}

function containsTerm(text: string, term: string): boolean {
  const source = normalize(text);
  const needle = normalize(term);
  const isWord = (value: string | undefined) => Boolean(value && /[a-z0-9]/.test(value));
  let start = source.indexOf(needle);
  while (start >= 0) {
    const before = source[start - 1];
    const after = source[start + needle.length];
    if (!isWord(before) && !isWord(after)) return true;
    start = source.indexOf(needle, start + 1);
  }
  return false;
}

function definitionAppears(text: string, definition: KeywordDefinition): boolean {
  return definition.terms.some((term) => containsTerm(text, term));
}

export function findKeywordClarifications(
  posting: string,
  resume: string,
): KeywordClarification[] {
  return KEYWORD_DEFINITIONS
    .filter(
      (definition) =>
        definitionAppears(posting, definition) &&
        !definitionAppears(resume, definition),
    )
    .slice(0, MAX_CLARIFICATIONS)
    .map((definition) => ({
      id: definition.id,
      keyword: definition.keyword,
      question: `Have you used ${definition.keyword}? Describe one specific project, task, or result.`,
    }));
}

export function parseClarificationAnswers(
  clarifications: KeywordClarification[],
  candidate: unknown,
): ClarificationAnswers | null {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const expectedIds = new Set(clarifications.map((item) => item.id));
  if (
    Object.keys(record).length !== expectedIds.size ||
    Object.keys(record).some((id) => !expectedIds.has(id))
  ) {
    return null;
  }

  const answers: ClarificationAnswers = {};
  for (const clarification of clarifications) {
    const value = record[clarification.id];
    if (value === null) {
      answers[clarification.id] = null;
      continue;
    }
    if (typeof value !== "string") return null;
    const answer = value.replace(/\s+/g, " ").trim();
    if (
      answer.length < MIN_CLARIFICATION_ANSWER_CHARS ||
      answer.length > MAX_CLARIFICATION_ANSWER_CHARS
    ) {
      return null;
    }
    answers[clarification.id] = answer;
  }
  return answers;
}

export function clarificationEvidenceText(
  clarifications: KeywordClarification[],
  answers: ClarificationAnswers,
): string {
  return clarifications
    .flatMap((clarification) => {
      const answer = answers[clarification.id];
      return answer ? [`${clarification.keyword}: ${answer}`] : [];
    })
    .join("\n");
}

export function findDeclinedKeywordClaims(
  bullets: string[],
  clarifications: KeywordClarification[],
  answers: ClarificationAnswers,
): string[] {
  const output = bullets.join("\n");
  return clarifications.flatMap((clarification) => {
    if (answers[clarification.id]) return [];
    const definition = KEYWORD_DEFINITIONS.find((item) => item.id === clarification.id);
    return definition && definitionAppears(output, definition)
      ? [clarification.keyword]
      : [];
  });
}
