import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { requireTeamMember } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Connecté mais pas membre de l'équipe : aucun accès aux données.
  if (!(await requireTeamMember())) redirect("/acces-refuse");
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-10">{children}</main>
    </div>
  );
}
