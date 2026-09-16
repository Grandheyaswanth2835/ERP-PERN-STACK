import React, { createContext, useContext, useState } from 'react';
import { api, setToken, clearToken, setUser, getUser } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(getUser());

  async function login(username, password) {
    const data = await api('POST', '/auth/login', { username, password });
    setToken(data.token);
    setUser(data.user);
    setUserState(data.user);
    return data.user;
  }

  function logout() {
    clearToken();
    localStorage.removeItem('erp_user');
    setUserState(null);
  }

  const isAdmin = user && user.role === 'ADMIN';
  const isSales = user && user.role === 'SALES_USER';

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin, isSales }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}