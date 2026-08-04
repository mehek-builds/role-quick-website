/* Renders the four reference frames for the Higgsfield resume b-roll:

     convert_start  : the messy resume (MessyResumeMockup, "Skipped by ATS")
     convert_end    : the clean resume (CleanResumeMockup, "ATS-ready")
     ats_start      : Northline posting + tailored resume, no highlights
     ats_end        : same frame, 5/5 keywords lit in pillar colors

   Same studio background in every frame so the video model only animates
   the page content. Content is transcribed from components/Mockups.tsx:
   the pages ARE the site's Before/After and JD/Tailored examples.

   Usage: node scripts/render-stills.mjs  (writes .stills-tmp/*.png at
   3840x2160, then downscale to 1920x1080 with sharp, see printed cmd). */

import { createCanvas } from "canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".stills-tmp");
mkdirSync(OUT, { recursive: true });

const W = 3840;
const H = 2160;

/* tokens (globals.css) */
const INK = "#12120f";
const MUTED = "#6b6a64";
const FAINT = "#a3a19a";
const SOFT = { brand: "#eef1fe", teal: "#eaf5f0", coral: "#fbefe8" };
const PILLAR_INK = { brand: "#3d51ad", teal: "#3f7d67", coral: "#a35f3f" };
const DANGER = "#b91c1c";
const DANGER_SOFT = "#fbeaea";
const POSITIVE = "#15803d";
const POSITIVE_SOFT = "#eaf6ee";

/* ---- the studio: identical in every frame ---- */
function studio(ctx) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#f2f2ef");
  g.addColorStop(0.45, "#fafaf8");
  g.addColorStop(1, "#ececea");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  /* diagonal window light, like the film frames */
  const band = (x1, x2, alpha, color = "#ffffff") => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(W * x1, 0);
    ctx.lineTo(W * x2, 0);
    ctx.lineTo(W * (x2 - 0.34), H);
    ctx.lineTo(W * (x1 - 0.34), H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  band(0.58, 0.74, 0.5);
  band(0.86, 0.94, 0.38);
  band(0.3, 0.35, 0.05, "#55554f");
  band(1.06, 1.1, 0.05, "#55554f");

  /* soft floor shading at the bottom */
  const fg = ctx.createLinearGradient(0, H * 0.78, 0, H);
  fg.addColorStop(0, "rgba(90,90,85,0)");
  fg.addColorStop(1, "rgba(90,90,85,0.10)");
  ctx.fillStyle = fg;
  ctx.fillRect(0, H * 0.78, W, H * 0.22);
}

