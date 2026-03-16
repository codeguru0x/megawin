"use client";

import { useState } from "react";

import { MfaStatusCard } from "./mfa-status-card";
import { MfaSetupWizard } from "./mfa-setup-wizard";
import { MfaDisableDialog } from "./mfa-disable-dialog";

type MfaView = "status" | "setup";

export function MfaPage() {
  const [view, setView] = useState<MfaView>("status");
  const [disableOpen, setDisableOpen] = useState(false);

  if (view === "setup") {
    return <MfaSetupWizard onClose={() => setView("status")} />;
  }

  return (
    <>
      <MfaStatusCard onSetup={() => setView("setup")} onDisable={() => setDisableOpen(true)} />
      <MfaDisableDialog
        open={disableOpen}
        onOpenChange={setDisableOpen}
        onSuccess={() => setView("status")}
      />
    </>
  );
}
