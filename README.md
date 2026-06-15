# SnapGoal

**"Sin VAR. Sin lesiones. 30 secondi sono molto lunghi."**

Web app de fútbol multijugador en tiempo real. Dos jugadores compiten parando un cronómetro compartido en centésimas de segundo.

---

## Stack técnico

- **Frontend:** React + Vite
- **Base de datos + Realtime:** Supabase
- **Despliegue:** Vercel
- **Repositorio:** GitHub

---

## Arquitectura

### Pantallas
- `/` — Home (registro / bienvenida)
- `/queue` — Matchmaking (búsqueda de rival, 10s máximo)
- `/announce/:matchId` — Pantalla de confirmación antes del partido
- `/game/:matchId` — Partido en curso
- `/result/:matchId` — Resultado final
- `/ranking` — Clasificación global
- `/rules` — Reglas del juego

### Base de datos (Supabase)

| Tabla | Descripción |
|---|---|
| `players` | Perfiles de jugadores con estadísticas |
| `matchmaking_queue` | Cola de emparejamiento con expiración y `league_id` |
| `matches` | Partidos con estado, cronómetro, scores, `is_bot_match` y `bot_name` |
| `plays` | Registro de cada tirada |

### Funciones SQL clave
- `do_matchmaking(player_id)` — Emparejamiento atómico sin race conditions
- `do_league_matchmaking(player_id, league_id)` — Emparejamiento atómico dentro de una liga (filtrado por `league_id` en cola)
- `finalize_match_stats(...)` — Actualización atómica de estadísticas con lock; actualiza stats de liga si el partido tiene `league_id`
- `close_abandoned_matches(player_id)` — Limpieza de partidos zombie

---

## Reglas del juego

### Cronómetro
- Compartido entre ambos jugadores, en formato `seg:cen`
- Duración máxima del partido: **30 segundos**
- Nunca se resetea — acumula tiempo

### Resultados por centésima
| Centésimas | Evento |
|---|---|
| `:00` | ⚽ Gol directo |
| `:99` | 🥅 Penalty |
| `:98` | 🧤 Falta |
| `:97` | 🚩 Córner |
| `:13` | 💥 Gol en propia |

### Penalty (`:99`)
El tirador elige par o impar → tira de nuevo → si la centésima coincide = GOL

### Falta (`:98`)
El rival elige la barrera (20-25, 30-35, 40-45) → el tirador debe parar dentro del rango = GOL

### Córner (`:97`)
Tira de nuevo → si para en múltiplo de 10 = GOL

### Tarjetas
- **+2s sin parar** → Tarjeta amarilla
- **+5s sin parar** → Tarjeta roja → gol al rival + cronómetro vuelve al valor anterior
- **2 amarillas** → Tarjeta roja automática
- **2 rojas al mismo jugador** → Derrota 0-5

### Inactividad
- **15 segundos sin tirar** → partido terminado, derrota 0-5
- Círculo verde→rojo alrededor del botón indica el tiempo restante

### Fin del partido
- Ventaja de **5 goles** → fin inmediato
- **30 segundos** → fin por tiempo
- **Empate** → penaltis a muerte súbita (infinita hasta desempate)

### Puntos
- Victoria: **3 pts** · Derrota: **0 pts**

---

## Bot: Cerverai

### Concepto
Cerverai es un jugador de IA que garantiza que ningún jugador humano se quede sin rival. Si tras 10 segundos buscando no se encuentra rival (en partida normal o de liga), el jugador es redirigido automáticamente a la pantalla de Announce para jugar contra Cerverai.

### Flujo
1. `Queue.jsx` — tras 10s sin rival, crea un partido contra Cerverai (`is_bot_match: true`, `bot_name: 'Cerverai'`) y navega a `/announce/:matchId`
2. `Announce.jsx` — Cerverai aparece ya como "Listo ✓". El jugador humano debe pulsar JUGAR para confirmar
3. `Game.jsx` — el hook `useBotPlayer` gestiona los turnos de Cerverai en el cliente del jugador humano

### Lógica de juego de Cerverai
- **Turno normal:** Cerverai espera entre 800ms y 2500ms antes de tirar (simulando tiempo de reacción humano)
- **Distribución de centésimas:**
  - Si el cronómetro está entre 83-93: tira corto (7-15 centésimas) para intentar llegar a 00
  - 50% de probabilidad de caer en 85-99 o 00-06 (en torno a 00)
  - 30% de probabilidad de caer en 70-84
  - 20% de probabilidad de caer en 0-69
