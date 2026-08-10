import { LoadingOrb, ShimmerRows } from "@/components/app/ui";

export default function BrowseJobsLoading() {
  return (
    <main className="mx-auto min-h-svh w-full max-w-[1060px] px-6 pb-28 pt-32" aria-busy="true">
      <LoadingOrb label="Loading job results" />
      <div className="mt-8"><ShimmerRows rows={6} /></div>
    </main>
  );
}
