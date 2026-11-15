import Landing from "./landing/Landing";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Kaam Ki Baat — Meeting mein bola. Repo mein bana?",
  description: "A voice teammate that remembers what your team decided, asks the leader when it doesn't know, and points to the exact line of code.",
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // Preserve existing operator bookmarks without putting their credential into
  // the public landing page or its outbound source links.
  if (params.key) {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(params)) {
      if (Array.isArray(value)) value.forEach(item => query.append(name, item));
      else if (value !== undefined) query.append(name, value);
    }
    redirect(`/board?${query.toString()}`);
  }
  return <Landing />;
}
