type ReviewPacket = {
  spec?: { _review?: unknown };
};

export function reviewablePackets<T extends ReviewPacket>(packets: T[]): T[] {
  return packets.filter((packet) => Boolean(packet.spec?._review));
}

export function portalName(portalUrl: string): string {
  const hostname = new URL(portalUrl).hostname.toLowerCase();
  if (hostname.includes("greenhouse")) return "Greenhouse";
  if (hostname.includes("lever")) return "Lever";
  if (hostname.includes("ashby")) return "Ashby";
  if (hostname.includes("workday")) return "Workday";
  if (hostname.includes("linkedin")) return "LinkedIn";
  return "Company portal";
}
