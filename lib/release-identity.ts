const COMPLETE_GIT_SHA = /^[a-f0-9]{40}$/;

export type WebsiteReleaseIdentity = {
  ok: true;
  service: "litos-website";
  version: string;
  revision: string;
  build_time: string;
  identity_complete: boolean;
};

export function websiteReleaseIdentity(input: {
  version: string | undefined;
  revision: string | undefined;
  buildTime: string | undefined;
}): WebsiteReleaseIdentity {
  const version = input.version?.trim();
  if (!version) throw new Error("Website release version is missing.");

  const revision = input.revision?.trim().toLowerCase();
  if (!revision || (revision !== "local" && !COMPLETE_GIT_SHA.test(revision))) {
    throw new Error("Website release revision is missing or invalid.");
  }

  const buildTime = input.buildTime?.trim();
  if (!buildTime || Number.isNaN(Date.parse(buildTime))) {
    throw new Error("Website release build time is missing or invalid.");
  }
  const canonicalBuildTime = new Date(buildTime).toISOString();
  if (canonicalBuildTime !== buildTime) {
    throw new Error("Website release build time is not a canonical ISO instant.");
  }

  return {
    ok: true,
    service: "litos-website",
    version,
    revision,
    build_time: canonicalBuildTime,
    identity_complete: COMPLETE_GIT_SHA.test(revision),
  };
}
