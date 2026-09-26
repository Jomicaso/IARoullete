# IARoullete

Bot independente para acompanhar a XXXtreme Lightning Roulette e comparar estrategias
de cobertura de colunas com base no historico recente.

## Como funciona

- Le ate 40 resultados, do mais recente para o mais antigo.
- Compara as tres combinacoes possiveis de duas colunas.
- Combina frequencia historica, os 12 resultados mais recentes e transicoes semelhantes.
- Seleciona a cobertura com melhor desempenho observado.
- Simula entrada, ate 3 gales, WIN e LOSS.
- Envia a estrategia e os resultados para o Telegram.

O valor de confianca descreve apenas o desempenho da amostra analisada. A roleta e
aleatoria e o resultado seguinte nao pode ser garantido.

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