- **Falta (`:98` de Cerverai):** el jugador humano elige la barrera libremente (igual que contra un humano)
- **Falta (`:98` del humano):** se asigna automáticamente la barrera 30-35; Cerverai apunta a la ventana elegida con 60% de probabilidad de acertar
- **Penalty (`:99` de Cerverai):** Cerverai elige siempre `impar` automáticamente y tira
- **Penalty (`:99` del humano):** el humano elige par o impar normalmente; Cerverai no usa Iron Fist
- **Córner (`:97`):** Cerverai tira de nuevo automáticamente con la misma distribución sesgada
- **Shootout (penaltis de desempate):** Cerverai elige siempre `impar` y tira automáticamente; 50% de probabilidad de gol

### Restricciones de Cerverai
- Nunca acumula ni usa skills (Iron Fist, Sniper)
- No hay opción de Revancha tras una partida contra Cerverai
- Cerverai no compite en ligas como miembro, pero puede ser rival en partidas de liga
- Sus stats globales no se actualizan (los UPDATEs de `league_members` no encuentran fila para Cerverai y se ignoran silenciosamente)

### Partidas de liga contra Cerverai
- Si no hay rival disponible en una liga, el jugador juega contra Cerverai
- El partido lleva `league_id` — los puntos de liga (+3 por victoria) y XP se acumulan normalmente para el jugador humano
- Cerverai no suma puntos en ninguna clasificación

### Implementación técnica
- `src/hooks/useBotPlayer.js` — hook React que gestiona toda la lógica del bot
- `src/screens/Queue.jsx` — `createBotMatch()` crea el partido con `is_bot_match: true`
- `src/screens/Announce.jsx` — detecta `is_bot_match` y marca a Cerverai como listo automáticamente
- `src/screens/Game.jsx` — llama a `useBotPlayer` y desactiva el disconnect watcher para partidas bot
- `src/screens/Shootout.jsx` — lógica de shootout del bot integrada en un `useEffect`
- ID de Cerverai en Supabase: `ec21fbbe-c14f-4677-aa19-052fd54ff364`

---

## Sistema de Ligas privadas

### Concepto
Un jugador crea una liga privada con nombre y duración. Se genera un código de 6 caracteres que comparte con sus amigos. Dentro de la liga los jugadores solo se emparejan entre ellos y tienen su propio ranking.

### Flujo
1. **Crear liga** — nombre + duración predefinida → código generado automáticamente
2. **Invitar** — compartir código por WhatsApp (link directo) o manualmente
3. **Unirse** — introducir el código de 6 caracteres
4. **Jugar** — "Buscar rival en la liga" empareja solo con miembros de esa liga; si no hay rival en 10s, se juega contra Cerverai
5. **Ranking** — clasificación interna con puntos, V/E/D, goles

### Duraciones disponibles
2 días · 1 semana · 2 semanas · 1 mes · 1 año

### Reglas de liga
- Máximo **50 jugadores** por liga
- Mínimo **10 partidos** jugados en total para declarar ganador
- Gana quien más puntos tenga al expirar la liga
- **Empate a puntos** → partido de desempate entre los empatados
- Liga expirada → visible pero no jugable (ranking final permanente)

### Roles
- **Admin** — creador de la liga, puede expulsar jugadores y eliminar la liga
- **Miembro** — puede jugar y ver el ranking, puede salir de la liga

### Chat en partido de liga
Durante un partido de liga aparece un botón 💬 en la barra inferior. Los jugadores pueden enviar mensajes preconfigurados:
- ⚽ GOOOL · 💥 BOOOM · 😂 AHAHAH · 🚩 VAR!!! · 🤨 REF? · 🤝 GG

### Tablas de base de datos
- `leagues` — ligas con código, fecha de expiración y creador
- `league_members` — miembros con estadísticas internas de liga
- `league_messages` — mensajes de chat por partido

### Funciones SQL
- `generate_league_code()` — genera código único de 6 caracteres
- `do_league_matchmaking(player_id, league_id)` — emparejamiento atómico dentro de una liga
- `finalize_match_stats(...)` — actualiza stats globales Y de liga si el partido tiene `league_id`

---

## Skills

