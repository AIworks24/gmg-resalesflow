import StaffProfilePage from '../../components/admin/StaffProfilePage';
import { withAdminAuth } from '../../providers/AdminAuthProvider';

function AdminProfilePage() {
  return <StaffProfilePage />;
}

export default withAdminAuth(AdminProfilePage);