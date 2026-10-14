import { Navigate } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

export default function ProtectedRoute({ children, requiredRole }) {
  const { token, role } = useContext(AuthContext);

  if (!token) return <Navigate to="/login" replace />;
  if (requiredRole && role !== requiredRole) return <Navigate to={role === 'ADMIN' ? '/admin' : '/user'} replace />;

  return children;
}