function pageRect(ctx, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = "rgba(18,18,15,0.20)";
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 34;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.strokeStyle = "rgba(18,18,15,0.07)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

/* chip above a page: the mockups' machine-voice label */
function chip(ctx, cx, y, text, fg, bg) {
  ctx.font = "500 30px Menlo";
  const w = ctx.measureText(text).width + 56;
  const h = 62;
  const x = cx - w / 2;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 31);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, y + h / 2 + 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/* ---- the pen: cursor-based text layout inside a page ---- */
class Pen {
  constructor(ctx, x, y, w) {
    this.ctx = ctx;
    this.left = x;
    this.y = y;
    this.w = w;
  }
  gap(px) {
    this.y += px;
  }
  font({ size, family = "Helvetica", weight = "", style = "" }) {
    this.ctx.font = `${style} ${weight} ${size}px ${family}`.trim();
  }
  /* one line, optional center/underline */
  line(text, o) {
    const c = this.ctx;
    this.font(o);
    c.fillStyle = o.color ?? INK;
    const x = o.center ? this.left + this.w / 2 : this.left + (o.indent ?? 0);
    if (o.center) c.textAlign = "center";
    c.fillText(text, x, this.y);
    if (o.underline) {
      const tw = c.measureText(text).width;
      const ux = o.center ? x - tw / 2 : x;
      c.strokeStyle = o.color ?? INK;
      c.lineWidth = Math.max(2, o.size / 14);
      c.beginPath();
      c.moveTo(ux, this.y + o.size * 0.16);
      c.lineTo(ux + tw, this.y + o.size * 0.16);
      c.stroke();
    }
    c.textAlign = "left";
    this.y += o.lh ?? o.size * 1.5;
  }
  /* left + right on one baseline */
  row(l, r, o) {
    const c = this.ctx;
    this.font({ ...o, weight: o.lWeight ?? "600" });
    c.fillStyle = o.lColor ?? INK;
    c.fillText(l, this.left, this.y);
    this.font({ ...o, size: o.rSize ?? o.size * 0.94, weight: "" });
    c.fillStyle = o.rColor ?? MUTED;
    c.textAlign = "right";
    c.fillText(r, this.left + this.w, this.y);
    c.textAlign = "left";
    this.y += o.lh ?? o.size * 1.6;
  }
  /* word-wrapped plain text */
  wrap(text, o) {
    const c = this.ctx;
    this.font(o);
    c.fillStyle = o.color ?? MUTED;
    const indent = o.indent ?? 0;
    const max = this.w - indent;
    const words = text.split(" ");
    let line = "";
    for (const wd of words) {
      const probe = line ? line + " " + wd : wd;
      if (c.measureText(probe).width > max && line) {
        c.fillText(line, this.left + indent, this.y);
        this.y += o.lh ?? o.size * 1.5;
        line = wd;
      } else line = probe;
    }
    if (line) {
      c.fillText(line, this.left + indent, this.y);
      this.y += o.lh ?? o.size * 1.5;
    }
  }
  /* word-wrapped styled segments; hl draws a soft pill behind the run.
     lit=false renders the same layout with no pill (identical geometry). */
  segs(segments, o, lit) {
    const c = this.ctx;
    const indent = o.indent ?? 0;
    const max = this.w - indent;
    const words = [];
    for (const s of segments)
      for (const wd of s.t.split(" "))
        if (wd) {
          /* glue leading punctuation onto the previous word so highlight
             boundaries never leave a floating " ," */
          if (/^[,;.:)]/.test(wd) && words.length) {
            const prev = words[words.length - 1];
            const m = wd.match(/^([,;.:)]+)(.*)$/);
            prev.wd += m[1];
            if (m[2]) words.push({ wd: m[2], hl: s.hl ?? null, b: s.b ?? false });
          } else words.push({ wd, hl: s.hl ?? null, b: s.b ?? false });
        }
    const lh = o.lh ?? o.size * 1.5;
    let x = this.left + indent;
    const spaceW = () => {
      this.font(o);
      return c.measureText(" ").width;
    };
    for (const it of words) {
      this.font({ ...o, weight: it.b ? "600" : "" });
      const wdW = c.measureText(it.wd).width;
      if (x + wdW > this.left + indent + max + 1 && x > this.left + indent) {
        x = this.left + indent;
        this.y += lh;
      }
      if (it.hl && lit) {
        c.fillStyle = SOFT[it.hl];
        c.beginPath();
        c.roundRect(x - 5, this.y - o.size * 0.82, wdW + 14, o.size * 1.12, 7);
        c.fill();
      }
      c.fillStyle =
        it.hl && lit ? PILLAR_INK[it.hl] : o.color ?? MUTED;
      c.fillText(it.wd, x, this.y);
      x += wdW + spaceW();
    }
    this.y += lh;
  }
  /* section header: small caps + hairline rule (the clean-pdf primitive) */
  section(title, o) {
    const c = this.ctx;
    this.font({ size: o.size, family: "Helvetica", weight: "600" });
    c.fillStyle = INK;
    const spaced = title.toUpperCase().split("").join(" ");
    c.fillText(spaced, this.left, this.y);
    this.y += o.size * 0.55;
    c.strokeStyle = "rgba(18,18,15,0.22)";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(this.left, this.y);
    c.lineTo(this.left + this.w, this.y);
    c.stroke();
    this.y += o.gapAfter ?? o.size * 1.5;
  }
}

