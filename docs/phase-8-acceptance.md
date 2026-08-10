# Aceite técnico — Fase 8

**Produto:** Caixa no Controle — Essencial 1.0  
**Data:** 05/08/2026  
**Resultado:** aprovado — Fase 8 concluída em 100%

## Escopo entregue

| Área | Evidência de conclusão |
| --- | --- |
| Backup manual | Arquivo `.cncbak` com banco, configurações, logotipo opcional, manifesto, versão, data e SHA-256 |
| Proteção | Senha opcional; chave derivada por Argon2id; criptografia autenticada XChaCha20-Poly1305; senha ausente do arquivo e do banco |
| Automação | Frequência diária, semanal, mensal ou desativada; pasta local; execução quando vencida; retenção entre 1 e 120 |
| Histórico | Sucesso/falha, tipo manual/automático/preventivo, caminho, proteção, tamanho e data |
| Restauração | Inspeção, senha, empresa/data/versão, confirmação, cópia preventiva, migrações, integridade, rollback e auditoria |
| Licença | Ed25519 offline, edição, cliente, versão principal, instalação e canal de suporte |
| Diagnóstico | `.cncdiag` com metadados técnicos e até três logs recentes limitados; nenhum banco financeiro |
| Atualização | `.cncupd` assinado, SemVer, resumo, licença, migração mínima, SHA-256, backup prévio e registro da versão aplicada |
| Privacidade | Sem telemetria, upload ou compartilhamento automático; diagnóstico somente por ação explícita |
| Persistência | Migração 0010 para política, histórico de backup e atualizações |

## Regras críticas comprovadas

- a senha protege confidencialidade e autenticidade, não aparece no arquivo e nunca é persistida;
- senha incorreta e conteúdo adulterado produzem o mesmo bloqueio seguro;
- backups antigos continuam inspecionáveis e restauráveis;
- retenção só remove arquivos automáticos com prefixo reconhecido dentro da pasta configurada;
- banco candidato precisa passar `quick_check`, chaves estrangeiras e limite de versão antes da troca;
- o banco anterior permanece recuperável até as migrações e a validação pós-restauração terminarem;
- atualização exige pacote e instalador íntegros, versão superior e licença compatível para mudança de versão principal;
- o instalador é extraído somente após backup preventivo e a nova versão é validada na inicialização;
- diagnóstico não contém SQLite, documentos financeiros, senhas ou chave privada.

## Validação executada

| Verificação | Resultado |
| --- | --- |
| ESLint | Aprovado, zero avisos |
| TypeScript estrito | Aprovado |
| Vitest | 23 testes aprovados; 3 específicos da continuidade visual |
| Playwright | 19 cenários aprovados; 2 específicos de senha, automação, histórico, diagnóstico e atualização |
| `cargo fmt --all -- --check` | Aprovado |
| `cargo clippy --all-targets --all-features -- -D warnings` | Aprovado |
| `cargo test --all-features` | 55 testes aprovados; 11 específicos de continuidade/licenciamento |
| Vite produção | Aprovado; central carregada sob demanda |
| Auditoria npm | 0 vulnerabilidades conhecidas |
| Tauri produção | Executável, MSI e NSIS x64 gerados |
| Backup de aceite | SQLite migrado até 10, criptografado, senha ausente do arquivo, descriptografado e `quick_check=ok` |

## Artefatos

| Artefato | Tamanho | SHA-256 |
| --- | ---: | --- |
| `caixa-no-controle.exe` | 17.515.520 bytes | `457A1F0BBC6053024DCB4D1F9773562FAB23306BD13C413540BD585413775C63` |
| `Caixa no Controle_0.1.0_x64_en-US.msi` | 6.615.040 bytes | `7481B8A08919C067D48DDC1F8EA4D6AD718DC78C44880C6B63A9702A7DAE4E22` |
| `Caixa no Controle_0.1.0_x64-setup.exe` | 4.719.658 bytes | `6F6C9C3A04394D85C4B64EC10F4DF7E540A82A4F2A7CFA273D080CABADC6E627` |
| `Backup_Fase8_Aceite.cncbak` | 714.148 bytes | `1049244C43DE0885B881F15FF67DD2F8BA72E76885049F67640E9752E3B1B058` |

Os binários ficam em `%LOCALAPPDATA%\CaixaNoControle\cargo-target\release`. O backup de aceite está em `output/backup`; sua senha é `Aceite-Fase8-2026` e serve exclusivamente para este artefato sintético.

## Fronteira da próxima fase

A Fase 9 permanece responsável pela rodada transversal de qualidade: acessibilidade, desempenho com massa de dados, revisão visual, revisão independente de cálculos e tratamento sistemático de falhas. Nenhum item funcional da continuidade foi transferido para ela.
