# SYSTEM ARCHITECTURE DIAGRAMS
# AI LP Trading System for Meteora DLMM + Jupiter

---

## 1. HIGH-LEVEL SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER INTERACTION LAYER                           │
├──────────────────────────┬──────────────────────────┬───────────────────┤
│                          │                          │                   │
│   ┌──────────────────┐   │   ┌──────────────────┐   │   ┌─────────────┐ │
│   │   WEB DASHBOARD  │   │   │  TELEGRAM BOT  │   │   │  API/USERS  │ │
│   │   (React/Vue)    │   │   │  (Mobile App)  │   │   │  (External) │ │
│   └────────┬─────────┘   │   └────────┬─────────┘   │   └──────┬──────┘ │
│            │             │            │             │          │       │
│     WebSocket           │      Webhook            │     REST API      │
│    (Real-time)          │      (Alerts)           │     (Queries)     │
│            │             │            │             │          │       │
└────────────┼─────────────┴────────────┼─────────────┴──────────┼───────┘
             │                          │                        │
             └──────────────────────────┼────────────────────────┘
                                        │
                              ┌─────────┴─────────┐
                              │   API GATEWAY     │
                              │  (Nginx/Fastify) │
                              │                   │
                              │  • Rate Limiting  │
                              │  • Auth/JWT       │
                              │  • Load Balance   │
                              └─────────┬─────────┘
                                        │
┌───────────────────────────────────────┼──────────────────────────────────┐
│                            CORE SERVICE LAYER                          │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    ORCHESTRATION ENGINE                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │  │
│  │  │   SCHEDULER │  │   EVENT     │  │     STATE MACHINE       │  │  │
│  │  │  (BullMQ)   │  │   BUS       │  │   (Position Manager)    │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                              │                                         │
│  ┌───────────────────────────┼─────────────────────────────────────┐ │
│  │                    AI AGENT LAYER                                  │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │ │
│  │  │  SCOUT   │  │ ANALYST  │  │  RISK    │  │ EXECUTOR │        │ │
│  │  │  Agent   │  │  Agent   │  │  Manager │  │  Agent   │        │ │
│  │  │          │  │          │  │          │  │          │        │ │
│  │  │• Scan    │  │• Analyze │  │• Validate│  │• Execute │        │ │
│  │  │• Score   │  │• Strategy│  │• Filter  │  │• Confirm │        │ │
│  │  │• Rank    │  │• Predict │  │• Circuit │  │• Settle  │        │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │ │
│  │       │             │             │             │              │ │
│  │       └─────────────┴──────┬──────┴─────────────┘              │ │
│  │                            │                                   │ │
│  │                   ┌──────────┴──────────┐                       │ │
│  │                   │   MEMORY AGENT      │                       │ │
│  │                   │  • Store Results    │                       │ │
│  │                   │  • Learn Patterns   │                       │ │
│  │                   │  • Optimize Models  │                       │ │
│  │                   └─────────────────────┘                       │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │              REBALANCE & EXECUTION ENGINE                        ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ ││
│  │  │   MONITOR    │  │  REBALANCE   │  │    GAS OPTIMIZER     │ ││
│  │  │  (Watcher)   │  │   (Engine)   │  │   (Jito Bundles)     │ ││
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
┌──────────────────────────────────┼──────────────────────────────────┐
│                         DATA LAYER                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │  POSTGRESQL  │  │    REDIS     │  │      FILE SYSTEM         │ │
│  │  (Primary)   │  │   (Cache)    │  │   (Logs/Backups)         │ │
│  │              │  │              │  │                          │ │
│  │ • Positions  │  │ • Session    │  │ • Trade History          │ │
│  │ • Trades     │  │ • Queue      │  │ • AI Models              │ │
│  │ • Snapshots  │  │ • Real-time  │  │ • Configs                │ │
│  │ • Decisions  │  │ • Pub/Sub    │  │ • Backups                │ │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘ │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
┌──────────────────────────────────┼──────────────────────────────────┐
│                    BLOCKCHAIN INTEGRATION LAYER                    │
│                                                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐│
│  │     METEORA      │  │     JUPITER      │  │     SOLANA       ││
│  │      DLMM        │  │   AGGREGATOR     │  │      RPC         ││
│  │                  │  │                  │  │                  ││
│  │ • Add Liquidity  │  │ • Get Quotes     │  │ • Sign TX        ││
│  │ • Remove Liquidity│  │ • Execute Swaps  │  │ • Send TX        ││
│  │ • Get Positions  │  │ • Route Optimize │  │ • Confirm        ││
│  │ • Calculate Fees │  │ • Slippage Prot  │  │ • Monitor        ││
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘│
│           │                    │                    │         │
│           └────────────────────┼────────────────────┘         │
│                              │                              │
│                   ┌──────────┴──────────┐                   │
│                   │    WALLET MANAGER   │                   │
│                   │  • Key Management   │                   │
│                   │  • Transaction Sign │                   │
│                   │  • Balance Track    │                   │
│                   └─────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. DATA FLOW DIAGRAM

