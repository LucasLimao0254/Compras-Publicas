import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@demo.gov.br');
  const [senha, setSenha] = useState('demo123');
  const [tenantCodigo, setTenantCodigo] = useState('1');
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      await login(email, senha, Number(tenantCodigo));
      navigate('/');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao entrar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 clamp(40px, 8vw, 120px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 56 }}>
          <i className="ph-fill ph-scales" style={{ fontSize: 22, color: 'var(--color-accent)' }} />
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 17, letterSpacing: '-0.01em' }}>Compras Públicas</span>
        </div>
        <h1 style={{ fontSize: 40, margin: '0 0 12px', letterSpacing: '-0.02em' }}>Entre com sua<br />conta do município</h1>
        <p className="text-muted" style={{ fontSize: 14, margin: '0 0 40px', maxWidth: '38ch' }}>
          Contratos, atas, ordens de compra e saldo em um só lugar. Acesso por município.
        </p>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 340 }}>
          <div className="field">
            <label>Código do município</label>
            <input className="input num" value={tenantCodigo} onChange={(e) => setTenantCodigo(e.target.value)} required />
          </div>
          <div className="field">
            <label>E-mail</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Senha</label>
            <input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </div>
          {erro && <div style={{ fontSize: 12.5, color: 'var(--color-critical)' }}>{erro}</div>}
          <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
            <i className="ph ph-arrow-right" />
          </button>
          <div style={{ fontSize: 11.5, color: 'color-mix(in srgb, var(--color-text) 42%, transparent)', marginTop: 4 }}>
            Demonstração — código 1, admin@demo.gov.br / demo123
          </div>
        </form>
      </div>

      <div style={{ background: 'linear-gradient(150deg, var(--color-section) 0%, var(--color-bg) 72%)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(520px 400px at 78% 22%, color-mix(in srgb, var(--color-section-glow) 70%, transparent), transparent 70%)' }} />
        <div style={{ position: 'absolute', left: 56, right: 56, bottom: 56 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-accent-300)', marginBottom: 14 }}>Lei 14.133/2021</div>
          <div style={{ fontSize: 20, lineHeight: 1.4, maxWidth: '32ch', color: 'var(--color-neutral-200)' }}>
            Saldo derivado a cada leitura. Nenhuma ordem é emitida acima do que o contrato ainda comporta.
          </div>
        </div>
      </div>
    </div>
  );
}
