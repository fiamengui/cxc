# Aceite da Fase 10 — Distribuição

## Matriz de entrega

| Item | Evidência |
|---|---|
| Instalador profissional | NSIS e MSI 1.0.1 em português, EULA, ícones, atalhos, desinstalador e WebView2 offline |
| Preservação de dados | atualização não remove banco; NSIS pergunta separadamente antes da remoção permanente |
| Manual | guia em Markdown, DOCX acessível e PDF embarcado no aplicativo |
| Dados demonstrativos | pacote transacional completo, identificado e removível, com teste Rust em banco temporário |
| Release | pacote versionado, notas, manifesto, SHA-256 e estado de assinatura |
| Checklist final | critérios do escopo, qualidade, smoke test e documentação de máquina limpa |

## Critério de fechamento

A fase só pode ser marcada como 100% após todos os comandos de qualidade, o build Tauri, a validação visual do manual, o smoke test do NSIS e a validação administrativa do MSI terminarem sem falhas. O certificado comercial de assinatura é condicional pelo próprio escopo; na ausência dele, o release deve declarar claramente `unsigned` e distribuir checksums SHA-256.