### 2.1 Entry Flow (New Position)

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ SCHEDULER│────▶│  SCOUT  │────▶│ ANALYST │────▶│ RISK MGR│────▶│EXECUTOR │
│  (Cron)  │     │  Agent  │     │  Agent  │     │  Agent  │     │  Agent  │
└─────────┘     └────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
                     │               │               │               │
                     │  ┌────────────┴────────────┐   │               │
                     │  │  Database + Redis    │   │               │
                     │  │  • Store candidates    │   │               │
                     │  │  • Cache analysis     │   │               │
                     │  │  • Queue decisions     │   │               │
                     │  └────────────────────────┘   │               │
                     │               │               │               │
                     ▼               ▼               ▼               ▼
              ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┐
              │ Scan Pools  │  │  Calculate  │  │  Validate   │  │ Execute │
              │ Rank Score  │  │  Strategy   │  │   Limits    │  │   Trade │
              └─────────────┘  └─────────────┘  └─────────────┘  └────┬────┘
                                                                     │
                                          ┌──────────────────────────┴───────┐
                                          │                                  │
                                          ▼                                  ▼
                              ┌─────────────────────┐         ┌─────────────────────┐
                              │   JUPITER SWAP      │         │  METEORA ADD LIQ    │
                              │  (Token A → Token B)│         │  (Create Position)  │
                              └─────────────────────┘         └─────────────────────┘
                                                                     │
                                                                     ▼
                                                          ┌─────────────────────┐
                                                          │  NOTIFICATION       │
                                                          │  • Telegram         │
                                                          │  • Dashboard        │
                                                          │  • Database         │
                                                          └─────────────────────┘