/* ================= the messy resume (Before) ================= */
function drawMessy(ctx, px, py, pw, ph) {
  pageRect(ctx, px, py, pw, ph);
  const S = pw / 400; /* mockup was 400px wide */
  const pen = new Pen(ctx, px + 26 * S, py + 40 * S, pw - 52 * S);
  const serif = (size, extra = {}) => ({
    size: size * S,
    family: "Georgia",
    lh: size * S * 1.5,
    ...extra,
  });

  pen.line("JOHN DOE", serif(12.5, { center: true, weight: "bold", underline: true, color: INK, lh: 15 * S }));
  pen.gap(3 * S);
  pen.line(
    "john.d99@email.com | 213-555-0148 | Los Angeles | www.linkedin.com/in/john-doe-1997b",
    serif(7.0, { center: true, style: "italic", color: MUTED, lh: 11 * S })
  );

  pen.gap(8 * S);
  pen.line("Objective", serif(8.5, { weight: "bold", style: "italic", underline: true, color: INK, lh: 12 * S }));
  pen.wrap(
    "Seeking a challenging software engineering position where i can utilize my skills and grow as a professional in a fast paced environment.",
    serif(7.6, { color: MUTED, lh: 11.4 * S })
  );

  const job = (head, tail) => {
    pen.gap(5 * S);
    pen.segs([{ t: head, b: true }, { t: tail }], serif(7.6, { color: MUTED, lh: 11.4 * S }), false);
  };
  const bul = (mark, text) => pen.wrap(`${mark} ${text}`, serif(7.6, { indent: 8 * S, color: MUTED, lh: 11.4 * S }));

  pen.gap(7 * S);
  pen.line("work experience", serif(8.5, { weight: "bold", underline: true, color: INK, lh: 12 * S }));
  job("Acme Inc", " - software eng intern (summer 2026)");
  bul("•", "Responsible for helping the backend team with apis and databases");
  bul("•", "Worked on a dashboard for the team and attended meetings");
  bul("•", "Helped with testing sometimes when the team needed it");
  job("Freelance", " - web developer (2024 - present)");
  bul("-", "Built websites for a few small clients (react etc)");
  bul("-", "Fixed bugs, deployed sites and communicated with clients");
  job("USC", " - grader for CSCI 201 (school year)");
  bul("•", "Graded homework assignments for the intro software class");
  bul("•", "Helped students during office hours with debugging their code");
  job("USC Bookstore", " - cashier (part time)");
  bul("-", "Handled transactions and restocked inventory");

  pen.gap(7 * S);
  pen.line("Projects", serif(8.5, { weight: "bold", underline: true, color: INK, lh: 12 * S }));
  bul("•", "Made a campus marketplace app with friends (trojanmarket), a lot of students used it");
  bul("•", "Recipe finder app for a class group project, also my personal website (html/css)");

  pen.gap(7 * S);
  pen.line("Education", serif(8.5, { weight: "bold", underline: true, color: INK, lh: 12 * S }));
  pen.wrap(
    "University of Southern California -- computer science major, graduating soon (hopefully 2027), GPA available on request",
    serif(7.6, { color: MUTED, lh: 11.4 * S })
  );

  pen.gap(7 * S);
  pen.line("SKILLS", serif(8.5, { weight: "bold", underline: true, color: INK, lh: 12 * S }));
  pen.wrap(
    "python, some react, sql i guess, java (from high school), css, html, microsoft word, excel, git (basic), teamwork, communication, hard-working, detail oriented",
    serif(7.6, { color: MUTED, lh: 11.4 * S })
  );

  pen.gap(7 * S);
  pen.line("Activities", serif(8.5, { weight: "bold", underline: true, color: INK, lh: 12 * S }));
  pen.wrap(
    "chess club, intramural soccer, coding club member, volunteering sometimes at the animal shelter",
    serif(7.6, { color: MUTED, lh: 11.4 * S })
  );

  pen.gap(6 * S);
  pen.line("References available upon request", serif(7.0, { center: true, style: "italic", color: MUTED, lh: 11 * S }));
  ctx.font = `italic ${7 * S}px Georgia`;
  ctx.fillStyle = FAINT;
  ctx.textAlign = "center";
  ctx.fillText("Page 1 of 1", px + pw / 2, py + ph - 22 * S);
  ctx.textAlign = "left";
}