### Iron Fist (🧤)
Habilidad defensiva en penalties. El defensor elige derecha (bloquea 50-99) o izquierda (bloquea 00-49). Si el tirador para en el rango bloqueado, el penalty es parado.

### Sniper (🎯)
Habilidad ofensiva en faltas. Amplía la ventana de gol de 5 a 10 centésimas (desde el mínimo de la barrera).

### Adquisición
- Cada 100 XP por encima de 1500 → +3 Iron Fists y +3 Snipers (trigger SQL automático)

---

## Sistema XP (Glicko-1)

- Rating inicial: **1500**, RD inicial: **350**, mínimo: **50**
- XP visible en Home, Ranking, Announce y Result (con delta +/-)
- Ranking general ordenado por XP
- Partidos de liga no afectan al XP — solo puntos de liga +3/0

---

## Versiones estables

### v1.9-stable — Vestuario, Misiones Diarias y Robustez

#### Bot Cerverai
- Cerverai disponible también en partidas de liga (puntos de liga y XP se acumulan para el humano)
- Fix: barrera en falta de Cerverai — el humano elige libremente
- Fix: registro correcto de plays de Cerverai (GOL_DIRECTO, GOL_FALTA, GOL_CORNER)
- Fix: matchmaking de liga filtrado por `league_id` en cola (evita emparejamiento entre ligas)

#### Vestuario (Desafíos diarios)
- Nueva sección **🏟️ Vestuario** accesible desde Home (botón al lado de Academy)
- **Racha diaria** con círculos visuales (5 círculos por ciclo) y premio cada 5 días consecutivos
  - 5 días: 2 🎯 + 2 🧤 · 10 días: 3 🎯 + 3 🧤 · y así sucesivamente
  - Timezone ajustado a Europe/Madrid
- **5 misiones diarias** con nombres épicos, reinicio a medianoche:
  - 🏆 Hat-Trick de Victorias — gana 3 seguidas (1 🎯 + 1 🧤)
  - 💥 Beast Mode — 20 goles en un día (2 🎯 + 2 🧤)
  - 🛡️ Muralla Infranqueable — gana sin recibir goles (1 🎯 + 1 🧤)
  - ⚡ Sniper de Élite — 10 goles de falta (2 🎯 + 2 🧤)
  - 🎮 Maratoniano — juega 10 partidos hoy (2 🎯 + 2 🧤)
- **Misión secreta 🔒** — se desbloquea al completar 2 misiones; requiere meter un gol en propia
- **Banner de misión completada** entre replay y resultado — botón "✓ ¡Recibido!" para cada misión
- **Contador total** de misiones completadas en la pantalla del Vestuario
- Racha visible en el botón del Vestuario en Home (🔥 N días)
- Nuevas tablas SQL: `daily_streaks`, `daily_missions`
- Nuevas funciones SQL: `update_daily_streak`, `update_daily_missions`, `increment_missions_completed`
- Nueva columna en `players`: `missions_completed`
- Nueva columna en `matches`: `missions_result`

#### Resultado y Replay
- Replay del último gol a cámara lenta antes del resultado
  - Empieza en la jugada anterior al último gol del ganador
  - Termina exactamente en la centésima del gol
  - Indicador REC 🔴 parpadeante, nombre del ganador en grande, tipo de gol
- Botón **📲 Compartir en WhatsApp** con link directo al resultado del partido (solo cuando el ganador metió un gol real)
- 2 segundos de margen antes de navegar a resultado o shootout tras última jugada

#### Robustez
- Disconnect watcher reducido de 30s a 15s; warning de 10s a 6s
- Countdown visible cuando rival desaparece ("victoria en Xs")
- Función SQL `close_zombie_matches` — cierra partidos con >3 min sin actividad, llamada desde heartbeat
- Fix `processingRef` — siempre se resetea en `finally` aunque `processPlay` falle
- Fix: resultType correcto en plays (GOL_DIRECTO, GOL_FALTA, GOL_PENALTY, GOL_CORNER vs FALTA_FALLO etc.)
- Fix: caché del jugador actualizado tras cada partido — stats correctas en Announce
- Fix: countdown de 10s visible en búsqueda de liga igual que en búsqueda general

#### Ligas
- Partido cancelado en Announce: botón "Volver a la Liga" además de "Volver al inicio"
- Fix: matchmaking de liga filtrado por `league_id` — evita emparejamiento entre ligas distintas

