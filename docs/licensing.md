# Licenciamento por assinatura

O Caixa no Controle Essencial é oferecido nos planos `ESSENTIAL_MONTHLY` (R$ 9,90/mês) e `ESSENTIAL_ANNUAL` (R$ 99,90/ano). O preço é definido exclusivamente no backend. A venda permanente foi encerrada; arquivos `.cnclic` assinados permanecem aceitos somente para honrar licenças legadas já emitidas.

## Entitlement

Pagamento não altera SQLite diretamente. O backend confirma o recurso no Mercado Pago, atualiza a assinatura e emite um documento Ed25519 contendo produto, edição, plano, recursos, instalação, fingerprint da chave pública do dispositivo, situação, emissão, validade, sequência monotônica, horário confiável e `keyId`.

O cliente contém apenas a chave pública e rejeita assinatura inválida, dispositivo divergente, sequência repetida, lease expirado e retrocesso relevante do relógio. O plano mensal recebe lease de até 7 dias e tolerância de 5 dias; o anual recebe lease de até 30 dias e tolerância de 10 dias. O prazo nunca ultrapassa o período comercial confirmado.

## Identidade do dispositivo

Na primeira utilização comercial, o Rust gera um par Ed25519. A chave privada e o estado antirrollback são cifrados pelo DPAPI para o usuário atual do Windows em `%LOCALAPPDATA%\BratecInfo\CaixaNoControle\commercial-state.bin`. A chave não entra no SQLite, backup, frontend ou logs. Cada renovação usa nonce aleatório, expiração curta, `requestId`, timestamp, ação vinculada e assinatura do dispositivo; o backend consome o desafio uma única vez.

O código visível `CNC-XXXX-XXXX-XXXX` não é um segredo. APIs e tabelas usam UUIDs imprevisíveis. Restaurar o banco em outro computador não transfere a identidade nem o entitlement.

## Chaves e rotação

A chave privada de entitlement fica apenas no servidor, preferencialmente em KMS/HSM. A implementação inicial aceita um arquivo PEM externo indicado por `ENTITLEMENT_PRIVATE_KEY_PATH`; esse arquivo nunca pode entrar no repositório, imagem pública ou instalador. `keyId` prepara rotação e o cliente deve receber a nova chave pública em release assinada antes da troca.

O gerador offline em `scripts/license-generator` é legado e não participa de novas vendas.
