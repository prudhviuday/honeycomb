import React from "react";
import { createRoot } from "react-dom/client";
import { AnalyticsScreen } from "../../src/modules/analytics/ui/AnalyticsScreen";
import "../../src/index.css";
createRoot(document.getElementById("root")!).render(
  <div className="max-w-lg mx-auto pb-8 bg-bg-primary min-h-screen text-text-primary">
    <p className="p-3 text-xs bg-amber-900">
      LOCAL PREVIEW · Synthetic test data · No live account connected
    </p>
    <AnalyticsScreen />
  </div>,
);
