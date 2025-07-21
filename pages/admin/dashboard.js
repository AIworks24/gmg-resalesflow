import AdminDashboardMetrics from '../../components/admin/AdminDashboardMetrics';
import { withAdminAuth } from '../../providers/AdminAuthProvider';

function AdminDashboardPage() {
  return <AdminDashboardMetrics />;
}

export default withAdminAuth(AdminDashboardPage);
