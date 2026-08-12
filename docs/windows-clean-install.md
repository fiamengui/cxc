# Validação em Windows limpo

1. Use uma máquina virtual ou Windows Sandbox x64 sem instalação anterior do produto.
2. Copie a pasta de release completa e confira `SHA256SUMS.txt` com `Get-FileHash -Algorithm SHA256`.
3. Desconecte a rede e execute o instalador NSIS. Confirme EULA, pasta, menu Iniciar e a opção de atalho na área de trabalho.
4. Abra o aplicativo, conclua o onboarding, carregue o pacote demonstrativo e percorra Ajuda.
5. Crie um registro real, feche e reabra. Confirme persistência e funcionamento offline.
6. Crie e restaure um backup protegido em um local temporário.
7. Instale novamente a mesma versão e confirme que os dados permanecem.
8. Desinstale e escolha **Não** quando perguntado sobre os dados. Reinstale e confirme a recuperação.
9. Desinstale novamente, escolha **Sim** e confirme a remoção somente após manter um backup.
10. Registre versão do Windows, hashes, capturas e resultado no checklist final.

O script `scripts/installer-smoke.ps1` automatiza a instalação silenciosa NSIS, preservação padrão e desinstalação, além da extração administrativa do MSI. A interação visual e a exclusão deliberada de dados continuam sendo conferidas na máquina limpa.

Em Windows Pro/Enterprise, habilite uma vez o recurso `Containers-DisposableClientVM` em um PowerShell como Administrador e reinicie quando solicitado. Depois execute `scripts/start-windows-sandbox-smoke.ps1`. Ele abre um Windows descartável, monta o projeto somente para leitura, confere os hashes, instala e inicia o aplicativo, valida o manual embarcado, extrai o MSI, desinstala e grava `output/windows-sandbox-smoke/windows-sandbox-smoke-result.json` no computador host.
