import type { ApplicationQuestion, ApplicationReview, GeneratedResume } from "@/lib/api";

export const QA_PACKET: GeneratedResume = {
  id: "d6693be1-9d1d-4f61-9911-8d95f1ad1b01",
  job_context: { company: "Acme Labs", role: "Product Engineer", jd_hash: "qa" },
  resume_object_key: "qa",
  created_at: "2026-07-21T12:00:00.000Z",
  download_url: "#",
  spec: {
    school: "University of Southern California",
    degree: "B.S. Computer Science",
    grad_date: "May 2027",
    coursework: "Data Structures, Software Engineering",
    education_position: "top",
    experience: [
      {
        type: "job",
        org: "Elemental AI",
        title: "Product Engineer",
        date_range: "Jan 2026 - Present",
        bullets: [
          "Built a TypeScript workflow engine that automated 18 client handoffs and reduced turnaround time by 42%.",
          "Shipped accessible React dashboards used by 6 teams, with tested empty, loading, and error states.",
        ],
      },
      {
        type: "project",
        org: "Litos",
        title: "Founder and Engineer",
        date_range: "Jun 2026 - Present",
        bullets: [
          "Designed a job-application system that tailors grounded resumes and reviews every answer before submission.",
        ],
      },
    ],
    skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Product Engineering"],
    _quality: { atsCoverage: 76 },
    _review: {
      jd_text: "Acme Labs is hiring a Product Engineer to build TypeScript workflow systems and accessible React interfaces. You will partner with product teams, automate operational handoffs, write tested code, and improve application performance. Experience with Node.js, PostgreSQL, and customer-facing product engineering is preferred.",
      portal_url: "https://jobs.example.com/acme/product-engineer",
      ats_name: "Greenhouse",
      status: "questions_ready",
      edited_terms: ["workflow", "automated", "accessible", "tested", "Product Engineering"],
      questions: [
        {
          id: "why-acme",
          question: "Why are you interested in building products at Acme Labs?",
          answer: "I am drawn to Acme Labs because the role combines product judgment with hands-on engineering. I have built workflow systems and customer-facing tools where speed only mattered when the experience stayed clear and reliable.",
          kind: "essay",
          required: true,
        },
        {
          id: "example",
          question: "Describe a workflow you improved.",
          answer: "At Elemental AI, I built a TypeScript workflow engine that automated 18 client handoffs and reduced turnaround time by 42%. I mapped failure states first, then added visible recovery paths so every handoff remained traceable.",
          kind: "essay",
          required: true,
        },
      ],
      skipped_reasons: [],
      updated_at: "2026-07-21T12:00:00.000Z",
    },
  },
};

