"use client";

import * as React from "react";
import { forwardRef, useImperativeHandle } from "react";
import type { SetupStepHandle, SetupStepProps } from "@/components/admin/setup/steps";
import { InviteTreesManager } from "@/components/admin/InviteTreesManager";

/**
 * Step 5: invite trees. Reuses the canonical InviteTreesManager (same creation,
 * editing and link generation as the Invite Trees workspace) so there is no
 * divergent, simplified tree implementation. Trees persist themselves on
 * create/edit, so this step's save() is a no-op.
 */
export const StepTrees = forwardRef<
  SetupStepHandle,
  SetupStepProps & { onTreesChanged?: (count: number) => void }
>(function StepTrees({ event, onTreesChanged }, ref) {
  // Trees persist through the manager's own explicit create/edit actions, so
  // this step never holds unsaved wizard-level state.
  useImperativeHandle(ref, () => ({ save: async () => true, isDirty: () => false }), []);

  return (
    <InviteTreesManager eventId={event.id} event={event} onTreesChanged={onTreesChanged} />
  );
});