/* ============ the clean / tailored resume (After) ============ */
/* lit=false → plain clean resume; lit=true → keyword pills on. */
function drawClean(ctx, px, py, pw, ph, lit) {
  pageRect(ctx, px, py, pw, ph);
  const S = (pw / 400) * 1.06; /* font scale: fill the sheet like a real 1-pager */
  const V = 1.22; /* vertical rhythm scale */
  const pen = new Pen(ctx, px + 23 * (pw / 400), py + 44 * (pw / 400), pw - 46 * (pw / 400));
  const sans = (size, extra = {}) => ({
    size: size * S,
    family: "Helvetica",
    lh: size * S * 1.52 * V,
    ...extra,
  });
  const sec = (t) => {
    pen.gap(8 * S * V);
    pen.section(t, { size: 6.9 * S, gapAfter: 11 * S * V });
  };
  const row = (l, r) => pen.row(l, r, sans(7.3, { rSize: 6.9 * S, lh: 11 * S * V }));
  const bul = (segs) =>
    pen.segs(
      [{ t: "• " }, ...(Array.isArray(segs) ? segs : [{ t: segs }])],
      sans(7.05, { indent: 6 * S, color: MUTED, lh: 10.6 * S * V }),
      lit
    );

  pen.line("John Doe", sans(12.5, { center: true, weight: "600", color: INK, lh: 15 * S }));
  pen.gap(2 * S);
  pen.line(
    "john.doe@usc.edu · (213) 555-0148 · linkedin.com/in/johndoe · github.com/johndoe",
    sans(6.8, { center: true, color: MUTED, lh: 10 * S })
  );

  sec("Education");
  row("University of Southern California", "Los Angeles, CA");
  pen.row("B.S. Computer Science · Dean's List, 3 semesters", "Expected May 2027 · GPA 3.8", sans(7.0, { lWeight: "", lColor: MUTED, rSize: 6.8 * S, lh: 10.4 * S }));
  pen.segs(
    [
      { t: "Coursework: Data Structures," },
      { t: "Distributed Systems", hl: "teal" },
      { t: ", Databases, Operating Systems, Machine Learning" },
    ],
    sans(7.0, { color: MUTED, lh: 10.4 * S }),
    lit
  );

  sec("Experience");
  row("Software Engineer Intern, Acme Inc", "May – Aug 2026");
  bul([
    { t: "Built 4 REST APIs in" },
    { t: "Python", hl: "brand" },
    { t: "serving 40K requests/day; cut p95 latency 30%" },
  ]);
  bul("Deployed on AWS through a CI/CD pipeline; cut release time 60%");
  bul([
    { t: "Owned a team metrics dashboard end to end, spec to production", hl: "coral" },
    { t: "; 12 engineers use it weekly" },
  ]);

  row("Freelance Web Developer, Self-employed", "2024 – 2026");
  bul("Shipped 6 production sites; automated AWS deploys with zero downtime");
  bul("Maintained tested, reviewed code across 6 client stacks; zero shipped regressions");
  bul("Cut average page load 45% by profiling and rewriting render paths");

  row("Course Grader, CSCI 201 Software Development", "Aug 2025 – May 2026");
  bul("Graded 300+ assignments per semester with 48-hour turnaround for 80 students");

  sec("Projects");
  row("TrojanMarket, open-source campus marketplace", "2025");
  bul([
    { t: "Built with React," },
    { t: "Python", hl: "brand" },
    { t: ", and SQL; grew to 800 student users in one semester" },
  ]);
  bul("Shipped auth, listings search, and checkout on AWS; 99.9% uptime");

  sec("Leadership");
  row("Projects Lead, USC Coding Club", "2025 – Present");
  bul("Run weekly build nights for 40 members; shipped 5 member projects to production");

  sec("Skills");
  pen.segs(
    [
      { t: "Python", hl: "brand" },
      { t: ", REST APIs, AWS, CI/CD," },
      { t: "distributed systems", hl: "teal" },
      { t: ", SQL, React, TypeScript, Git, Docker" },
    ],
    sans(7.0, { color: MUTED, lh: 10.6 * S }),
    lit
  );

  ctx.font = `500 ${6.4 * S}px Menlo`;
  ctx.fillStyle = FAINT;
  ctx.textAlign = "center";
  ctx.fillText("PAGE 1 OF 1", px + pw / 2, py + ph - 20 * S);
  ctx.textAlign = "left";
}

