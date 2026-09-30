# IARoullete

Bot independente para acompanhar a XXXtreme Lightning Roulette e detetar sequências
de resultados na mesma coluna em tempo real.

## Como funciona

- Envia pré-alertas quando aparecem 2 e 3 resultados seguidos na mesma coluna.
- Emite o sinal apenas no quarto resultado consecutivo nessa coluna.
- Indica a entrada nas outras duas colunas, com cobertura do zero.
- Acompanha cada entrada, até 3 gales, GREEN e RED em tempo real.
- Mantém a contagem diária de GREEN e RED no horário de Lisboa.
- Envia os avisos, a entrada e os resultados para o Telegram.

A roleta é aleatória e o resultado seguinte não pode ser garantido.

## Desenvolvimento

```sh
npm install
npm run dev
```

## Servicos

Este bot deve usar:

- O repositorio `Jomicaso/IARoullete`.
- Um bot Telegram proprio.
- Um projeto Supabase separado do bot RouletteGaleXxx.
- Uma aplicacao Node.js separada na Hostinger.

Os segredos pertencem apenas as variaveis de ambiente da Hostinger e nunca ao GitHub.
