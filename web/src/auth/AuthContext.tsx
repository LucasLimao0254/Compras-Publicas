import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  tipoUsuario: 'ADMIN' | 'PADRAO';
  permissoes: string[];
}

interface Tenant {
  id: string;
  codigo: number;
  nome: string;
}

interface AuthContextValue {
  usuario: Usuario | null;
  tenant: Tenant | null;
  login: (email: string, senha: string, tenantCodigo: number) => Promise<void>;
  logout: () => void;
  temPermissao: (recurso: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(() => {
    const raw = localStorage.getItem('usuario');
    return raw ? JSON.parse(raw) : null;
  });
  const [tenant, setTenant] = useState<Tenant | null>(() => {
    const raw = localStorage.getItem('tenant');
    return raw ? JSON.parse(raw) : null;
  });

  async function login(email: string, senha: string, tenantCodigo: number) {
    const data = await api.post('/auth/login', { email, senha, tenantCodigo });
    localStorage.setItem('token', data.accessToken);
    localStorage.setItem('usuario', JSON.stringify(data.usuario));
    localStorage.setItem('tenant', JSON.stringify(data.tenant));
    setUsuario(data.usuario);
    setTenant(data.tenant);
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    localStorage.removeItem('tenant');
    setUsuario(null);
    setTenant(null);
  }

  function temPermissao(recurso: string) {
    if (!usuario) return false;
    if (usuario.tipoUsuario === 'ADMIN') return true;
    return usuario.permissoes.includes(recurso);
  }

  return (
    <AuthContext.Provider value={{ usuario, tenant, login, logout, temPermissao }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
