import { Header } from "@/components/Header";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          404
        </p>
        <h1 className="mt-4 text-[32px] font-[450] tracking-[-0.02em] text-ink">
          This page does not exist.
        </h1>
        <a
          href="/"
          className="mt-8 rounded-full bg-brand px-7 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Back to RoleQuick
        </a>
      </main>
    </div>
  );
}
