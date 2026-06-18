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
- `/ranking` — Clasificación global (con botones a Estadísticas PRO y Match Record en línea horizontal)
- `/pro-stats` — Estadísticas PRO: % de acierto en gol directo/falta/penalty/corner por jugador (mínimo 25 partidos), toggle Abs/%, posición con medallas oro/plata/bronce
- `/match-record` — Match Record: historial completo de partidos del jugador logueado, con filtro de búsqueda de rival (autocompletado), desglose de goles por tipo, resultado de shootout entre paréntesis, fila verde/roja según V/D
- `/rules` — Reglas del juego
- `/duels` — Mis Retos (historial y pendientes)
- `/duel/new` — Crear reto
- `/duel/new/:leagueId` — Crear reto dentro de una liga

### Base de datos (Supabase)

| Tabla | Descripción |
|---|---|
| `players` | Perfiles de jugadores con estadísticas |
| `matchmaking_queue` | Cola de emparejamiento con expiración y `league_id` |
| `matches` | Partidos con estado, cronómetro, scores, `is_bot_match` y `bot_name` |
| `plays` | Registro de cada tirada |
| `duel_challenges` | Retos 1v1 con apuesta de skills |

### Funciones SQL clave
- `do_matchmaking(player_id)` — Emparejamiento atómico sin race conditions
- `do_league_matchmaking(player_id, league_id)` — Emparejamiento atómico dentro de una liga (filtrado por `league_id` en cola)
- `finalize_match_stats(...)` — Actualización atómica de estadísticas con lock; actualiza stats de liga si el partido tiene `league_id`
- `close_abandoned_matches(player_id)` — Limpieza de partidos zombie
- `create_duel_challenge(challenger, opponent, league, wager)` — Crea un reto validando stock
- `respond_duel_challenge(challenge_id, player_id, accept, confirmed_wager)` — Acepta o rechaza un reto
- `mark_duel_ready(challenge_id, player_id)` — Confirma "Jugar"; con 2 listos crea el partido
- `cancel_duel_challenge(challenge_id, player_id)` — Cancela un reto pendiente/accepted
- `dismiss_duel_challenge(challenge_id, player_id)` — Elimina un reto cancelado del historial
- `get_duelable_players(exclude_id)` — Jugadores con ≥1 skill disponible
- `get_my_duels(player_id)` — Todos los retos del jugador con winner_id del partido

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
Tira de nuevo → si para en múltiplo de 10 Y dentro del rango :20-:80 = GOL (dificultad aumentada en v2.2 — antes cualquier múltiplo de 10 sin restricción de rango)

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
- **Penalty (`:99` de Cerverai):** Cerverai elige siempre `impar` automáticamente y tira; respeta el rango :30-:70 igual que un humano
- **Penalty (`:99` del humano):** Cerverai consulta si el humano tiene Iron Fist disponible y, si es así, activa `golden_glove_state.waiting` y espera la resolución antes de tirar (fix v2.1 — antes nunca verificaba esto)
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

## Sistema de Retos (Duelos)

### Concepto
Duelos 1v1 con apuesta de skills (Sniper 🎯, Iron Fist 🧤, Mano de Dios 🙏). El ganador se queda con las skills apostadas por el perdedor. El partido de reto es un partido normal — cuenta para XP, misiones y estadísticas.

### Flujo
1. **Crear reto** — seleccionar rival (con ≥1 skill), elegir apuesta por tipo
2. **El rival tiene 24h** para aceptar o rechazar
3. **Al aceptar** — ambos deben pulsar "Jugar" en una ventana de 30s
4. **Si la ventana expira** — no se cancela, se puede reintentar hasta las 24h
5. **Partido** — partido normal con los iconos de apuesta visibles encima del badge de turno
6. **Resultado** — banner de recompensa al ganador con las skills ganadas

### Tablas de base de datos
- `duel_challenges` — retos con estado, apuesta, match_id, ready_players, dismissed_by

### Pantalla Mis Retos (`/duels`)
- Pestaña **Pendientes**: ENVIADOS + RECIBIDOS + LISTOS PARA JUGAR. Botón "Cancelar reto" en todas las tarjetas
- Pestaña **Historial**: franja de color (verde=ganado, rojo=perdido, gris=cancelado/rechazado). Indicador ▲/▼. Botón "Eliminar" solo en cancelados
- Actualización automática: polling 5s + burst 1s×5 al volver a la pestaña