### v1.8-stable — Cerverai (bot)
- Bot Cerverai garantiza rival siempre (partidas normales y de liga)
- Lógica de juego sesgada hacia centésimas altas (cercanas a 00)
- Detección inteligente de posición del cronómetro (83-93 → tiro corto)
- Faltas, penalties, córners y shootout con lógica específica del bot
- Sin revancha contra Cerverai
- Puntos de liga y XP se acumulan normalmente para el jugador humano
- Fix: matchmaking de liga filtrado por `league_id` en cola (evita emparejamiento entre ligas)

### v1.7-stable
- **Academy**: centro de entrenamiento con penalties y faltas
  - 3 modos de dificultad: Amateur, National Class, World Class
  - Stats por sesión: goles/tiros, racha actual, mejor racha
  - Historial guardado en tabla `training_sessions`

### v1.6-stable
- Popup Iron Fist y Sniper rediseñados
- Chat disponible en todos los partidos
- Bug fix: timer no se resetea al enviar mensajes de chat

### v1.5-stable
- Iron Fist y Sniper implementados
- Sistema genérico de items en tabla `player_items`
- Hitos de XP con trigger SQL

### v1.4-stable
- Sistema XP Glicko-1

### v1.3-stable
- Penaltis de muerte súbita infinita
- Ventana de falta: 20-25, 30-35, 40-45

### v1.0-stable
- Primera versión estable — matchmaking robusto, timer, estadísticas

### Recuperar una versión estable
```bash
git checkout v1.0-stable
```

---

## Variables de entorno
VITE_SUPABASE_URL=https://xxxx.supabase.co

VITE_SUPABASE_ANON_KEY=eyJ...

VITE_VAPID_PUBLIC_KEY=...

VAPID_PRIVATE_KEY=...

VAPID_MAILTO=...

SUPABASE_URL=...

SUPABASE_SERVICE_ROLE_KEY=...

---

## Desarrollo local

```bash
npm install
npm run dev
```

---

## Despliegue

Automático via Vercel al hacer push a `main`. Vercel usa `pnpm`.

---

## Escalabilidad

### Situación actual (~100 jugadores simultáneos)
- Polling con jitter aleatorio 1-4s para distribuir carga
- `do_matchmaking` con `FOR UPDATE SKIP LOCKED` — sin race conditions
- Supabase free tier: 60 conexiones simultáneas

### Para escalar a cientos de jugadores
Implementar matchmaker centralizado via Supabase Edge Function:
- Corre cada 2s, empareja todos los jugadores en cola de una vez
- Clientes solo escuchan via Realtime — sin polling

---

## Decisiones técnicas importantes

### Cronómetro
- El **tirador** usa `performance.now()` localmente — máxima precisión
- El **observador** sincroniza via Realtime con compensación de latencia
- `iAmTheShooterRef` separa lógica de tirador y observador
- `timerVersionRef` previene ticks fantasma de intervals anteriores

### Matchmaking
- Función SQL atómica con `FOR UPDATE SKIP LOCKED`
- Cola con expiración de 10s y `league_id` para filtrado por liga
- Polling cada 1-4s como respaldo al Realtime

### Estadísticas
- `finalize_match_stats` con lock atómico (`stats_updated`) previene doble contabilización

### Autenticación
- Sesión anónima de Supabase — sin email ni contraseña
- Nombre de usuario único, sesión persistente en el dispositivo

---

## PWA Push Notifications

- **Frontend:** `src/lib/pushNotifications.js`
- **Service Worker:** `public/sw-push.js`
- **Backend:** `api/notify-league.js` — Vercel Serverless Function con `web-push`
- **Base de datos:** tabla `push_subscriptions`

Flujo: permiso → suscripción guardada → cualquier miembro convoca → notificación a todos los miembros excepto el remitente.

---

## Dashboard de administración

- Acceso en `/admin/login` con magic link
- KPIs: jugadores, partidos, goles, abandonados, ligas
- Gráficos con recharts: nuevos jugadores, acumulado, partidos, goles
- Top 10 jugadores con stats completas
- Vistas SQL: `admin_player_stats`, `admin_match_stats`, `admin_active_players`, `admin_top_players`, `admin_totals`

---

## Presencia en tiempo real

- Sistema unificado via Supabase Realtime (`snapgoal-presence`)
- Dot verde (idle), ámbar (jugando), rojo (offline)
- `useTrackPresence` en Home y Game
- `usePresenceMap` en Ranking, League y Home
