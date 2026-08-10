# CaixaSimples - Bratec 1.2.0-beta.1

Esta é uma beta gratuita e controlada para até cinco clientes convidados. Ela preserva todos os recursos financeiros locais da versão 1.1.0 e inicia a validação da nova identidade CaixaSimples - Bratec em infraestrutura separada de produção.

## Principais pontos

- gestão offline de caixa, contas, vendas, cadastros, metas, relatórios e backups;
- ativação beta por convite individual vinculado à instalação;
- autorização beta assinada, auditável e renovável, sem exigir pagamento do convidado;
- tolerância ao despertar do serviço gratuito do Render;
- checkout hospedado no Mercado Pago preparado para os planos comerciais futuros;
- manual completo e pacote de diagnóstico sem o banco financeiro.

## Limitações conhecidas

- público limitado e sem autoinscrição;
- a gratuidade vale durante a beta e não constitui promessa de gratuidade permanente;
- o serviço gratuito pode demorar na primeira conexão após inatividade;
- o instalador beta não possui assinatura digital, então o Windows pode indicar editor desconhecido;
- publicação pela Microsoft Store ainda depende de conta, identidade do publisher e certificação externa.

## Verificar o instalador

Compare o SHA-256 do instalador com `SHA256SUMS.txt`. No PowerShell:

```powershell
Get-FileHash .\CaixaSimples-Bratec-1.2.0-beta.1-Setup.exe -Algorithm SHA256
```

Não desative antivírus ou SmartScreen. Se o hash divergir, não execute o arquivo.

## Feedback e suporte

Gere o pacote de diagnóstico na tela Backup e envie pelo canal de suporte que a BratecInfo informar junto ao convite. O pacote exclui banco financeiro, senhas e secrets.
