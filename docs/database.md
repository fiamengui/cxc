# Banco de dados — estado atual

## Migrações

| Versão | Conteúdo |
| --- | --- |
| 0001 | Empresa, preferências, administrador, categorias, contas, formas de pagamento e auditoria |
| 0002 | Estado de licença e demonstração |
| 0003 | Contatos e catálogo de produtos/serviços |
| 0004 | Identificação de exemplos, uso do trial, instalação, meta mensal e unicidade da licença |
| 0005 | Índices dos cadastros, autoria (`created_by`/`updated_by`) e formas de pagamento Prazo/Outro |
| 0006 | Grupos, recorrências, movimentações financeiras, liquidações parciais e índices do núcleo financeiro |
| 0007 | Vendas, snapshots dos itens, condições de recebimento, vínculo ao grupo financeiro e índices comerciais |

## Regras invariantes

- Valores monetários usam colunas `*_cents` do tipo `INTEGER`;
- uma conta padrão ativa por vez;
- contatos e itens de catálogo possuem `deleted_at`;
- índices existem em nomes e documentos pesquisáveis;
- alterações futuras exigem nova migração: uma migração aplicada não pode ser reescrita.
- licença e instalação possuem no máximo um registro local;
- dados demonstrativos usam `is_demo` e podem ser removidos sem afetar registros reais;
- a meta mensal opcional usa centavos inteiros em `goals`.
- os cinco cadastros da Fase 3 registram usuário de criação e última alteração;
- nomes de categorias no mesmo nível, contas e formas de pagamento são validados contra duplicidade;
- códigos de catálogo são comparados sem diferença entre maiúsculas e minúsculas;
- categorias não podem formar ciclos e uma conta padrão não pode ser inativada, excluída ou desmarcada sem substituição;
- importações de contatos são transacionais: qualquer erro cancela o lote inteiro.
- movimentações persistem somente `DRAFT`, `PENDING`, `SETTLED` ou `CANCELED`; atraso e baixa parcial são situações calculadas;
- o valor original da movimentação é imutável depois de uma baixa e cada liquidação permanece como evento separado;
- parcelas, recorrências, transferências e estornos usam grupos explícitos; transferências geram duas pontas com resultado zero;
- movimentações liquidadas não são apagadas: um estorno cria o movimento inverso, recompõe saldo e preserva auditoria;
- recorrências inválidas são pausadas sem bloquear consultas nem consumir o limite do trial;
- consultas financeiras possuem índices por data, tipo/situação, contato, categoria, conta, origem, grupo e recorrência.
- uma venda confirmada possui no máximo um grupo financeiro e a repetição da confirmação retorna o resultado existente sem duplicar recebíveis;
- venda, itens, recebíveis e consumo do trial são gravados na mesma transação;
- itens da venda preservam descrição, quantidade, unidade, preço, desconto e total praticados, mesmo após alterações no catálogo;
- situações de venda são `DRAFT`, `CONFIRMED`, `PARTIALLY_RECEIVED`, `RECEIVED` ou `CANCELED` e acompanham liquidações/estornos vinculados;
- cancelamento comercial não apaga liquidações: recebimentos devem ser estornados, e somente pendências são canceladas diretamente;
- consultas comerciais possuem índices por data/situação, situação/data, cliente/data, número, venda e catálogo.
