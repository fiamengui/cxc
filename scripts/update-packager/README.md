# Empacotador interno de atualização

Gera um `.cncupd` assinado para atualização offline. A chave privada permanece fora do repositório e do instalador.

```powershell
node create-update.mjs <chave-privada.pem> <instalador.exe|msi> <saida.cncupd> <MAJOR.MINOR.PATCH> <resumo> [migração-mínima]
```

O aplicativo valida assinatura Ed25519, versão semântica, licença da versão principal, migração mínima e SHA-256 do instalador antes de criar o backup preventivo e preparar a instalação.