### Restricciones
- Solo se puede retar a jugadores con ≥1 skill total
- La apuesta no puede superar el mínimo entre tu stock y el del rival
- Los límites se revalidan al aceptar Y al confirmar Jugar
- Cerverai no puede ser retado
- RLS desactivado en `duel_challenges` — operaciones protegidas por SECURITY DEFINER

## Skills

### Iron Fist (🧤) — rediseñado en v2.1
Habilidad defensiva en penalties. El defensor elige **Portero PAR** o **Portero IMPAR** (ya no rangos de centésima izquierda/derecha). Si la elección del portero coincide con la elección par/impar del tirador → el penalty falla siempre, sin importar dónde pare el cronómetro. Si no coincide → se aplica la regla normal del penalty (ver abajo). El rival no sabe qué portero elegiste hasta después de tirar. Cerverai también respeta el Iron Fist del humano (consulta `player_items` antes de tirar y espera resolución).

### Penalty — regla de rango (nuevo en v2.1)
Además de acertar par/impar, la centésima debe estar comprendida entre **:30 y :70**. Fuera de ese rango, el penalty falla siempre aunque el par/impar sea correcto. Aplica tanto a humanos como a Cerverai.

### Sniper (🎯)
Habilidad ofensiva en faltas. Amplía la ventana de gol de 5 a 10 centésimas (desde el mínimo de la barrera).

### Mano de Dios (🙏) — nueva super skill v2.1
Se activa si el jugador para el cronómetro en `:96`, `:97`, `:98`, `:99` o `:01` y tiene stock disponible. Aparece un badge con 5 segundos para decidir si usarla. Efecto: desplaza la centésima ±1 para forzar un resultado favorable (`:99→:00` GOL, `:01→:00` GOL, `:98→:99` Penalty, `:97→:98` Falta, `:96→:97` Corner). Solo se consigue completando las 6 misiones diarias del Vestuario en un mismo día (incluida la secreta) — el stock inicial es 0. Visible en Home, marcador de partido, Vestuario y Skills. Campo `hand_of_god_state` (jsonb) en `matches`, se limpia en cada jugada y al entrar a shootout. Usa el mismo `triggerFlash` no bloqueante (~600ms) que GOL/PALO/TARJETA, sin overlay separado.

### Adquisición (actualizado en v2.1 — ya no se otorgan skills por XP)
- Las skills (Iron Fist 🧤 y Sniper 🎯) se obtienen **exclusivamente** completando misiones diarias del Vestuario — el antiguo trigger de "+3 cada 100 XP" ha sido retirado
- Completar las 6 misiones diarias del Vestuario en un mismo día → 1 Mano de Dios 🙏

---

## Sistema XP (Glicko-1)

- Rating inicial: **1500**, RD inicial: **350**, mínimo: **50**
- XP visible en Home, Ranking, Announce y Result (con delta +/-)
- Ranking general ordenado por XP
- Partidos de liga no afectan al XP — solo puntos de liga +3/0

---

## Versiones estables

### v2.3-stable — Sistema de Retos completo

#### Sistema de Retos (Duelos)
- Duelos 1v1 con apuesta de skills entre jugadores
- Flujo completo: crear → aceptar → confirmar Jugar (ventana 30s, reintentos ilimitados) → partido → recompensa
- Pantalla Mis Retos con pestañas Pendientes/Historial, colores por resultado, cancelar y eliminar
- Iconos de apuesta visibles en Game durante el partido de reto
- Banner de recompensa en Result con polling de reintento
- Notificaciones push para cada evento del reto

#### Fixes incluidos
- FOUND vs IS NOT NULL en finalize_match_stats (las apuestas nunca se resolvían)
- close_abandoned_matches usaba started_at en vez de turn_started_at (cerraba partidos de reto prematuramente)
- Return temprano en Result.jsx saltaba carga de opponent/updatedPlayer (Cargando infinito tras abandono)
- Timer del rival sigue corriendo durante decisión de Mano de Dios — congelado vía UPDATE antes del popup
- winner_id leído de matches en vez de duel_challenges (banner de recompensa nunca aparecía)
- ReferenceError por showReplay usado antes de declararse en Result.jsx

### v2.2-stable — Fixes de XP, misiones, seguridad de Iron Fist y dificultad de córner

