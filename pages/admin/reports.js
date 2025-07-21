import AdminReports from '../../components/admin/AdminReports';
import { withAdminAuth } from '../../providers/AdminAuthProvider';

function AdminReportsPage() {
  return <AdminReports />;
}

export default withAdminAuth(AdminReportsPage);