```

### 2.2 Monitor & Rebalance Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         CONTINUOUS MONITORING                             │
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │  PRICE      │    │  POSITION   │    │    FEE      │    │   PnL       │  │
│  │  WATCHER    │───▶│  EVALUATOR  │───▶│  TRACKER    │───▶│  CALCULATOR │  │
│  │ (Every 3s)  │    │(Every 30s)  │    │(Every 60s)  │    │(Every 60s)  │  │
│  └─────────────┘    └──────┬──────┘    └─────────────┘    └─────────────┘  │
│                            │                                               │
│                            ▼                                               │
│                   ┌─────────────────┐                                      │
│                   │ REBALANCE CHECK │                                      │
│                   │  (Every 180s)   │                                      │
│                   └────────┬────────┘                                      │
│                            │                                               │
│              ┌─────────────┼─────────────┐                                  │
│              ▼             ▼             ▼                                  │
│        ┌─────────┐  ┌─────────┐  ┌─────────┐                             │
│        │  OUT OF │  │  PROFIT │  │VOLATILITY│                             │
│        │  RANGE  │  │ TARGET  │  │  SPIKE  │                             │
│        └────┬────┘  └────┬────┘  └────┬────┘                             │
│             │            │            │                                  │
│             └────────────┴────────────┘                                  │
│                          │                                                │
│                          ▼                                                │
│              ┌─────────────────────┐                                     │
│              │  REBALANCE DECISION │                                     │
│              │   (AI + Rules)      │                                     │
│              └──────────┬──────────┘                                     │
│                         │                                                │
│           ┌─────────────┼─────────────┐                                   │
│           ▼             ▼             ▼                                   │
│     ┌──────────┐  ┌──────────┐  ┌──────────┐                            │
│     │ REBALANCE│  │  EXPAND  │  │   HOLD   │                            │
│     │IMMEDIATE │  │  RANGE   │  │          │                            │
│     └────┬─────┘  └────┬─────┘  └──────────┘                            │
│          │             │                                                 │
│          ▼             ▼                                                 │
│     ┌─────────────────────────────────────────┐                           │
│     │      EXECUTION PIPELINE                │                           │
│     │  1. Remove Old Liquidity              │                           │
│     │  2. Swap to New Ratio (if needed)     │                           │
│     │  3. Calculate New Range               │                           │
│     │  4. Add New Liquidity                 │                           │
│     │  5. Log & Notify                      │                           │
│     └─────────────────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. MULTI-AGENT AI ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     AI ORCHESTRATION LAYER                              │
│                                                                          │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                    CENTRAL COORDINATOR                          │   │
│   │   • Task Distribution    • Result Aggregation    • Conflict     │   │
│   │                           Resolution                           │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │                                    │
│       ┌───────────────────────────┼───────────────────────────┐       │
│       │                           │                           │       │
│       ▼                           ▼                           ▼       │
│  ┌───────────┐             ┌───────────┐             ┌───────────┐     │
│  │   SCOUT   │             │  ANALYST  │             │   RISK    │     │
│  │   AGENT   │             │   AGENT   │             │  MANAGER  │     │
│  │           │             │           │             │           │     │
│  │ Inputs:   │             │ Inputs:   │             │ Inputs:   │     │
│  │ • All     │             │ • Pool    │             │ • Trade   │     │
│  │   Pools   │             │   Data    │             │   Intent  │     │
│  │ • Filters │             │ • Scout   │             │ • Exposure│     │
│  │ • Config  │             │   Rank    │             │ • Limits  │     │
│  │           │             │ • Market  │             │ • Correl. │     │
│  │ Process:  │             │   Data    │             │           │     │
│  │ • Fetch   │             │           │             │ Process:  │     │
│  │ • Score   │             │ Process:  │             │ • Check   │     │
│  │ • Rank    │             │ • Deep    │             │ • Filter  │     │
│  │ • Queue   │             │   Analysis│             │ • Circuit │     │
│  │           │             │ • Strategy│             │   Breaker │     │
│  │ Output:   │             │   Select  │             │           │     │
│  │ • Ranked  │             │ • ML      │             │ Output:   │     │
│  │   List    │             │   Predict │             │ • Approve │     │
│  │           │             │ • Confid. │             │ • Modify  │     │
│  │           │             │   Score   │             │ • Reject  │     │
│  │           │             │           │             │           │     │
│  │           │             │ Output:   │             │           │     │
│  │           │             │ • Action  │             │           │     │
│  │           │             │ • Strategy│             │           │     │
│  │           │             │ • Expect. │             │           │     │
│  │           │             │   Return  │             │           │     │
│  └───────────┘             └───────────┘             └───────────┘     │
│       │                           │                           │       │
│       └───────────────────────────┼───────────────────────────┘       │
│                                   │                                    │
│                                   ▼                                    │
│                          ┌───────────────┐                             │
│                          │   EXECUTOR    │                             │
│                          │    AGENT      │                             │
│                          │               │                             │
│                          │ Inputs:       │                             │
│                          │ • Approved    │                             │
│                          │   Trade       │                             │
│                          │               │                             │
│                          │ Process:      │                             │
│                          │ • Build TX    │                             │
│                          │ • Simulate    │                             │
│                          │ • Sign & Send │                             │
│                          │ • Confirm     │                             │
│                          │               │                             │
│                          │ Output:       │                             │
│                          │ • Receipt     │                             │
│                          │ • Status      │                             │
│                          └───────┬───────┘                             │
│                                  │                                     │
│                                  ▼                                     │
│                          ┌───────────────┐                             │
│                          │ MEMORY AGENT  │                             │
│                          │               │                             │
│                          │ • Store Trade │                             │
│                          │ • Log Result  │                             │
│                          │ • Update ML   │                             │
│                          │ • Feedback    │                             │
│                          │   Loop        │                             │
│                          └───────────────┘                             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. DATABASE ENTITY RELATIONSHIP DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ENTITY RELATIONSHIPS                           │
│                                                                          │
│  ┌──────────────────┐         ┌──────────────────┐                      │
│  │     POOLS        │         │    POSITIONS     │                      │
│  │──────────────────│         │──────────────────│                      │
│  │ PK: id           │         │ PK: id           │                      │
│  │ address (unique) │◄───────│ FK: pool_id      │                      │
│  │ token_a          │   1:M   │ strategy         │                      │
│  │ token_b          │         │ entry_price      │                      │
│  │ current_tvl      │         │ range_lower      │                      │
│  │ current_volume   │         │ range_upper      │                      │
│  │ fee_rate         │         │ investment_sol   │                      │
│  │ created_at       │         │ investment_usd   │                      │
│  └────────┬─────────┘         │ current_value_usd│                      │
│           │                  │ pnl_usd          │                      │
│           │                  │ fees_earned_usd  │                      │
│           │                  │ status           │                      │
│           │                  │ entry_time       │                      │
│           │                  └────────┬─────────┘                      │
│           │                           │                                 │
│           │                           │ 1:M                             │
│           │                           ▼                                 │
│           │                  ┌──────────────────┐                      │
│           │                  │     TRADES       │                      │
│           │                  │──────────────────│                      │
│           │                  │ PK: id           │                      │
│           └───────────────│ FK: position_id  │                      │
│                  M:1       │ type             │                      │
│                            │ action           │                      │
│  ┌──────────────────┐      │ amount_in        │                      │
│  │ POOL_SNAPSHOTS   │      │ amount_out       │                      │
│  │──────────────────│      │ slippage         │                      │
│  │ PK: id           │      │ gas_cost_sol     │                      │
│  │ FK: pool_id      │      │ tx_signature     │                      │
│  │ price            │      │ success          │                      │
│  │ tvl              │      │ timestamp        │                      │
│  │ volume_24h       │      └──────────────────┘                      │
│  │ volatility       │                                                │
│  │ opportunity_score│         ┌──────────────────┐                      │
│  │ timestamp        │         │  AI_DECISIONS    │                      │
│  └──────────────────┘         │──────────────────│                      │
│                               │ PK: id           │                      │
│                               │ FK: pool_id      │                      │
│  ┌──────────────────┐         │ action           │                      │
│  │  PERFORMANCE     │         │ strategy         │                      │
│  │──────────────────│         │ confidence       │                      │
│  │ PK: id           │         │ expected_apr     │                      │
│  │ date (unique)    │         │ executed         │                      │
│  │ starting_balance │         │ result_pnl       │                      │
│  │ ending_balance   │         │ timestamp        │                      │
│  │ realized_pnl     │         └──────────────────┘                      │
│  │ fees_earned      │                                                │
│  │ il_incurred      │         ┌──────────────────┐                      │
│  │ total_trades     │         │   AUDIT_LOG      │                      │
│  │ sharpe_ratio     │         │──────────────────│                      │
│  │ max_drawdown     │         │ PK: id           │                      │
│  └──────────────────┘         │ user_id          │                      │
│                               │ action           │                      │
│                               │ details (JSON)   │                      │
│                               │ ip_address       │                      │
│                               │ timestamp        │                      │
│                               └──────────────────┘                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. DEPLOYMENT ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION DEPLOYMENT                           │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      VPS / CLOUD SERVER                           │  │
│  │  (Recommended: 4 vCPU, 8GB RAM, 100GB SSD)                        │  │
│  │                                                                   │  │
│  │  ┌─────────────────────────────────────────────────────────────┐ │  │
│  │  │                    DOCKER COMPOSE                          │ │  │
│  │  │                                                             │ │  │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │ │  │
│  │  │  │   APP       │  │   DB        │  │  REDIS      │          │ │  │
│  │  │  │  Container  │  │  Container  │  │  Container  │          │ │  │
│  │  │  │             │  │             │  │             │          │ │  │
│  │  │  │ • Node.js   │  │ • Postgres  │  │ • Cache     │          │ │  │
│  │  │  │ • Bot Logic │  │ • Data      │  │ • Queue     │          │ │  │
│  │  │  │ • AI Agents │  │ • History   │  │ • Pub/Sub   │          │ │  │
│  │  │  │ • API       │  │ • Analytics │  │ • Sessions  │          │ │  │
│  │  │  │ • WebSocket │  │             │  │             │          │ │  │
│  │  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │ │  │
│  │  │         │                │                │                   │ │  │
│  │  │         └────────────────┴────────────────┘                 │ │  │
│  │  │                          │                                     │ │  │
│  │  │  ┌─────────────┐  ┌──────┴────────┐  ┌─────────────┐       │ │  │
│  │  │  │   NGINX     │  │   TELEGRAM    │  │  WATCHDOG   │       │ │  │
│  │  │  │             │  │   WEBHOOK     │  │             │       │ │  │
│  │  │  │ • Reverse   │  │   Handler     │  │ • Health    │       │ │  │
│  │  │  │   Proxy     │  │               │  │   Check     │       │ │  │
│  │  │  │ • SSL       │  │ • Bot Events  │  │ • Auto      │       │ │  │
│  │  │  │ • Rate      │  │ • Commands    │  │   Restart   │       │ │  │
│  │  │  │   Limit     │  │ • Alerts      │  │ • Alerts    │       │ │  │
│  │  │  └─────────────┘  └───────────────┘  └─────────────┘       │ │  │
│  │  │                                                             │ │  │
│  │  │  Shared Volumes:                                             │ │  │
│  │  │  • /data/db      → PostgreSQL data                         │ │  │
│  │  │  • /data/redis     → Redis persistence                       │ │  │
│  │  │  • /logs           → Application logs                        │ │  │
│  │  │  • /backups        → Automated backups                     │ │  │
│  │  └─────────────────────────────────────────────────────────────┘ │  │
│  │                                                                  │  │
│  │  Ports:                                                          │  │
│  │  • 80/443    → Nginx (HTTPS)                                    │  │
│  │  • 3000      → App API                                          │  │
│  │  • 5432      → PostgreSQL (internal)                           │  │
│  │  • 6379      → Redis (internal)                                 │  │
│  │                                                                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  External Connections:                                                 │
│  • Solana Mainnet RPC (api.mainnet-beta.solana.com)                 │
│  • Meteora API (api.meteora.ag)                                       │
│  • Jupiter API (quote-api.jup.ag)                                     │
│  • Telegram API (api.telegram.org)                                   │
│  • Price Feed APIs (optional)                                         │
│                                                                      │
│  Security:                                                           │
│  • Firewall: UFW (allow 80,443 only)                                  │
│  • SSL: Let's Encrypt auto-renewal                                   │
│  • Secrets: Environment variables + Vault                           │
│  • Backups: Daily to S3 / external storage                            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. TELEGRAM BOT ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      TELEGRAM INTEGRATION LAYER                         │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     TELEGRAM BOT MANAGER                          │  │
│  │                      (Telegraf.js)                                │  │
│  └───────────────────────────────┬──────────────────────────────────┘  │
│                                  │                                      │
│         ┌────────────────────────┼────────────────────────┐             │
│         │                        │                        │             │
│         ▼                        ▼                        ▼             │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐      │
│  │   COMMAND    │         │  NOTIFICATION│         │  INTERACTIVE │      │
│  │   HANDLER    │         │   MANAGER    │         │   KEYBOARD   │      │
│  │              │         │              │         │              │      │
│  │ • /start     │         │ • Profit     │         │ • Exit       │      │
│  │ • /stop      │         │ • Loss       │         │ • Rebalance  │      │
│  │ • /status    │         │ • Rebalance  │         │ • Hold       │      │
│  │ • /positions │         │ • Entry      │         │ • Confirm    │      │
│  │ • /pnl       │         │ • Emergency  │         │ • Cancel     │      │
│  │ • /emergency │         │ • Daily      │         │              │      │
│  │ • /settings  │         │   Report     │         │              │      │
│  └──────┬───────┘         └──────┬───────┘         └──────┬───────┘      │
│         │                        │                        │             │
│         └────────────────────────┼────────────────────────┘             │
│                                  │                                      │
│                                  ▼                                      │
│                       ┌────────────────────┐                             │
│                       │  SECURITY LAYER    │                             │
│                       │                    │                             │
│                       │ • User Whitelist   │                             │
│                       │ • IP Restriction   │                             │
│                       │ • Rate Limiting    │                             │
│                       │ • 2FA (Critical)   │                             │
│                       │ • Audit Logging    │                             │
│                       └─────────┬──────────┘                             │
│                                 │                                       │
│                                 ▼                                       │
│                       ┌────────────────────┐                             │
│                       │  TELEGRAM API      │                             │
│                       │  (api.telegram.org)  │                             │
│                       └────────────────────┘                             │
└─────────────────────────────────────────────────────────────────────────┘

Webhook Flow:
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│  User    │─────▶│ Telegram │─────▶│  Nginx   │─────▶│  Bot     │
│  Phone   │      │  Server  │      │  (SSL)   │      │  Handler │
└──────────┘      └──────────┘      └──────────┘      └────┬─────┘
                                                         │
                                                         ▼
                                              ┌──────────────────┐
                                              │  Process Command │
                                              │  • Validate      │
                                              │  • Execute       │
                                              │  • Respond       │
                                              └────────┬─────────┘
                                                       │
                                                       ▼
                                              ┌──────────────────┐
                                              │  Send Response   │
                                              │  (Markdown +     │
                                              │   Keyboard)      │
                                              └──────────────────┘
```

