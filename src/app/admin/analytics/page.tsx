import AdminGate from "@/components/admin/AdminGate";
import AdminNav from "@/components/admin/AdminNav";
import AnalyticsDashboard from "@/components/admin/AnalyticsDashboard";

export const metadata = { title: "Journey analytics — Admin" };

export default function AnalyticsPage() {
  return (
    <AdminGate title="Journey analytics">
      <AdminNav active="analytics" />
      <AnalyticsDashboard />
    </AdminGate>
  );
}
