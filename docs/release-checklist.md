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

- [x] PostgreSQL Neon de produção implantado, migrado e respondendo em `/health/database`;
- [x] backend publicado em domínio HTTPS gerenciado pelo Render e respondendo em `/health`;
- [x] referências recorrentes mensal/anual criadas no Mercado Pago e IDs configurados para reconciliação;
- [ ] webhook de produção recebido e validado ponta a ponta a partir de um pagamento hospedado concluído;
- [x] token, webhook secret e chave privada injetados como Secrets do Render, sem inclusão na imagem ou no repositório;
- [x] binário recompilado com `CNC_COMMERCIAL_API_URL` apontando para a API HTTPS publicada;
- [ ] certificado Authenticode instalado e executável/MSI/NSIS assinados;
- [ ] smoke test em Windows limpo com pagamento sandbox e renovação offline;
- [ ] hashes do pacote final publicado conferidos após assinatura.

## Evidências de 12 de agosto de 2026

- deploy Render `ea28788` concluído com sucesso;
- API e conexão PostgreSQL retornando `ok`;
- URL HTTPS publicada encontrada no executável compilado;
- matriz imediata Mercado Pago repetida: `pending`, `authorized`, recusa e `cancelled`;
- 20/20 testes do backend, lint, tipagem e build aprovados;
- instaladores beta gerados e hashes atuais conferidos, ainda sem assinatura Authenticode;
- smoke isolado de instalação aprovado em Windows 11 Enterprise descartável em 19 de agosto de 2026: hashes, NSIS, inicialização limpa, manual embarcado, extração MSI e desinstalação;
- renovação, reembolso e chargeback continuam cobertos por testes, mas a evidência externa depende respectivamente de fatura futura, pagamento capturado e evento emitido pelo provedor.

Resultado em 12 de agosto de 2026: **infraestrutura beta gratuita operacional. A venda pública permanece bloqueada pelo webhook ponta a ponta, Authenticode, smoke test em Windows realmente limpo e hashes posteriores à assinatura**. O plano gratuito do Render pode suspender por inatividade e não oferece SLA comercial.
