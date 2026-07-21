"use client";

import { useState } from "react";

export default function ControlledPortalSubmission() {
  const [submitted, setSubmitted] = useState(false);
  if (submitted) {
    return <main className="min-h-screen bg-[#f7f7f3] px-6 py-16"><section className="mx-auto max-w-2xl rounded-2xl border border-[#d8d8d0] bg-white p-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#e8f5e9] text-2xl text-[#24713b]">✓</div><h1 className="mt-5 text-3xl font-semibold text-[#151512]">Thank you. Your application was received.</h1><p className="mt-3 text-[#63635d]">This is a controlled Litos verification portal. No employer received this application.</p><p className="mt-5 font-mono text-sm text-[#24713b]">Confirmation ID: LITOS-QA-2027</p></section></main>;
  }
  return <main className="min-h-screen bg-[#f7f7f3] px-6 py-12"><form data-litos-controlled-portal onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }} className="mx-auto max-w-2xl rounded-2xl border border-[#d8d8d0] bg-white p-8"><p className="font-mono text-xs uppercase tracking-wider text-[#4267d5]">Controlled verification portal</p><h1 className="mt-2 text-3xl font-semibold text-[#151512]">Software Engineering Intern, Summer 2027</h1><p className="mt-2 text-sm text-[#63635d]">This form is used only to verify the Litos runner without contacting an employer.</p><div className="mt-8 grid gap-5 sm:grid-cols-2"><Field id="first_name" label="First name" required /><Field id="last_name" label="Last name" required /><Field id="email" label="Email" type="email" required /><Field id="phone" label="Phone" /><Field id="candidate-location" label="Location" /><label className="block text-sm text-[#31312d]">Resume<input id="resume" name="job_application[resume]" type="file" accept="application/pdf" required className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2" /></label></div><button type="submit" className="mt-8 rounded-full bg-[#4267d5] px-6 py-3 font-medium text-white">Submit application</button></form></main>;
}

function Field({ id, label, type = "text", required = false }: { id: string; label: string; type?: string; required?: boolean }) {
  return <label className="block text-sm text-[#31312d]">{label}<input id={id} name={id} type={type} required={required} className="mt-2 block w-full rounded-lg border border-[#cfcfc6] px-3 py-2" /></label>;
}
