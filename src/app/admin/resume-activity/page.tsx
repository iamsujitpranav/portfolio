import AdminGate from "@/components/admin/AdminGate";
import AdminNav from "@/components/admin/AdminNav";
import ResumeActivityDashboard from "@/components/admin/ResumeActivityDashboard";

export const metadata = { title: "Résumé Activity & Recruiter Tracking — Admin" };

export default function ResumeActivityPage() {
  return (
    <AdminGate title="Résumé Activity">
      <AdminNav active="resume-activity" />
      <ResumeActivityDashboard />
    </AdminGate>
  );
}
