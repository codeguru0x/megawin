"use client";

import { useState } from "react";

import { MfaDisableDialog } from "./mfa-disable-dialog";
import { MfaSetupWizard } from "./mfa-setup-wizard";
import { MfaStatusCard } from "./mfa-status-card";

type MfaView = "status" | "setup";

export function MfaPage() {
  const [view, setView] = useState<MfaView>("status");
  const [disableOpen, setDisableOpen] = useState(false);

  return (
    <div>
      {view === "setup" ? (
        <MfaSetupWizard onClose={() => setView("status")} />
      ) : (
        <>
          <MfaStatusCard onSetup={() => setView("setup")} onDisable={() => setDisableOpen(true)} />
          <MfaDisableDialog open={disableOpen} onOpenChange={setDisableOpen} onSuccess={() => setView("status")} />
        </>
      )}
    </div>
  );
}
