"use client";

import { createElement, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

type Board = "greenhouse" | "lever" | "ashby" | "smartrecruiters";

export default function ControlledPortalSubmission() {
  return <Suspense fallback={<main className="min-h-screen bg-[#f7f7f3]" />}><PortalForm /></Suspense>;
}

function PortalForm() {
  const searchParams = useSearchParams();
  const rawBoard = searchParams.get("board");
  const board: Board = rawBoard === "lever" || rawBoard === "ashby" || rawBoard === "smartrecruiters"
    ? rawBoard
    : "greenhouse";
  const caseId = (searchParams.get("case") ?? `${board}-01`).replace(/[^a-z0-9-]/gi, "").slice(0, 32) || `${board}-01`;
  const confirmationId = `LITOS-QA-${caseId.toUpperCase()}`;
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return <main className="min-h-screen bg-[#f7f7f3] px-6 py-16"><section className="mx-auto max-w-2xl rounded-2xl border border-[#d8d8d0] bg-white p-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#e8f5e9] text-2xl text-[#24713b]">✓</div><h1 className="mt-5 text-3xl font-semibold text-[#151512]">Thank you. Your application was received.</h1><p className="mt-3 text-[#63635d]">This is a controlled Litos verification portal. No employer received this application.</p><p className="mt-5 font-mono text-sm text-[#24713b]">Confirmation ID: {confirmationId}</p></section></main>;
  }

  return <main className="min-h-screen bg-[#f7f7f3] px-6 py-12"><form data-litos-controlled-portal data-board={board} onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }} className="mx-auto max-w-2xl rounded-2xl border border-[#d8d8d0] bg-white p-8"><p className="font-mono text-xs uppercase tracking-wider text-[#4267d5]">Controlled {board} verification portal</p><h1 className="mt-2 text-3xl font-semibold text-[#151512]">Software Engineering Intern, Summer 2027</h1><p className="mt-2 text-sm text-[#63635d]">This form exercises the production {board} adapter without contacting an employer.</p><div className="mt-8 grid gap-5 sm:grid-cols-2">{board === "greenhouse" && <GreenhouseFields />}{board === "lever" && <LeverFields />}{board === "ashby" && <AshbyFields />}{board === "smartrecruiters" && <SmartRecruitersFields />}</div><button type="submit" className="mt-8 rounded-full bg-[#4267d5] px-6 py-3 font-medium text-white">Submit application</button></form></main>;
}

function GreenhouseFields() {
  return <><Field name="job_application[first_name]" label="First name" required /><Field name="job_application[last_name]" label="Last name" required /><Field id="email" label="Email" type="email" required /><Field id="phone" label="Phone" /><Field id="candidate-location" label="Location" /><FileField id="resume" name="job_application[resume]" /></>;
}

function LeverFields() {
  return <><Field name="name" label="Full name" required /><Field name="email" label="Email" type="email" required /><Field name="phone" label="Phone" /><Field name="urls[LinkedIn]" label="LinkedIn" /><Field name="urls[GitHub]" label="GitHub" /><Field name="urls[Portfolio]" label="Portfolio" /><FileField name="resume" /></>;
}

function AshbyFields() {
  return <><Field name="_systemfield_name" label="Full name" required /><Field name="_systemfield_email" label="Email" type="email" required /><Field name="_systemfield_phone" label="Phone" /><Field name="_systemfield_location" label="Location" /><Field name="_systemfield_linkedin" label="LinkedIn profile" /><Field name="github-profile" label="GitHub profile" /><Field name="portfolio-url" label="Portfolio" /><FileField name="resume" /></>;
}

function SmartRecruitersFields() {
  const upload = createElement("spl-dropzone", { "data-test": "resume-upload" }, <FileField name="resume" bare />);
  return <><Field id="first-name-input" label="First name" required /><Field id="last-name-input" label="Last name" required /><Field id="email-input" label="Email" type="email" required /><Field id="confirm-email-input" label="Confirm email" type="email" required /><Field name="phone" label="Phone number" ariaLabel="Phone number" /><Field id="linkedin-input" label="LinkedIn" /><Field id="website-input" label="Website" />{upload}</>;
}

function Field({ id, name, label, type = "text", required = false, ariaLabel }: { id?: string; name?: string; label: string; type?: string; required?: boolean; ariaLabel?: string }) {
  return <label className="block text-sm text-[#31312d]">{label}<input id={id} name={name ?? id} type={type} required={required} aria-label={ariaLabel} className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2" /></label>;
}

function FileField({ id, name, bare = false }: { id?: string; name: string; bare?: boolean }) {
  const input = <input id={id} name={name} type="file" accept="application/pdf" required className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2" />;
  return bare ? input : <label className="block text-sm text-[#31312d]">Resume{input}</label>;
}
