# TODO LIST — SnapGoal

_Última actualización: 18 junio 2026_

## 🔴 Pendiente — verificar banner de recompensa de Reto en todos los escenarios

El banner aparece vía polling (hasta 6 reintentos × 1.5s) + useEffect cuando `duelReward` se carga.
Verificar empíricamente que aparece en estos casos:
- [ ] Ganador hace la última tirada (caso normal)
- [ ] Ganador gana por gol en propia del rival (sin replay del ganador)
- [ ] Ganador gana por abandono del rival
- [ ] Ganador gana por inactividad del rival
- [ ] Ganador tiene además misiones completadas (banner de misión → luego banner de reto)

## 🔴 Pendiente — verificar actualización automática de UI en Reto (pestaña Pendientes)

El polling de 5s + burst de 1s al volver a la pestaña debería cubrir todos los casos.
Verificar que test9 ve automáticamente el reto de patxitets00 sin recargar manualmente.

## 🟡 Pendiente — decisión sobre stock de prueba de test8/test9

Stock de test8 y test9 quedó en valores no redondos tras las pruebas.
Pendiente decidir si importa dejarlo así al ser cuentas de prueba, o resetearlo.

## 🟢 Pendiente — tag de versión estable v2.3-stable

Una vez cerrada la funcionalidad Reto completamente:
```bash
git tag v2.3-stable
git push origin v2.3-stable
```

---

# Arquitectura completa de la funcionalidad Reto (referencia)

## Resumen
Duelos 1v1 con apuesta de skills (Sniper/pro_shooter, Iron Fist/golden_glove,
Mano de Dios/hand_of_god). Puede lanzarse con o sin liga. El partido resultante es un
partido normal (cuenta para XP/stats/liga/misiones). Expira a las 24h sin respuesta.
Tras aceptar, ambos deben confirmar "Jugar" en una ventana de 30s para que se cree el
partido; si falla la ventana, no se cancela, solo se resetea y se puede reintentar
indefinidamente hasta la expiración de 24h.

## Tabla `duel_challenges`
Columnas: `id, challenger_id, opponent_id, league_id, status (pending/accepted/rejected/
expired/completed/cancelled), wager (jsonb), final_wager (jsonb), match_id, created_at,
expires_at, ready_players (jsonb array), ready_started_at (timestamptz),
dismissed_by (jsonb array, default [])`.

## Funciones SQL

**create_duel_challenge(challenger, opponent, league, wager)**: valida que ambos tengan
≥1 skill total y que cada item no exceda el mínimo entre ambos stocks.

**respond_duel_challenge(challenge_id, player_id, accept, confirmed_wager)**: si rechaza
→ status rejected. Si acepta, revalida stock; si algún item ya no cabe, devuelve
needs_confirmation con max_wager sin aplicar nada. Solo marca status accepted y fija
final_wager, ya NO crea el partido al aceptar.

**mark_duel_ready(challenge_id, player_id)**: gestiona el botón "Jugar". Si la ventana
de 30s expiró, resetea ready_players/ready_started_at antes de continuar. Con 2 listos,
revalida stock y crea el partido. Con 1 listo, guarda ready_started_at.

**cancel_duel_challenge(challenge_id, player_id)**: cancela un reto en estado
pending/accepted. Si tiene partido asociado, solo permite cancelar si el partido está
en `announcing`. En ese caso también cancela el partido.

**dismiss_duel_challenge(challenge_id, player_id)**: elimina un reto cancelado del
historial del jugador. Si ambos jugadores lo descartan, borra la fila. Si solo uno,
añade su player_id a `dismissed_by` y `get_my_duels` ya no se lo muestra.

**get_duelable_players(exclude_id)**: jugadores con ≥1 skill total, con stock desglosado.

**get_my_duels(player_id)**: todos los retos (enviados y recibidos) con role calculado,
nombre del otro jugador, ready_players, y winner_id del partido asociado. Excluye retos
donde el jugador ya está en `dismissed_by`.

**Resolución de apuesta en finalize_match_stats**: busca duel_challenges con
match_id=p_match_id AND status='accepted', usando `IF FOUND THEN` (nunca IS NOT NULL).
Transfiere final_wager del perdedor al ganador, marca status completed.

## Backend

**api/notify-duel.js**: endpoint unificado con parámetro `event`
(challenge_received, challenge_accepted, challenge_rejected, player_ready).

## Frontend

**src/screens/DuelCreate.jsx**: selección de rival y composición de apuesta.
Rutas: /duel/new y /duel/new/:leagueId.

**src/screens/Duels.jsx**: pantalla "Mis Retos" con pestañas PENDIENTES/HISTORIAL.
- PENDIENTES: secciones ENVIADOS (pending+sent) y RECIBIDOS (pending+received) y
  LISTOS PARA JUGAR (accepted). Botón "Cancelar reto" en todas las tarjetas pendientes.
- HISTORIAL: retos completados/rechazados/cancelados/expirados. Franja de color
  izquierda (verde=ganado, rojo=perdido, gris=cancelado/rechazado, ámbar=pendiente).
  Indicador ▲ Ganado / ▼ Perdido en completados. Botón "Eliminar" solo en cancelados.
- Polling 5s + burst 1s×5 al volver a la pestaña + visibilitychange/focus.
- Listener Realtime con filtros por challenger_id y opponent_id (INSERT+UPDATE).

**src/screens/Game.jsx**: muestra iconos de skills apostadas encima del badge de turno
si el partido tiene un reto asociado (cargado al inicio vía query a duel_challenges).
Timer congelado para el rival durante la decisión de Mano de Dios.

**src/screens/Result.jsx**: banner de recompensa de reto (🏆 ¡Has ganado el reto!)
tras las misiones completadas (si las hay). Carga el reto con polling de hasta 6
reintentos × 1.5s para cubrir el caso en que finalize_match_stats no haya corrido aún.

## Decisiones de diseño confirmadas

- Reto puede lanzarse con o sin liga; cuenta para XP/stats/liga/misiones normal.
- Expira a las 24h sin respuesta.
- Límites de apuesta se recalculan al aceptar Y al confirmar Jugar (doble revalidación).
- Si el stock cambió, se reduce la apuesta y se pide confirmación, no se cancela.
- Ventana de 30s para confirmar Jugar; si falla, NO se cancela, se puede reintentar.
- Al confirmar Jugar ambos → partido creado automáticamente → van a Announce.jsx.
- Notificación push lleva a /duels genérico.
- RLS desactivado en duel_challenges (operaciones sensibles protegidas por SECURITY
  DEFINER en las funciones SQL).
