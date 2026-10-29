# IARoullete

Bot independente para acompanhar a XXXtreme Lightning Roulette e detetar sequências
de resultados na mesma coluna ou dúzia em tempo real.

## Como funciona

- Envia pré-alertas quando aparecem 2, 3 e 4 resultados seguidos na mesma coluna ou dúzia.
- Emite o sinal apenas no quinto resultado consecutivo nessa coluna.
- Indica a entrada nas outras duas colunas, sem cobertura do zero.
- Emite também um sinal após cinco resultados consecutivos na mesma dúzia.
- Nesse sinal, indica a entrada nas outras duas dúzias, sem cobertura do zero.
- Acompanha cada entrada, até 3 gales, GREEN e RED em tempo real.
- Mantém a contagem diária de GREEN e RED no horário de Lisboa.
- Envia os avisos, a entrada e os resultados para o Telegram.
- O comando `/stats` separa colunas e dúzias por GREEN direto, G1, G2, G3 e RED, e calcula uma banca diária de €100 com a progressão €1, €3, €9 e €27 em cada opção, sem aposta no zero.
- Conserva os últimos 500 sinais detalhados para comparação.

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
