"""
Colmena v2 — Modulo de Arbitraje Inter-Exchange
Stack: ccxt.pro (async) + Redis (mensajeria) + asyncio

Agentes:
  1. Observador — WebSocket a exchanges, monitorea order books
  2. Calculador — Detecta spread rentable (fees incluidos)
  3. Ejecutor — Ordenes simultaneas compra/venta
  4. Supervisor — Riesgo, latencia, balances, emergency stop

Instalar: pip install ccxt aiohttp redis asyncio
"""

import asyncio
import json
import time
import os

try:
    import ccxt.pro as ccxtpro
except ImportError:
    ccxtpro = None
    print("[WARN] ccxt.pro no instalado. pip install ccxt")

try:
    import redis.asyncio as aioredis
except ImportError:
    aioredis = None
    print("[WARN] redis async no instalado. pip install redis")


# ── Config ──────────────────────────────────────────────
EXCHANGES = os.environ.get("CRYPTO_EXCHANGES", "binance,kraken").split(",")
PAIRS = os.environ.get("CRYPTO_PAIRS", "BTC/USDT").split(",")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6380")
MIN_PROFIT_PCT = float(os.environ.get("MIN_PROFIT_PCT", "0.1"))
MAX_TRADE_USD = float(os.environ.get("MAX_TRADE_USD", "100"))
MAX_LOSS_PCT = float(os.environ.get("MAX_LOSS_PCT", "2.0"))
CHANNEL_ORDERBOOK = "colmena:crypto:orderbook"
CHANNEL_SIGNAL = "colmena:crypto:signal"
CHANNEL_CONTROL = "colmena:crypto:control"


# ── Agente 1: Observador ───────────────────────────────
async def agente_observador(exchange_id, symbol, redis_client):
    """Conecta via WebSocket y publica order book en Redis."""
    if not ccxtpro:
        print(f"[OBSERVADOR] ccxt.pro no disponible, abortando")
        return

    exchange_class = getattr(ccxtpro, exchange_id, None)
    if not exchange_class:
        print(f"[OBSERVADOR] Exchange '{exchange_id}' no soportado")
        return

    exchange = exchange_class({"enableRateLimit": True})
    print(f"[OBSERVADOR] Iniciando {exchange_id} — {symbol}")

    try:
        while True:
            orderbook = await exchange.watch_order_book(symbol)
            best_bid = orderbook["bids"][0][0] if orderbook["bids"] else None
            best_ask = orderbook["asks"][0][0] if orderbook["asks"] else None
            bid_vol = orderbook["bids"][0][1] if orderbook["bids"] else 0
            ask_vol = orderbook["asks"][0][1] if orderbook["asks"] else 0

            if best_bid and best_ask:
                data = {
                    "exchange": exchange_id,
                    "symbol": symbol,
                    "bid": best_bid,
                    "ask": best_ask,
                    "bid_vol": bid_vol,
                    "ask_vol": ask_vol,
                    "ts": time.time(),
                }
                await redis_client.publish(CHANNEL_ORDERBOOK, json.dumps(data))

    except asyncio.CancelledError:
        print(f"[OBSERVADOR] {exchange_id} detenido")
    except Exception as e:
        print(f"[OBSERVADOR] Error {exchange_id}: {e}")
    finally:
        await exchange.close()


# ── Agente 2: Calculador ───────────────────────────────
async def agente_calculador(redis_client):
    """Escucha order books, calcula spread, emite signal si es rentable."""
    print("[CALCULADOR] Iniciando analisis de spread")
    books = {}  # {exchange: {symbol: {bid, ask, ts}}}

    pubsub = redis_client.pubsub()
    await pubsub.subscribe(CHANNEL_ORDERBOOK, CHANNEL_CONTROL)

    async for message in pubsub.listen():
        if message["type"] != "message":
            continue

        channel = message["channel"]
        if isinstance(channel, bytes):
            channel = channel.decode()

        if channel == CHANNEL_CONTROL:
            cmd = message["data"]
            if isinstance(cmd, bytes):
                cmd = cmd.decode()
            if cmd == "SHUTDOWN":
                print("[CALCULADOR] Shutdown recibido")
                break
            continue

        data = json.loads(message["data"])
        ex = data["exchange"]
        sym = data["symbol"]
        books.setdefault(ex, {})[sym] = data

        # Necesitamos al menos 2 exchanges para comparar
        exchanges_with_data = [e for e, syms in books.items() if sym in syms]
        if len(exchanges_with_data) < 2:
            continue

        # Buscar mejor bid y mejor ask entre todos los exchanges
        best_bid_ex = max(exchanges_with_data, key=lambda e: books[e][sym]["bid"])
        best_ask_ex = min(exchanges_with_data, key=lambda e: books[e][sym]["ask"])

        if best_bid_ex == best_ask_ex:
            continue  # Mismo exchange, no hay arbitraje

        bid_price = books[best_bid_ex][sym]["bid"]
        ask_price = books[best_ask_ex][sym]["ask"]
        spread_pct = ((bid_price - ask_price) / ask_price) * 100

        if spread_pct <= 0:
            continue  # No hay oportunidad

        # Estimar fees (0.1% por trade tipico en cada exchange)
        est_fee_pct = 0.1 + 0.1  # compra + venta
        net_profit_pct = spread_pct - est_fee_pct

        if net_profit_pct >= MIN_PROFIT_PCT:
            signal = {
                "type": "arbitrage_opportunity",
                "symbol": sym,
                "buy_exchange": best_ask_ex,
                "buy_price": ask_price,
                "sell_exchange": best_bid_ex,
                "sell_price": bid_price,
                "spread_pct": round(spread_pct, 4),
                "est_fee_pct": est_fee_pct,
                "net_profit_pct": round(net_profit_pct, 4),
                "ts": time.time(),
            }
            print(f"[CALCULADOR] OPORTUNIDAD! {sym} — comprar en {best_ask_ex} @ {ask_price}, vender en {best_bid_ex} @ {bid_price} — profit: {net_profit_pct:.3f}%")
            await redis_client.publish(CHANNEL_SIGNAL, json.dumps(signal))
        else:
            # Log solo si spread es positivo pero insuficiente
            if spread_pct > 0.05:
                print(f"[CALCULADOR] Spread {sym}: {spread_pct:.3f}% (net {net_profit_pct:.3f}% < min {MIN_PROFIT_PCT}%)")


