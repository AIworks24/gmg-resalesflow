import AdminPropertiesManagement from '../../components/admin/AdminPropertiesManagement';
import { withAdminAuth } from '../../providers/AdminAuthProvider';

function AdminPropertiesPage() {
  return <AdminPropertiesManagement />;
}

export default withAdminAuth(AdminPropertiesPage);