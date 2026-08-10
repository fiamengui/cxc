# Checklist comercial — Caixa no Controle 1.1.0

## Código e qualidade

- [x] versões npm, Cargo e Tauri sincronizadas em 1.1.0;
- [x] lint, tipagem, Vitest, Playwright, Rust fmt/clippy/test e builds do backend aprovados;
- [x] `npm audit --omit=dev` sem vulnerabilidades conhecidas no app e backend;
- [x] trial 50ª/51ª, preço server-side, challenge replay, assinatura adulterada, webhook inválido e grace testados;
- [x] manual DOCX/PDF atualizado e 13 páginas inspecionadas visualmente;
- [x] CSP estrita, ACL mínima e release profile Rust aplicados.

## Infraestrutura obrigatória antes da venda

- [ ] PostgreSQL de produção implantado e migrado;
- [ ] backend publicado em domínio HTTPS real;
- [ ] planos mensal/anual criados no Mercado Pago e IDs configurados;
- [ ] webhook de produção registrado e testado ponta a ponta;
- [ ] token, webhook secret e chave privada guardados em secret manager/KMS;
- [ ] binário recompilado com `CNC_COMMERCIAL_API_URL` real;
- [ ] certificado Authenticode instalado e executável/MSI/NSIS assinados;
- [ ] smoke test em Windows limpo com pagamento sandbox e renovação offline;
- [ ] hashes do pacote final publicado conferidos após assinatura.

Resultado em 7 de agosto de 2026: **candidato técnico aprovado; publicação comercial bloqueada até concluir os itens externos acima**.