# ── Agente 3: Ejecutor ─────────────────────────────────
async def agente_ejecutor(redis_client):
    """Escucha signals del calculador y ejecuta ordenes simultaneas."""
    print("[EJECUTOR] Esperando signals de arbitraje")

    pubsub = redis_client.pubsub()
    await pubsub.subscribe(CHANNEL_SIGNAL, CHANNEL_CONTROL)

    async for message in pubsub.listen():
        if message["type"] != "message":
            continue

        channel = message["channel"]
        if isinstance(channel, bytes):
            channel = channel.decode()

        if channel == CHANNEL_CONTROL:
            cmd = message["data"]
            if isinstance(cmd, bytes):
                cmd = cmd.decode()
            if cmd == "SHUTDOWN":
                print("[EJECUTOR] Shutdown recibido")
                break
            continue

        signal = json.loads(message["data"])
        print(f"[EJECUTOR] Signal recibida: {signal['symbol']} — profit est: {signal['net_profit_pct']}%")

        # Safety check
        if signal["net_profit_pct"] < MIN_PROFIT_PCT:
            print("[EJECUTOR] Profit insuficiente, ignorando")
            continue

        # TODO: Implementar ordenes reales con ccxt
        # Por ahora solo loguea (modo dry-run)
        trade_amount_usd = min(MAX_TRADE_USD, 50)  # Conservador
        print(f"[EJECUTOR] DRY-RUN: Compraria {signal['symbol']} en {signal['buy_exchange']} @ {signal['buy_price']}")
        print(f"[EJECUTOR] DRY-RUN: Venderia {signal['symbol']} en {signal['sell_exchange']} @ {signal['sell_price']}")
        print(f"[EJECUTOR] DRY-RUN: Monto: ${trade_amount_usd} — Ganancia est: ${trade_amount_usd * signal['net_profit_pct'] / 100:.2f}")

        # Registrar en Redis para el supervisor
        await redis_client.lpush("colmena:crypto:trades", json.dumps({
            **signal,
            "amount_usd": trade_amount_usd,
            "dry_run": True,
            "executed_at": time.time(),
        }))


# ── Agente 4: Supervisor ───────────────────────────────
async def agente_supervisor(redis_client):
    """Monitorea salud del sistema cada 10 segundos."""
    print("[SUPERVISOR] Monitoreo de riesgo activo")

    while True:
        try:
            await asyncio.sleep(10)

            # Checar trades recientes
            trades_raw = await redis_client.lrange("colmena:crypto:trades", 0, 50)
            trades = [json.loads(t) for t in trades_raw]
            recent = [t for t in trades if time.time() - t.get("executed_at", 0) < 3600]

            total_volume = sum(t.get("amount_usd", 0) for t in recent)
            total_profit = sum(
                t.get("amount_usd", 0) * t.get("net_profit_pct", 0) / 100
                for t in recent
            )

            print(f"[SUPERVISOR] Ultima hora: {len(recent)} trades, vol: ${total_volume:.2f}, profit est: ${total_profit:.2f}")

            # Emergency shutdown si perdidas exceden threshold
            if total_profit < -(MAX_TRADE_USD * MAX_LOSS_PCT / 100):
                print(f"[SUPERVISOR] ALERTA! Perdidas exceden {MAX_LOSS_PCT}%. SHUTDOWN!")
                await redis_client.publish(CHANNEL_CONTROL, "SHUTDOWN")
                break

        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[SUPERVISOR] Error: {e}")


# ── Main ───────────────────────────────────────────────
async def main():
    if not ccxtpro:
        print("[MAIN] Instala ccxt: pip install ccxt")
        return
    if not aioredis:
        print("[MAIN] Instala redis: pip install redis")
        return

    redis_client = aioredis.from_url(REDIS_URL, decode_responses=False)
    print(f"[MAIN] Colmena Crypto Arbitrage v1.0")
    print(f"[MAIN] Exchanges: {EXCHANGES}")
    print(f"[MAIN] Pairs: {PAIRS}")
    print(f"[MAIN] Min profit: {MIN_PROFIT_PCT}%")
    print(f"[MAIN] Max trade: ${MAX_TRADE_USD}")

    tasks = []

    # Observadores (1 por exchange por par)
    for ex in EXCHANGES:
        for pair in PAIRS:
            tasks.append(agente_observador(ex.strip(), pair.strip(), redis_client))

    # Calculador, Ejecutor, Supervisor
    tasks.append(agente_calculador(redis_client))
    tasks.append(agente_ejecutor(redis_client))
    tasks.append(agente_supervisor(redis_client))

    await asyncio.gather(*tasks)
    await redis_client.close()


if __name__ == "__main__":
    asyncio.run(main())
