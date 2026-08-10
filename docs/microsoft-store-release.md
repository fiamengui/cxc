# Preparação para Microsoft Store

## Estado

O projeto possui template MSIX, geração por `MakeAppx`, assets de pacote e listagem e documentação operacional. O pacote definitivo não pode ser gerado nem submetido antes de obter do Partner Center os valores exatos de **Package/Identity/Name** e **Publisher**. Esses valores não são inventados no repositório.

Em agosto de 2026, a Microsoft informa que o novo cadastro de desenvolvedor não cobra taxa para contas individuais ou empresariais. Para publicar como BratecInfo, deve-se escolher conta **Company** desde o início, pois a conversão posterior de Individual para Company não é suportada. A Store aceita MSIX para Win32/Desktop Bridge, hospeda o pacote, fornece atualização e reassina a distribuição; uma alternativa é listar o EXE/MSI hospedado em URL HTTPS versionada, mas ela mantém mais responsabilidades de hospedagem e assinatura no editor.

Fontes oficiais: [abertura de conta](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account), [caminhos de distribuição](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/choose-distribution-path), [Win32 na Store](https://learn.microsoft.com/en-us/windows/apps/distribute-through-store/how-to-distribute-your-win32-app-through-microsoft-store) e [upload MSIX](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/upload-app-packages).

## Checklist

1. Criar ou concluir conta Company no Partner Center e validar a entidade BratecInfo.
2. Reservar o nome CaixaSimples - Bratec.
3. Copiar exatamente Package Identity Name e Publisher fornecidos pelo Partner Center.
4. Gerar o build Tauri de produção e executar `scripts/build-msix.ps1 -IdentityName '<valor>' -Publisher '<valor CN=...>'`.
5. Validar o pacote com Windows App Certification Kit e em Windows limpo.
6. Conferir arquitetura x64, versão MSIX mapeada (`1.2.0-beta.1` → `1.2.0.1`) e `Windows.Desktop`.
7. Confirmar capabilities mínimas: `internetClient` e `runFullTrust`; não adicionar acesso amplo sem necessidade.
8. Enviar pacote MSIX, preferencialmente em flight privado enquanto o software estiver em beta.
9. Preencher categoria **Business → Personal finance** ou a opção equivalente disponível no Partner Center; confirmar no momento da submissão.
10. Enviar ícones, Store Hero e capturas reais de no mínimo 1280×720 sem dados pessoais.
11. Publicar descrição curta e completa, recursos, requisitos de sistema e limitações da beta.
12. Publicar URL HTTPS da política de privacidade, termos e suporte.
13. Responder corretamente ao questionário IARC de classificação etária.
14. Escolher mercados e preço. A beta convidada deve usar flight/audiência controlada; não lançar publicamente por engano.
15. Adicionar notas de certificação explicando dados locais, backend comercial, Mercado Pago hospedado e credenciais de teste quando solicitadas com segurança.
16. Submeter para certificação, tratar relatórios e só então escolher data de publicação.
17. Registrar versão certificada, Package Identity, hashes e data no runbook.

As políticas atuais exigem política de privacidade para Win32/Desktop Bridge e para produtos que acessam dados pessoais, além de classificação etária IARC. Consulte sempre a [política vigente da Microsoft Store](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies) antes da submissão.

## Assets preparados

- `src-tauri/icons/StoreLogo.png`, `Square44x44Logo.png`, `Square150x150Logo.png` e `Square310x310Logo.png`;
- `store-assets/Wide310x150Logo.png`, `SplashScreen.png` e `StoreHero.png`;
- `docs/phase-9-audit/06-dashboard-final-completo.png` como captura inicial, já sem dados reais;
- `msix/AppxManifest.template.xml` com placeholders obrigatórios de identidade.

Antes da Store, produzir capturas adicionais de onboarding, movimentações, vendas, backup e relatórios em Windows limpo. Não ampliar artificialmente imagens pequenas nem usar screenshots com informações de clientes.
