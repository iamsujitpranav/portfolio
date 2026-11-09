import AdminGate from "@/components/admin/AdminGate";
import AdminNav from "@/components/admin/AdminNav";
import ResumeVersionManager from "@/components/admin/ResumeVersionManager";

export const metadata = { title: "Résumé Versions — Admin" };

export default function ResumeAdminPage() {
  return (
    <AdminGate title="Résumé Versions">
      <AdminNav active="resume" />
      <ResumeVersionManager />
    </AdminGate>
  );
}