export const QA_SCENARIOS: Record<string, GeneratedResume> = {
  acme: QA_PACKET,
  stripe: qaVariant(QA_PACKET, {
    id: "d6693be1-9d1d-4f61-9911-8d95f1ad1b02",
    company: "Stripe",
    role: "Software Engineering Intern",
    ats: "Lever",
    score: 82,
    jd: "Stripe is hiring a Software Engineering Intern to build reliable TypeScript services and React tools. You will improve payment workflows, write tested code, analyze production performance, and collaborate across engineering and product. Experience with Node.js, PostgreSQL, and accessible interfaces is valued.",
    title: "Software Engineering Intern",
    bullets: [
      "Built reliable TypeScript services that automated 18 operational handoffs and reduced turnaround time by 42%.",
      "Shipped tested React tools for 6 teams and documented production recovery paths.",
    ],
    skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Software Engineering"],
    editedTerms: ["reliable", "automated", "tested", "production", "Software Engineering"],
    questions: [],
  }),
  notion: qaVariant(QA_PACKET, {
    id: "d6693be1-9d1d-4f61-9911-8d95f1ad1b03",
    company: "Notion",
    role: "Product Design Intern",
    ats: "Ashby",
    score: 74,
    jd: "Notion is looking for a Product Design Intern who can turn complex workflows into calm, accessible product experiences. You will prototype in Figma, partner with engineers, test interaction details, and communicate clear design rationale. Experience designing dashboards and systems for real users is preferred.",
    title: "Product Designer",
    bullets: [
      "Designed accessible workflow dashboards in Figma and React for 6 client teams.",
      "Tested interaction details with users and reduced handoff turnaround time by 42%.",
    ],
    skills: ["Figma", "Product Design", "Design Systems", "React", "User Research"],
    editedTerms: ["accessible", "Figma", "interaction", "users", "Design Systems"],
    questions: [{
      id: "notion-craft",
      question: "Tell us about a product detail you refined through user feedback.",
      answer: "While designing a workflow dashboard, I saw that users understood system status but could not recover confidently from a failed handoff. I added visible recovery paths, tested the revised interaction, and used the findings to simplify the surrounding controls.",
      kind: "essay",
      required: true,
    }],
  }),
  figma: qaVariant(QA_PACKET, {
    id: "d6693be1-9d1d-4f61-9911-8d95f1ad1b04",
    company: "Figma",
    role: "Data Analyst Intern",
    ats: "Workday",
    score: 79,
    jd: "Figma is hiring a Data Analyst Intern to define product metrics, build trustworthy dashboards, and translate behavioral data into clear recommendations. You will work with SQL, PostgreSQL, experimentation, and cross-functional product teams. Strong communication and careful data validation are required.",
    title: "Data Analyst",
    bullets: [
      "Built trustworthy PostgreSQL dashboards that tracked 18 workflow handoffs across 6 teams.",
      "Analyzed product metrics and validated reporting changes that reduced turnaround time by 42%.",
    ],
    skills: ["SQL", "PostgreSQL", "Product Analytics", "Experimentation", "Data Visualization"],
    editedTerms: ["trustworthy", "dashboards", "metrics", "validated", "Product Analytics"],
    questions: [],
  }),
  vercel: qaVariant(QA_PACKET, {
    id: "d6693be1-9d1d-4f61-9911-8d95f1ad1b05",
    company: "Vercel",
    role: "Developer Advocate Intern",
    ats: "Greenhouse",
    score: 77,
    jd: "Vercel is seeking a Developer Advocate Intern to teach developers through clear technical content, product demos, and community programs. You will build examples with React and TypeScript, explain complex workflows, gather developer feedback, and partner with product engineering. Strong writing and public communication are essential.",
    title: "Developer Advocate",
    bullets: [
      "Built React and TypeScript product demos that explained workflow automation to 6 client teams.",
      "Translated developer feedback into tested examples and clear implementation guidance.",
    ],
    skills: ["TypeScript", "React", "Technical Writing", "Developer Education", "Public Speaking"],
    editedTerms: ["demos", "explained", "developer", "guidance", "Technical Writing"],
    questions: [
      {
        id: "vercel-teach",
        question: "What technical concept have you enjoyed teaching others?",
        answer: "I enjoy teaching state and failure handling because a small, concrete demo can turn an abstract reliability concept into something a developer can immediately apply.",
        kind: "essay",
        required: true,
      },
      {
        id: "vercel-community",
        question: "How would you learn what a developer community needs?",
        answer: "I would combine direct conversations with support themes, documentation searches, and product feedback, then test a small piece of content before investing in a larger program.",
        kind: "essay",
        required: true,
      },
      {
        id: "vercel-why",
        question: "Why Vercel?",
        answer: "Vercel sits at the intersection of product engineering and developer education, which matches how I like to work: build the example, understand the friction, and explain the path clearly.",
        kind: "essay",
        required: true,
      },
    ],
  }),
  deepgram: qaVariant(QA_PACKET, {
    id: "d6693be1-9d1d-4f61-9911-8d95f1ad1b06",
    company: "Deepgram",
    role: "Software Engineering Intern",
    ats: "Ashby",
    score: 81,
    jd: "Deepgram is hiring a Software Engineering Intern to build reliable voice AI infrastructure and developer tools with TypeScript, Python, and distributed systems.",
    title: "Software Engineer",
    bullets: [
      "Built reliable TypeScript services that automated 18 operational handoffs.",
      "Shipped tested developer tools with visible recovery paths for production failures.",
    ],
    skills: ["TypeScript", "Python", "Distributed Systems", "Developer Tools", "Voice AI"],
    editedTerms: ["reliable", "developer", "production", "Distributed Systems", "Voice AI"],
    status: "needs_attention",
    attentionReason: "CAPTCHA requires your attention\n\"What excites you about Deepgram?\" needs your review",
    filledFields: ["name", "email", "phone", "resume"],
    questions: [{
      id: "deepgram-why",
      question: "What excites you about Deepgram?",
      answer: "Deepgram combines developer infrastructure with applied voice AI, which matches the systems and product work I want to deepen.",
      kind: "essay",
      required: true,
    }, {
      id: "deepgram-build",
      question: "What is the most impressive thing you have built or automated with AI?",
      answer: "",
      kind: "essay",
      required: true,
    }],
  }),
};

function qaVariant(packet: GeneratedResume, options: {
  id: string;
  company: string;
  role: string;
  ats: string;
  score: number;
  jd: string;
  title: string;
  bullets: string[];
  skills: string[];
  editedTerms: string[];
  questions: ApplicationQuestion[];
  status?: ApplicationReview["status"];
  attentionReason?: string;
  filledFields?: string[];
}): GeneratedResume {
  const review = packet.spec._review;
  if (!review) return packet;
  return {
    ...packet,
    id: options.id,
    job_context: { company: options.company, role: options.role, jd_hash: `qa-${options.company.toLowerCase()}` },
    spec: {
      ...packet.spec,
      experience: packet.spec.experience.map((entry, index) =>
        index === 0 ? { ...entry, title: options.title, bullets: options.bullets } : entry,
      ),
      skills: options.skills,
      _quality: { ...packet.spec._quality, atsCoverage: options.score },
      _review: {
        ...review,
        jd_text: options.jd,
        portal_url: `https://jobs.example.com/${options.company.toLowerCase()}/${options.role.toLowerCase().replaceAll(" ", "-")}`,
        ats_name: options.ats,
        status: options.status ?? (options.questions.length > 0 ? "questions_ready" : "ready_to_submit"),
        edited_terms: options.editedTerms,
        questions: options.questions,
        attention_reason: options.attentionReason,
        filled_fields: options.filledFields,
      },
    },
  };
}