#### XP no se repartía en partidos contra bot
- `finalize_match_stats` usaba un guard `stats_updated` a nivel de partido: el primer jugador en llamar a la función calculaba el XP correctamente, pero el segundo jugador en llamar recibía `{xp: null}` y el cliente sobreescribía el `xp_result` correcto con ese null
- Fix: cuando el guard detecta que el partido ya fue procesado, la función ahora devuelve el `xp_result` ya guardado en vez de null; el cliente además solo escribe `xp_result` si `xp !== null`

#### XP no se repartía en partidos cerrados por inactividad/zombie
- `close_zombie_matches` y `close_abandoned_matches` cambiaban `status` a `finished` directamente en SQL sin asignar `winner_id`/marcador ni llamar a `finalize_match_stats` — dependían de que un cliente conectado detectara el cambio vía Realtime, pero estos partidos por definición ya no tienen ningún cliente escuchando
- Fix: ambas funciones ahora asignan marcador (0-5, pierde quien tenía `current_turn` en el momento del cierre) y llaman a `finalize_match_stats` directamente desde SQL
- Decisión de producto: no se repara el histórico de partidos ya afectados, solo aplica a partidos nuevos

#### Sistema de Retos (Duelos)

### Concepto
Duelos 1v1 con apuesta de skills (Sniper 🎯, Iron Fist 🧤, Mano de Dios 🙏). El ganador se queda con las skills apostadas por el perdedor. El partido de reto es un partido normal — cuenta para XP, misiones y estadísticas.

### Flujo
1. **Crear reto** — seleccionar rival (con ≥1 skill), elegir apuesta por tipo
2. **El rival tiene 24h** para aceptar o rechazar
3. **Al aceptar** — ambos deben pulsar "Jugar" en una ventana de 30s
4. **Si la ventana expira** — no se cancela, se puede reintentar hasta las 24h
5. **Partido** — partido normal con los iconos de apuesta visibles encima del badge de turno
6. **Resultado** — banner de recompensa al ganador con las skills ganadas

### Tablas de base de datos
- `duel_challenges` — retos con estado, apuesta, match_id, ready_players, dismissed_by

### Pantalla Mis Retos (`/duels`)
- Pestaña **Pendientes**: ENVIADOS + RECIBIDOS + LISTOS PARA JUGAR. Botón "Cancelar reto" en todas las tarjetas
- Pestaña **Historial**: franja de color (verde=ganado, rojo=perdido, gris=cancelado/rechazado). Indicador ▲/▼. Botón "Eliminar" solo en cancelados
- Actualización automática: polling 5s + burst 1s×5 al volver a la pestaña

### Restricciones
- Solo se puede retar a jugadores con ≥1 skill total
- La apuesta no puede superar el mínimo entre tu stock y el del rival
- Los límites se revalidan al aceptar Y al confirmar Jugar
- Cerverai no puede ser retado
- RLS desactivado en `duel_challenges` — operaciones protegidas por SECURITY DEFINER

## Skills de verificación de email otorgadas repetidamente
- `grant_verification_skills` no comprobaba si el jugador ya estaba verificado, y `Verify.jsx` la llamaba cada vez que se reprocesaba el flujo de verificación (ej. al reabrir un enlace tras reinstalar la PWA), sumando +5/+5 cada vez
- Fix: guard en SQL (comprueba `email_verified` antes de otorgar) + guard en cliente (comprueba `player.email_verified` antes de llamar al RPC)

#### Filtración de información en el popup de Iron Fist
- El fondo del popup donde el defensor elige Portero PAR/IMPAR tenía `background: rgba(0,0,0,0.93)` — un 7% de transparencia permitía que se filtrara visualmente la elección par/impar del lanzador a través del overlay, rompiendo la mecánica de información oculta del penalty
- Fix: fondo cambiado a `#000000` totalmente opaco

#### Banners de misión completada se perdían (sobreescritura entre jugadores)
- `update_daily_missions` devolvía `completed_missions` al cliente, que hacía `update({missions_result: ...})` directamente sobre `matches` — si ambos jugadores humanos completaban una misión distinta en el mismo partido, el segundo en escribir sobreescribía por completo el resultado del primero, perdiendo su banner sin ningún error visible
- Fix: `update_daily_missions` ahora escribe `matches.missions_result` directamente en SQL con `jsonb_set` sobre una clave `by_player[player_id]`, de forma atómica, sin pisar lo que el otro jugador ya escribió. El cliente ya no escribe esa columna
- Fix adicional: `Result.jsx` ahora filtra `missions_result.by_player[player.id]` (antes leía un array compartido `completed_missions` que mezclaba a ambos jugadores) y añade polling de reintento (igual que ya existía para XP) por si el dato tarda en propagarse

