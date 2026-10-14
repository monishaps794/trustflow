import { createContext, useEffect, useMemo, useState } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('trustflow_token'));
  const [role, setRole] = useState(localStorage.getItem('trustflow_role'));

  useEffect(() => {
    if (token) {
      localStorage.setItem('trustflow_token', token);
    } else {
      localStorage.removeItem('trustflow_token');
    }
  }, [token]);

  useEffect(() => {
    if (role) {
      localStorage.setItem('trustflow_role', role);
    } else {
      localStorage.removeItem('trustflow_role');
    }
  }, [role]);

  const loginAsUser = (payload) => {
    setUser(payload.user);
    setRole('USER');
    setToken(payload.token);
  };

  const loginAsAdmin = (payload) => {
    setAdmin(payload.admin);
    setRole('ADMIN');
    setToken(payload.token);
  };

  const logout = () => {
    setUser(null);
    setAdmin(null);
    setToken(null);
    setRole(null);
    localStorage.removeItem('trustflow_token');
    localStorage.removeItem('trustflow_role');
  };

  const value = useMemo(() => ({ user, admin, token, role, loginAsUser, loginAsAdmin, logout, setUser, setAdmin }), [user, admin, token, role]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
