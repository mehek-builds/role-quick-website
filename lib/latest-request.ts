export type LatestRequestHandlers<Value> = {
  onStart: () => void;
  onSuccess: (value: Value) => void;
  onError: (reason: unknown) => void;
  onSettled: () => void;
};

export type LatestRequestOptions = {
  supersede?: boolean;
};

type RetryFocusTarget = {
  focus: (options?: FocusOptions) => void;
};

export function restoreFocusAfterRetry(
  targetId: string,
  schedule: (callback: () => void) => unknown = requestAnimationFrame,
  findTarget: (id: string) => RetryFocusTarget | null = (id) => document.getElementById(id),
) {
  schedule(() => findTarget(targetId)?.focus({ preventScroll: true }));
}

/**
 * Coordinates retryable reads by resource. A normal retry is ignored while that resource already
 * has a request in flight. A refresh caused by a newer mutation may explicitly supersede it, and
 * callbacks from the older generation then become no-ops.
 */
export function createLatestRequestCoordinator<Resource>() {
  const generations = new Map<Resource, number>();
  const pending = new Set<Resource>();

  return {
    isPending(resource: Resource) {
      return pending.has(resource);
    },

    async run<Value>(
      resource: Resource,
      request: () => Promise<Value>,
      handlers: LatestRequestHandlers<Value>,
      { supersede = false }: LatestRequestOptions = {},
    ): Promise<"blocked" | "settled"> {
      if (pending.has(resource) && !supersede) return "blocked";

      const generation = (generations.get(resource) ?? 0) + 1;
      generations.set(resource, generation);
      pending.add(resource);
      handlers.onStart();

      try {
        const value = await request();
        if (generations.get(resource) === generation) handlers.onSuccess(value);
      } catch (reason) {
        if (generations.get(resource) === generation) handlers.onError(reason);
      } finally {
        if (generations.get(resource) === generation) {
          pending.delete(resource);
          handlers.onSettled();
        }
      }

      return "settled";
    },
  };
}

/**
 * Serializes mutations that replace the same underlying record.
 *
 * The active marker is written before the operation starts, so two handlers reached in the same
 * event loop turn cannot both pass. This is intentionally separate from UI pending state, which is
 * committed asynchronously and is therefore not a safe lock.
 */
export function createExclusiveMutationCoordinator<Mutation>() {
  let active: Mutation | null = null;

  return {
    activeMutation() {
      return active;
    },

    isActive() {
      return active !== null;
    },

    async run(
      mutation: Mutation,
      operation: () => Promise<void>,
    ): Promise<"blocked" | "settled"> {
      if (active !== null) return "blocked";
      active = mutation;
      try {
        await operation();
      } finally {
        if (active === mutation) active = null;
      }
      return "settled";
    },
  };
}