---

## 7. EVENT-DRIVEN ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      EVENT BUS (Redis Pub/Sub)                         │
│                                                                          │
│  Event Types:                                                            │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │  PRICE_UPDATE      → Real-time price changes                  │   │
│  │  POSITION_CHANGE   → Position value updates                    │   │
│  │  TRADE_EXECUTED    → New trade completed                       │   │
│  │  REBALANCE_NEEDED  → Rebalance trigger                         │   │
│  │  REBALANCE_DONE    → Rebalance completed                       │   │
│  │  RISK_ALERT        → Risk threshold breached                   │   │
│  │  AI_DECISION       → New AI decision made                      │   │
│  │  SYSTEM_STATUS     → Bot status changes                        │   │
│  │  TELEGRAM_CMD      → User command received                     │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Event Flow Example (Rebalance):                                       │
│                                                                          │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌────────┐ │
│  │  Monitor │──▶│   Event  │──▶│Rebalance │──▶│   Event  │──▶│Telegram│ │
│  │  Agent   │   │   Bus    │   │  Agent   │   │   Bus    │   │  Bot   │ │
│  │          │   │          │   │          │   │          │   │        │ │
│  │"Price   │   │REBALANCE_│   │ Execute  │   │REBALANCE_│   │ Notify │ │
│  │ out of │   │  NEEDED  │   │ Rebalance│   │   DONE   │   │  User  │ │
│  │ range" │   │          │   │          │   │          │   │        │ │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘   └────────┘ │
│                                                                          │
│  Subscribers:                                                            │
│  • Web Dashboard (WebSocket)                                           │
│  • Telegram Bot (Notifications)                                          │
│  • Database Logger (Audit trail)                                       │
│  • AI Memory (Learning)                                                  │
│  • Risk Manager (Validation)                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. SECURITY ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SECURITY LAYERS                                 │
│                                                                          │
│  Layer 1: Network Security                                               │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  • Firewall (UFW) - Only 80/443 open                              │  │
│  │  • Fail2Ban - Block brute force attempts                         │  │
│  │  • DDoS Protection - Rate limiting at Nginx                       │  │
│  │  • VPN Access - Admin access only via VPN                         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  Layer 2: Application Security                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  • JWT Authentication - Stateless auth tokens                      │  │
│  │  • API Rate Limiting - Prevent abuse                              │  │
│  │  • Input Validation - Sanitize all inputs                        │  │
│  │  • CORS Policy - Restrict origins                                │  │
│  │  • Security Headers - HSTS, CSP, etc.                            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  Layer 3: Wallet Security                                                │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  • Encrypted Storage - Keys in Vault/KMS                          │  │
│  │  • Never Log Keys - Keys never in logs                           │  │
│  │  • Transaction Simulation - Simulate before execute                 │  │
│  │  • Multi-sig (Optional) - Require multiple signatures             │  │
│  │  • Key Rotation - Periodic key changes                            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  Layer 4: Transaction Security                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  • Slippage Protection - Max 2% slippage                         │  │
│  │  • MEV Protection - Jito bundles for execution                    │  │
│  │  • Gas Optimization - Dynamic gas pricing                        │  │
│  │  • Transaction Retry - Exponential backoff                       │  │
│  │  • Confirmation Check - Verify on-chain                          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  Layer 5: Data Security                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  • Encrypted Database - Data at rest encryption                  │  │
│  │  • SSL/TLS - Data in transit encryption                          │  │
│  │  • Backup Encryption - Encrypted backups                         │  │
│  │  • Access Logging - Audit all data access                        │  │
│  │  • Data Retention - Auto-delete old data per policy              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

*End of Architecture Diagrams*
