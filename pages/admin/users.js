import AdminUsersManagement from '../../components/admin/AdminUsersManagement';
import { withAdminAuth } from '../../providers/AdminAuthProvider';

function AdminUsersPage() {
  return <AdminUsersManagement />;
}

export default withAdminAuth(AdminUsersPage); 