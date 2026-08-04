import AdminGate from "@/components/admin/AdminGate";
import AnalyticsDashboard from "@/components/admin/AnalyticsDashboard";

export const metadata = { title: "Journey analytics — Admin" };

export default function AnalyticsPage() {
  return (
    <AdminGate title="Journey analytics">
      <AnalyticsDashboard />
    </AdminGate>
  );
}
