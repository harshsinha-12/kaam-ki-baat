import { Explorer } from "./Explorer";

export const metadata = { title: "Code graph — Kaam Ki Baat", description: "Search this repository in plain words and see how the Code Navigator finds the answer." };

export const dynamic = "force-dynamic";

export default function GraphPage() {
  // Public sample graph is statically built; make its age explicit when deploys move on.
  return <Explorer deployedSha={process.env.VERCEL_GIT_COMMIT_SHA} />;
}
