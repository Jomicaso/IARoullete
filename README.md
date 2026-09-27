# IARoullete

Bot independente para acompanhar a XXXtreme Lightning Roulette e comparar estratégias
de diferentes mercados com base no histórico ao vivo.

## Como funciona

- Lê até 500 resultados, do mais recente para o mais antigo.
- Compara colunas, dúzias, vermelho/preto, par/ímpar e baixo/alto.
- Combina frequência histórica, os 12 resultados mais recentes e transições semelhantes.
- Normaliza cada método pela respetiva probabilidade-base antes de os comparar.
- Seleciona a entrada com melhor evidência observada.
- Executa backtest walk-forward sem usar resultados futuros.
- Aprende com os resultados reais dos últimos 500 sinais.
- Só emite sinais com força mínima de 65%.
- Pausa uma jogada após RED e bloqueia novas entradas depois de dois REDs no mesmo dia.
- Acompanha cada entrada, ate 3 gales, WIN e LOSS em tempo real.
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
