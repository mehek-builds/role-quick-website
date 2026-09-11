export const MANAGED_LIVE_FRAME_POLL_MS = 2500;

export type ManagedLiveFrameView = {
  identity: string | null;
  sequence: number | null;
  objectUrl: string | null;
};

export const EMPTY_MANAGED_LIVE_FRAME_VIEW: ManagedLiveFrameView = {
  identity: null,
  sequence: null,
  objectUrl: null,
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function managedLiveFrameIdentity(input: {
  packetId?: string | null;
  runId?: string | null;
  frameId?: string | null;
  status?: string | null;
  available?: boolean;
}): string | null {
  const packetId = input.packetId?.trim();
  const runId = input.runId?.trim();
  const frameId = input.frameId?.trim();
  return input.status === "filling" && input.available === true && packetId && runId && frameId && UUID.test(frameId)
    ? `${packetId}:${runId}:${frameId}`
    : null;
}

export function acceptManagedLiveFrame(
  current: ManagedLiveFrameView,
  identity: string,
  sequence: number,
  objectUrl: string,
): { view: ManagedLiveFrameView; revoke: string[] } {
  if (current.identity === identity && current.sequence !== null && sequence <= current.sequence) {
    return { view: current, revoke: [objectUrl] };
  }
  return {
    view: { identity, sequence, objectUrl },
    revoke: current.objectUrl ? [current.objectUrl] : [],
  };
}

export function shouldAcceptManagedLiveFrame(
  current: ManagedLiveFrameView,
  identity: string,
  sequence: number,
): boolean {
  return current.identity !== identity || current.sequence === null || sequence > current.sequence;
}

export function clearManagedLiveFrame(current: ManagedLiveFrameView): {
  view: ManagedLiveFrameView;
  revoke: string[];
} {
  return {
    view: EMPTY_MANAGED_LIVE_FRAME_VIEW,
    revoke: current.objectUrl ? [current.objectUrl] : [],
  };
}
