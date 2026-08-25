import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role) && user.role !== 'owner') {
    return (
      <div className="empty-state" style={{ paddingTop: 80 }}>
        You don't have permission to view this page.
      </div>
    );
  }
  return children;
}