/* ================= the Northline posting ================= */
function drawJD(ctx, px, py, pw, ph, lit) {
  pageRect(ctx, px, py, pw, ph);
  const S = pw / 340;
  const pen = new Pen(ctx, px + 24 * S, py + 40 * S, pw - 48 * S);
  const sans = (size, extra = {}) => ({
    size: size * S,
    family: "Helvetica",
    lh: size * S * 1.65,
    ...extra,
  });

  ctx.font = `500 ${9.5 * S}px Menlo`;
  ctx.fillStyle = FAINT;
  ctx.fillText("NORTHLINE · LOS ANGELES", pen.left, pen.y);
  pen.gap(16 * S);
  pen.line("Software Engineer Intern", sans(14.5, { weight: "600", color: INK, lh: 20 * S }));
  pen.gap(2 * S);
  pen.segs(
    [
      { t: "We're looking for a Software Engineer Intern to help build" },
      { t: "distributed systems", hl: "teal" },
      { t: "that power our platform. Strong" },
      { t: "Python", hl: "brand" },
      { t: "fundamentals required." },
    ],
    sans(10.2, { color: MUTED, lh: 16.5 * S }),
    lit
  );

  pen.gap(12 * S);
  ctx.font = `500 ${9 * S}px Menlo`;
  ctx.fillStyle = FAINT;
  ctx.fillText("WHAT YOU'LL DO", pen.left, pen.y);
  pen.gap(15 * S);
  const li = (segs) =>
    pen.segs(
      [{ t: "· " }, ...(Array.isArray(segs) ? segs : [{ t: segs }])],
      sans(10.2, { color: MUTED, lh: 15.5 * S }),
      lit
    );
  li("Design and ship backend services with the platform team");
  li([{ t: "Build REST APIs in" }, { t: "Python", hl: "brand" }, { t: "alongside senior engineers" }]);
  li("Deploy on AWS through our CI/CD pipeline");
  li([{ t: "Own features end to end", hl: "coral" }, { t: ", from spec to production" }]);
  li("Write tested, reviewed, production-quality code");

  pen.gap(12 * S);
  ctx.font = `500 ${9 * S}px Menlo`;
  ctx.fillStyle = FAINT;
  ctx.fillText("WHAT WE LOOK FOR", pen.left, pen.y);
  pen.gap(15 * S);
  pen.wrap("CS fundamentals, ownership, and evidence you ship real things.", sans(10.2, { color: MUTED, lh: 15.5 * S }));

  ctx.font = `${8.5 * S}px Menlo`;
  ctx.fillStyle = FAINT;
  ctx.fillText("jobs.lever.co/northline", pen.left, py + ph - 20 * S);
}

/* ================= compose the four frames ================= */
function frame(draw) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  studio(ctx);
  draw(ctx);
  return canvas.toBuffer("image/png");
}

/* convert frames: one page, center stage */
const CPW = 1460;
const CPH = Math.round((CPW * 22) / 17);
const CPX = (W - CPW) / 2;
const CPY = (H - CPH) / 2 + 30;

writeFileSync(
  join(OUT, "convert_start.png"),
  frame((ctx) => {
    chip(ctx, W / 2, CPY - 110, "JOHN_RESUME_FINAL_V3.DOCX · SKIPPED BY ATS", DANGER, DANGER_SOFT);
    drawMessy(ctx, CPX, CPY, CPW, CPH);
  })
);
writeFileSync(
  join(OUT, "convert_end.png"),
  frame((ctx) => {
    chip(ctx, W / 2, CPY - 110, "JOHN_DOE_ACME_RESUME.PDF · ATS-READY", POSITIVE, POSITIVE_SOFT);
    drawClean(ctx, CPX, CPY, CPW, CPH, false);
  })
);

/* ats frames: posting left, tailored resume right */
const JPW = 1060;
const JPH = Math.round((JPW * 22) / 17);
const RPW = 1400;
const RPH = Math.round((RPW * 22) / 17);
const GAP = 220;
const AX = (W - (JPW + GAP + RPW)) / 2;
const JY = (H - JPH) / 2 + 60;
const RY = (H - RPH) / 2 + 30;

writeFileSync(
  join(OUT, "ats_start.png"),
  frame((ctx) => {
    chip(ctx, AX + JPW / 2, JY - 104, "THE POSTING", MUTED, "#f1f0ec");
    drawJD(ctx, AX, JY, JPW, JPH, false);
    chip(ctx, AX + JPW + GAP + RPW / 2, RY - 104, "READING THE POSTING…", MUTED, "#f1f0ec");
    drawClean(ctx, AX + JPW + GAP, RY, RPW, RPH, false);
  })
);
writeFileSync(
  join(OUT, "ats_end.png"),
  frame((ctx) => {
    chip(ctx, AX + JPW / 2, JY - 104, "THE POSTING", MUTED, "#f1f0ec");
    drawJD(ctx, AX, JY, JPW, JPH, true);
    chip(ctx, AX + JPW + GAP + RPW / 2, RY - 104, "TAILORED · 5/5 KEYWORDS PLACED", POSITIVE, POSITIVE_SOFT);
    drawClean(ctx, AX + JPW + GAP, RY, RPW, RPH, true);
  })
);

console.log("wrote 4 frames to .stills-tmp/ (3840x2160)");
console.log("downscale: node -e sharp ... or ffmpeg -vf scale=1920:1080");
