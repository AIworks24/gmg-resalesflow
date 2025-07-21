import AdminApplications from '../../components/admin/AdminApplications';
import { withAdminAuth } from '../../providers/AdminAuthProvider';

function AdminApplicationsPage() {
  return <AdminApplications />;
}

export default withAdminAuth(AdminApplicationsPage);