#### Dificultad de córner aumentada
- Antes: cualquier múltiplo de 10 (00 a 90) hacía gol
- Ahora: debe ser múltiplo de 10 Y estar en el rango :20-:80 inclusive (7 valores válidos: 20,30,40,50,60,70,80)

### v2.1-stable — Fix de misiones, Iron Fist rediseñado, Estadísticas avanzadas

#### Fix crítico — condición de carrera en conteo de misiones
- **Causa raíz 1:** cuando Cerverai hacía la última jugada del partido, `useBotPlayer.js` y `Game.jsx` competían por procesar las mismas misiones del humano con datos parciales de `plays`
- **Causa raíz 2 (más grave):** el guard booleano único `missions_processed` bloqueaba a AMBOS jugadores en partidas humano-vs-humano — solo quien hacía la última jugada procesaba sus misiones; el rival (observador) nunca llamaba a `updateStats`
- **Fix definitivo:** columna `missions_processed_players` (jsonb array) + función SQL `claim_missions_processing(p_match_id, p_player_id)` que reclama el guard por jugador individual, no por partido. El listener de Realtime en `Game.jsx` ahora también llama `updateStats` para el jugador observador antes de navegar al resultado

#### Iron Fist rediseñado
- El defensor elige "Portero PAR" o "Portero IMPAR" en vez de rangos de centésima izquierda/derecha
- Si la elección coincide con la del tirador → falla siempre; si no coincide → se aplica la regla normal
- Cerverai ahora respeta el Iron Fist del humano en penalties (antes nunca lo verificaba)

#### Penalty — nueva regla de rango
- Requiere par/impar correcto **y** centésima entre :30 y :70 (antes solo par/impar)
- Aplicado tanto a humanos como a Cerverai

#### Mano de Dios (🙏) — nueva super skill
- Se activa parando en :96, :97, :98, :99 o :01 con stock > 0
- Efecto ±1 centésima para forzar resultado favorable
- Solo se obtiene completando las 6 misiones diarias del Vestuario en un mismo día

#### Vestuario — dificultad aumentada
- 6 misiones diarias en vez de 5 (Beast Mode 30 goles, Sniper de Élite 15 goles de falta, Maratoniano 25 partidos)
- Las skills (Iron Fist y Sniper) ya **no** se otorgan por hitos de XP — exclusivamente vía misiones

#### Nuevas pantallas de estadísticas
- `/pro-stats` — % de acierto por tipo de gol, mínimo 25 partidos, función SQL `get_pro_stats()`
- `/match-record` — historial completo de partidos con filtro de rival, función SQL `get_match_record()`

#### Autenticación y PWA
- Recuperación de cuenta vía código OTP de 8 dígitos en vez de magic link (soluciona el problema de sesión aislada entre navegador y PWA instalada en iOS)
- Banner de actualización con doble capa: Service Worker + comprobación activa de versión vía `public/version.json` (más fiable en iOS)

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
- **6 misiones diarias** con nombres épicos, reinicio a medianoche Europe/Madrid (cálculo en frontend vía `toLocaleDateString('sv-SE', {timeZone: 'Europe/Madrid'})` para evitar bug de UTC):
  - 🏆 Hat-Trick de Victorias — 3 victorias seguidas (1 🎯 + 1 🧤)
  - 💥 Beast Mode — **30 goles/día** (1 🎯 + 1 🧤)
  - 🛡️ Muralla Infranqueable — ganar sin recibir gol (1 🎯 + 1 🧤)
  - ⚡ Sniper de Élite — **15 goles de falta** (1 🎯 + 1 🧤)
  - 🎮 Maratoniano — **25 partidos completados** (1 🎯 + 1 🧤)
  - 🔒 Secreta — rota por día, desbloquea al completar 2 misiones (2 🎯 + 2 🧤)
- **Completar las 6 misiones del día** → 1 Mano de Dios 🙏 (flag `hand_of_god_granted` en `daily_missions` como control diario)
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

---

## Recuperación de cuenta (código OTP)

