const BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  return handleResponse(res);
}

// Upload multipart (FormData) — sem Content-Type manual: o browser define o
// boundary do multipart sozinho: definir a header aqui quebra o parse no multer.
async function upload(path: string, formData: FormData) {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: formData });
  return handleResponse(res);
}

// Download binário (ex.: minuta .docx gerada) — resposta não é JSON em caso
// de sucesso, então não passa por handleResponse; o corpo de erro (quando
// !res.ok) ainda é JSON, igual ao resto da API.
async function download(path: string): Promise<{ blob: Blob; filename: string }> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = '/login';
    throw new Error('Sessão expirada');
  }
  if (!res.ok) {
    const text = await res.text();
    let message: string | undefined;
    try {
      const data = JSON.parse(text);
      message = Array.isArray(data?.message) ? data.message.join('; ') : data?.message;
    } catch {
      // corpo de erro não veio como JSON — usa a mensagem genérica abaixo
    }
    throw new Error(message || 'Erro ao gerar documento');
  }
  const disposition = res.headers.get('Content-Disposition') || '';
  const nomeNaHeader = disposition.match(/filename="([^"]+)"/)?.[1];
  return { blob: await res.blob(), filename: nomeNaHeader || 'documento.docx' };
}

// Dispara o download de um blob já obtido — cria um link temporário, clica
// nele e limpa em seguida. Mesmo padrão usado por qualquer download
// client-side sem endpoint dedicado de "servir arquivo estático".
export function salvarArquivo(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function handleResponse(res: Response) {
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = '/login';
    throw new Error('Sessão expirada');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = Array.isArray(data?.message) ? data.message.join('; ') : data?.message;
    throw new Error(message || 'Erro na requisição');
  }
  return data;
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: unknown) => request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: (path: string, body?: unknown) => request(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: (path: string) => request(path, { method: 'DELETE' }),
  upload: (path: string, formData: FormData) => upload(path, formData),
  download: (path: string) => download(path),
};
