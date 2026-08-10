# Checklist beta — CaixaSimples - Bratec 1.2.0-beta.1

## Código e qualidade

- [x] versões npm, Cargo, backend e Tauri sincronizadas em 1.2.0-beta.1;
- [x] lint, tipagem, Vitest, Playwright, Rust fmt/clippy/test e builds do backend aprovados;
- [x] `npm audit --omit=dev` sem vulnerabilidades conhecidas no app e backend;
- [x] trial 50ª/51ª, preço server-side, challenge replay, assinatura adulterada, webhook inválido e grace testados;
- [x] manual DOCX/PDF atualizado e 13 páginas inspecionadas visualmente;
- [x] CSP estrita, ACL mínima e release profile Rust aplicados.
- [x] beta limitada a cinco convites, entitlement BETA e administração mínima testados;
- [x] migration 0001 + 0002 validada em PostgreSQL 17 vazio e reaplicada sem duplicidade;
- [x] pipeline MSIX validado com MakeAppx usando identidade técnica não distribuível.

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

Resultado em 10 de agosto de 2026: **código da beta aprovado; implantação e release final bloqueadas somente pelos itens externos acima e pelo smoke test em Windows limpo**.