Las cuentas protegidas con email se recuperan mediante **código de 8 dígitos** introducido directamente dentro de la app, en vez de depender de un magic link abierto en el navegador. Esto es necesario porque en PWAs instaladas (especialmente iOS), un magic link abierto desde el cliente de email se abre en el navegador del sistema, no en la PWA — son contextos de almacenamiento distintos y la sesión nunca llega a la app instalada.

### Flujo
1. El usuario introduce su email en el modal "🔑 Recuperar cuenta" en Home
2. `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })` envía el email
3. El usuario introduce el código de 8 dígitos directamente en la app
4. `supabase.auth.verifyOtp({ email, token: code, type: 'email' })` valida y crea la sesión sin salir nunca de la PWA

### Configuración de Supabase necesaria
- **Authentication → Email Templates → Magic Link** debe incluir `{{ .Token }}` visible en el HTML, además de `{{ .ConfirmationURL }}`
- Al editar el template, el dashboard de Supabase requiere a veces **resetear y volver a cargar** el template (no basta con editar y guardar) para que el cambio surta efecto realmente al usuario final
- Si se usa SMTP personalizado (ej. Brevo vía `smtp-relay.brevo.com`), Supabase sigue generando el HTML completo y solo usa el SMTP como transporte — no hay sustitución de plantilla salvo que se use la API de plantillas del proveedor en vez de SMTP puro
- La longitud del código OTP debe coincidir entre la configuración de Supabase y el frontend (`Home.jsx`, función `handleVerifyCode`, validación `code.length !== 8`)

---

## Banner de actualización (PWA)

Las PWAs cachean agresivamente vía Service Worker, especialmente en iOS, donde el ciclo de vida de actualización del SW es poco fiable para apps instaladas en pantalla de inicio. Se implementó un sistema de doble capa:

### Capa 1 — Service Worker (`public/sw.js`)
- No hace `skipWaiting()` automático en `install` — espera confirmación del usuario
- `src/components/UpdateBanner.jsx` detecta `reg.waiting` o `updatefound`→`installed` y muestra un modal "Actualización disponible"
- Al pulsar "Aceptar", se envía `postMessage('skipWaiting')` al SW en espera, lo que dispara `controllerchange` → reload automático

### Capa 2 — Comprobación activa de versión (más fiable en iOS)
- `public/version.json` contiene `{ "version": "N" }`, se sube manualmente en cada deploy que requiera forzar actualización visible
- Al montar, `UpdateBanner.jsx` hace `fetch('/version.json', { cache: 'no-store' })` y compara contra `localStorage.getItem('app_version')`
- Si no hay nada en localStorage, se trata como versión `'0'` (no se salta el chequeo silenciosamente)
- Si hay diferencia, se muestra el banner; al aceptar, se actualiza localStorage y se hace `window.location.reload()`

### Importante para futuros deploys
**Para que un cambio se vea reflejado en dispositivos con la PWA ya instalada, hay que subir manualmente el número en `public/version.json` antes de cada deploy relevante.** Sin este paso, el Service Worker (especialmente en iOS) puede tardar mucho en detectar la actualización o no detectarla en absoluto.

---

## Estadísticas avanzadas

### Estadísticas PRO (`/pro-stats`)
Tabla con toggle Abs/% mostrando % de acierto en gol directo, falta, penalty y corner por jugador (mínimo 25 partidos jugados, histórico completo sin filtro de fecha). Calculada vía función SQL agregada `get_pro_stats()` (no se debe calcular esto con un bucle N+1 desde el cliente — es ineficiente y propenso a bugs de timing). Cerverai puede incluirse o excluirse según decisión de producto — actualmente incluido, pero su % de falta/penalty/corner siempre será 0/0 porque el bot nunca inserta filas `GOL_FALTA`/`FALTA_FALLO`/etc en `plays`, solo el evento que originó el pending (`FALTA`/`PENALTY`/`CORNER`).

### Match Record (`/match-record`)
Historial completo de partidos del jugador logueado vía función SQL `get_match_record(p_player_id)`. Incluye fecha (DD/MM/YYYY), rival, marcador con shootout entre paréntesis (ej. `3(5):3(4)`), desglose de goles por tipo, fila verde/roja según resultado. Filtro de búsqueda de rival con autocompletado por prefijo (case-insensitive, se actualiza dinámicamente conforme se escribe).
