import { syncDashboard } from "../lib/eval/dashboard-store";
syncDashboard().then(data => console.log(`Evaluations saved and read back: ${data.calls.length} calls, ${data.syncedAt}; ${data.warnings.length} availability warnings.`))
  .catch(() => { console.error("Evaluation sync failed; retained prior results. Check private configuration/provider availability."); process.exitCode = 1; });
