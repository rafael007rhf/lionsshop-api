# LionsShop API

A LionsShop vende produtos para desenvolvedores. Esta API gerencia catálogo, clientes, cupons e pedidos. O projeto foi refatorado com Domain-Driven Design (DDD) a partir da [API original da atividade](https://github.com/FilipePaixao/lionsshop-api).

## Como rodar

Use Node.js 20.19+ e Docker com o plugin Compose.

```bash
npm install
cp .env.example .env
docker compose up -d --wait
npm run seed
npm run dev
```

A API fica em `http://localhost:3000`. O seed reinicializa os dados de desenvolvimento e imprime os IDs dos produtos e clientes de exemplo. Ele cadastra também os cupons `LIONS10` (10%) e `BLACKFRIDAY` (30%), válidos por um ano a partir da execução. O arquivo `requests.http` tem exemplos para usar com a extensão REST Client do VS Code.

O Compose inicializa um replica set local de um nó. As transações do MongoDB garantem que pedidos, estoque e resgates de cupom sejam gravados juntos. Para usar o MongoDB Atlas, coloque a URI do cluster em `MONGO_URL` e escolha um banco por meio de `DB_NAME`. Os avisos por e-mail são simulados no console da API.

### Atualizar uma instalação do protótipo

Mantenha o volume do MongoDB, atualize `MONGO_URL` de acordo com `.env.example` e execute `docker compose up -d --wait`. A aplicação lê os pedidos existentes com os mesmos IDs, preços, totais e códigos de status. Cadastre os cupons desejados via `POST /coupons`. O histórico de pedidos também conta para o limite de um uso por cliente. Se a base antiga contém clientes com o mesmo e-mail, resolva as duplicidades antes de subir a API para que o índice único possa ser criado. Use o seed apenas em uma base de desenvolvimento que possa ser reinicializada.

## Linguagem ubíqua e regras de negócio

| Termo | Significado no domínio |
| --- | --- |
| **Produto** | Entidade do catálogo com nome, preço positivo e estoque. O estoque deve permanecer igual ou superior a zero. |
| **Cliente** | Entidade identificada por ID, com nome e e-mail único. O cliente VIP recebe 5% de desconto adicional, aplicado depois do cupom. |
| **Pedido** | Entidade que agrupa os itens de um cliente. Nasce pendente, exige pelo menos um item com quantidade positiva e baixa o estoque na criação. |
| **Item de pedido** | Registro do produto, nome, preço unitário e quantidade no momento da compra. O subtotal é a soma de preço vezes quantidade de cada item. |
| **Cupom** | Entidade identificada pelo código, com percentual de desconto e validade. Cada cliente pode usar o mesmo código uma vez, inclusive se cancelar o pedido depois. |
| **Total** | Valor gravado no pedido após descontos e arredondamento para centavos. |
| **Pendente, enviado e cancelado** | Estados de um pedido. Só pendentes podem ser enviados ou cancelados. O cancelamento devolve as quantidades ao estoque. |
| **Faturamento** | Contagem de pedidos pendentes e enviados e soma dos respectivos totais já descontados. |

Criação, envio e cancelamento geram um aviso ao cliente após a confirmação da transação. A listagem por cliente inclui pedidos em todos os estados, do mais recente ao mais antigo.

## Estrutura

```text
src/
├── app.ts                    # Composição das dependências e inicialização HTTP
├── seed.ts
├── modules/
│   ├── catalog/              # Produtos e estoque
│   ├── customers/            # Clientes e dados de contato
│   ├── coupons/              # Cadastro, validade e resgate de cupons
│   └── orders/               # Pedidos, consultas e faturamento
└── shared/                   # Erros e utilitários compartilhados
tests/
├── integration/              # API HTTP com Supertest e MongoDB
└── unit/                     # Casos de uso com dependências substituídas
```

Cada contexto tem três camadas.

- `domain/` reúne entidades, regras e contratos de repositório em TypeScript, independentes de Express e MongoDB.
- `application/` implementa os casos de uso. Eles recebem repositórios, unidade de trabalho, relógio ou notificações pelo construtor conforme o que precisam.
- `infra/` implementa os repositórios MongoDB e as rotas Express. `app.ts` conecta os adaptadores aos casos de uso.

Pedidos coordenam catálogo, clientes e cupons durante a compra. O MongoDB protege a baixa de estoque contra concorrência e usa um índice único para cada par cupom–cliente. A alteração de status e a devolução ao estoque também ocorrem na mesma transação. Os formatos de persistência do pedido ficam no repositório MongoDB.

## Endpoints

| Método | Rota | Operação |
| --- | --- | --- |
| POST | `/products` | Cadastra produto |
| GET | `/products?q=caneca` | Lista produtos com busca opcional por nome |
| PATCH | `/products/:id/stock` | Ajusta estoque por `quantity`, positiva ou negativa |
| POST | `/customers` | Cadastra cliente |
| GET | `/customers/:id` | Consulta cliente |
| PUT | `/customers/:id` | Atualiza nome ou e-mail |
| POST | `/orders` | Cria pedido com `customerId`, `items` e `coupon` opcional |
| GET | `/orders` | Lista todos os pedidos |
| GET | `/orders/:id` | Detalha um pedido |
| PATCH | `/orders/:id/ship` | Marca um pedido pendente como enviado |
| PATCH | `/orders/:id/cancel` | Cancela um pedido pendente e devolve o estoque |
| POST | `/coupons` | Cadastra cupom com código, percentual e validade |
| GET | `/customers/:id/orders` | Lista os pedidos do cliente com status e total |
| GET | `/reports/revenue` | Mostra quantos pedidos válidos existem e o faturamento |

### Cadastrar e resgatar um cupom

Envie `POST /coupons` com:

```json
{
  "code": "TURMA20",
  "discountPercent": 20,
  "expiresAt": "2035-12-31"
}
```

O código é normalizado para maiúsculas, aceita letras, números, hífen e sublinhado e tem até 64 caracteres. O desconto é maior que zero e de até 100%. Uma data no formato `YYYY-MM-DD` vale até o fim daquele dia em UTC. Também é possível informar um instante ISO 8601 com fuso, como `2035-12-31T23:59:59Z`. O cupom deixa de valer no instante retornado em `expiresAt`.

Informe `"coupon": "TURMA20"` ao criar o pedido e inclua `productId` e `quantity` em cada item. Cupom inexistente ou expirado retorna HTTP 400. Cadastro duplicado ou resgate repetido pelo mesmo cliente retorna HTTP 409. Um pedido recusado mantém o estoque e a disponibilidade do cupom.

### Consultar pedidos de um cliente

Cada item retornado por `GET /customers/:id/orders` tem `id`, `customerId`, `total`, `status` e `createdAt`. Um cliente sem pedidos recebe uma lista vazia. Um cliente desconhecido recebe HTTP 404. As consultas usam os estados `PENDENTE`, `ENVIADO` e `CANCELADO`. A resposta de criação mantém o formato original com `status: 1`.

## Testes e compilação

```bash
npm run test:unit                       # Jest, sem banco
docker compose up -d --wait
npm run test:integration                # Supertest com MongoDB
npm test                                # Suíte completa
npm run build
npm start                               # Roda a API compilada
```

Os testes de integração usam um banco temporário, limpo ao final da suíte. Defina `MONGO_TEST_URL` para apontar para outro replica set de testes. O seed é dispensável para executar a suíte.

O primeiro commit da refatoração caracteriza a API original com Supertest. A suíte atual cobre os fluxos legados, os casos novos e as corridas de cancelamento e resgate.
