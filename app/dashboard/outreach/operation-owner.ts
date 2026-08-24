"use client";

import { createContext, createElement, useContext, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

export type OutreachOperation = "contact-discovery" | "draft-generation" | "edited-save" | "manual-save";

export type OutreachOperationSnapshot = Readonly<{
  activeOperation: OutreachOperation | null;
  draftsSettledRevision: number;
}>;

export type OutreachOperationLease = {
  settle: () => void;
};

export type OutreachOperationOwner = {
  acquire: (operation: OutreachOperation) => OutreachOperationLease | null;
  applicationIds: Map<string, string>;
  contactOperationIds: Map<string, string>;
  draftOperationIds: Map<string, string>;
  getSnapshot: () => OutreachOperationSnapshot;
  subscribe: (listener: () => void) => () => void;
};

const DRAFT_MUTATIONS = new Set<OutreachOperation>([
  "draft-generation",
  "edited-save",
  "manual-save",
]);

/**
 * Owns Outreach's one mutation lane outside any route page instance.
 *
 * Acquisition updates the internal snapshot synchronously. That makes it the actual lock, rather
 * than relying on a React render that may not commit until after another click handler has run.
 * A lease remains active when the initiating page unsubscribes, so navigation cannot expose a
 * second request while the first server operation is still in flight.
 */
export function createOutreachOperationOwner(): OutreachOperationOwner {
  let snapshot: OutreachOperationSnapshot = Object.freeze({
    activeOperation: null,
    draftsSettledRevision: 0,
  });
  let activeLeaseId: number | null = null;
  let nextLeaseId = 0;
  const listeners = new Set<() => void>();

  const publish = (next: OutreachOperationSnapshot) => {
    snapshot = Object.freeze(next);
    for (const listener of listeners) listener();
  };

  return {
    applicationIds: new Map<string, string>(),
    contactOperationIds: new Map<string, string>(),
    draftOperationIds: new Map<string, string>(),

    getSnapshot() {
      return snapshot;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    acquire(operation) {
      if (activeLeaseId !== null) return null;
      const leaseId = ++nextLeaseId;
      activeLeaseId = leaseId;
      publish({
        activeOperation: operation,
        draftsSettledRevision: snapshot.draftsSettledRevision,
      });

      let settled = false;
      return {
        settle() {
          if (settled) return;
          settled = true;
          if (activeLeaseId !== leaseId) return;
          activeLeaseId = null;
          publish({
            activeOperation: null,
            draftsSettledRevision: snapshot.draftsSettledRevision + (DRAFT_MUTATIONS.has(operation) ? 1 : 0),
          });
        },
      };
    },
  };
}

const OutreachOperationContext = createContext<OutreachOperationOwner | null>(null);
const MISSING_OWNER_SNAPSHOT: OutreachOperationSnapshot = Object.freeze({
  activeOperation: null,
  draftsSettledRevision: 0,
});
const subscribeWithoutOwner = () => () => {};
const getSnapshotWithoutOwner = () => MISSING_OWNER_SNAPSHOT;

export function OutreachOperationProvider({ children }: { children: ReactNode }) {
  const [owner] = useState(createOutreachOperationOwner);
  return createElement(OutreachOperationContext.Provider, { value: owner }, children);
}

export function useOutreachOperationOwner() {
  const owner = useContext(OutreachOperationContext);
  const snapshot = useSyncExternalStore(
    owner?.subscribe ?? subscribeWithoutOwner,
    owner?.getSnapshot ?? getSnapshotWithoutOwner,
    owner?.getSnapshot ?? getSnapshotWithoutOwner,
  );
  if (!owner) throw new Error("useOutreachOperationOwner must be used within OutreachOperationProvider");
  return { owner, ...snapshot };
}
