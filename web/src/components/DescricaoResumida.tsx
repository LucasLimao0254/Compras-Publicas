import { useState } from 'react';

// Descrições de item de homologação costumam ter um parágrafo inteiro de
// especificação técnica. Em listas e grades, mostra só as 2 primeiras linhas,
// com "ver mais" para expandir (o texto completo fica no title também).
const LIMITE = 110;

export function DescricaoResumida({ texto }: { texto: string }) {
  const [aberta, setAberta] = useState(false);
  if (texto.length <= LIMITE) return <span>{texto}</span>;
  return (
    <span style={{ display: 'block' }}>
      <span className={`descricao-resumida${aberta ? ' aberta' : ''}`} title={aberta ? undefined : texto}>{texto}</span>
      <button type="button" className="ver-mais" onClick={(e) => { e.stopPropagation(); setAberta((v) => !v); }} aria-expanded={aberta}>
        {aberta ? 'ver menos' : 'ver mais'}
      </button>
    </span>
  );
}
