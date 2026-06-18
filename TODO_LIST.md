# TODO LIST — SnapGoal

_Última actualización: 18 junio 2026_

## 🔴 Pendiente inmediato — verificación de actualización automática de UI en Reto

Pregunta sin verificar empíricamente: ¿pulsar "Aceptar" en un reto actualiza la pantalla
automáticamente sin recargar manualmente, en el ordenador donde antes fallaba?

Se creó un reto de prueba específicamente para esto:
- challenge_id: `a3864b61-9781-4200-b944-235192c90a55`
- De test8 hacia patxitets00, apostando 1 pro_shooter

**Próximo paso:** entrar a "Mis Retos" en el ordenador problemático, abrir la consola del
navegador (F12 → Console), pulsar "Aceptar" en ese reto, y comprobar:
- ¿La tarjeta desaparece sola de "Recibidos" y aparece en "Listos para jugar"?
- ¿Aparece algún error en consola (rojo) en el momento de pulsar?

Si falla: revisar si `setDuels(data || [])` dentro de `loadDuels()` realmente dispara
re-render, o si hay algún problema de caché/Service Worker específico de ese navegador.

## 🔴 Pendiente — recargar manualmente tras el fix de Result.jsx

El fix de "Cargando..." infinito en Result.jsx (ver bug #5 abajo) ya está commiteado y
desplegado, pero los dos dispositivos que se quedaron atascados en esa pantalla negra
necesitan un refresco forzado manual (Ctrl+Shift+R o equivalente) una sola vez para
tomar el JS nuevo, ya que cargaron la versión vieja antes del fix.

## 🟡 Pendiente — actualizar ERRORES.md

Tres bugs de esta fase de Reto aún no están documentados en el archivo real ERRORES.md:

1. **FOUND vs IS NOT NULL**: en PL/pgSQL, declarar `v_duel record` y comparar
   `v_duel IS NOT NULL` tras un `SELECT INTO` no es fiable en este motor — aunque la fila
   se encuentra correctamente, la condición se evalúa como falsa, saltándose el bloque
   sin error visible. Solución: usar `FOUND` (variable especial que Postgres actualiza
   tras cualquier SELECT INTO). Aplicado en `finalize_match_stats`. Este bug habría hecho
   que NINGUNA apuesta de duelo se resolviera nunca.

2. **turn_started_at vs started_at en close_abandoned_matches**: la función usaba
   `started_at` (momento de creación del registro del partido) en vez de
   `turn_started_at` (momento real de última actividad/turno) para medir inactividad de
   5 minutos. Esto cerraba partidos de Reto prematuramente con marcador 0-5 antes de que
   se jugara nada, porque el camino Mis Retos→confirmar→Announce→Game acumula de forma
   natural más tiempo que el matchmaking normal (segundos). Corregido para usar
   `turn_started_at IS NOT NULL AND turn_started_at < now() - interval '5 minutes'`,
   igual que ya hacía correctamente `close_zombie_matches`. 4 partidos afectados el
   18 de junio contra test8 — decisión: no corregir retroactivamente.

3. **Return temprano en Result.jsx saltaba carga de opponent/updatedPlayer**: cuando el
   ganador de un partido no tenía ningún gol registrado en `plays` (caso de partido
   cerrado por inactividad sin jugadas reales), el código hacía `return` antes de llegar
   a `setOpponent(opp)` y `setUpdatedPlayer(updP)`, que estaban más abajo en el mismo
   `init()`. Como `Result.jsx` exige `match && opponent && player && updatedPlayer` para
   dejar de mostrar "Cargando...", esto dejaba la pantalla atascada para siempre.
   Corregido moviendo esas dos cargas ANTES del return temprano del camino
   `lastGoalIdx < 0`.

## 🟡 Pendiente — decisión sobre stock de prueba de test8

El stock de test8 quedó en valores no redondos tras las pruebas (10/10/10 iniciales,
modificado por las apuestas jugadas). Pendiente decidir si importa dejarlo así al ser
cuenta de prueba, o resetearlo a algo limpio.

## 🟢 Pendiente — tag de versión estable

Una vez cerrada del todo la funcionalidad Reto (incluyendo el punto rojo de arriba),
crear tag de versión estable sugerido `v2.3-stable`, siguiendo el mismo patrón usado
para v2.2-stable:
```bash
git tag v2.3-stable
git push origin v2.3-stable
```

---

# Arquitectura completa de la funcionalidad Reto (referencia)

## Resumen
Duelos 1v1 con apuesta de skills (Sniper/pro_shooter, Iron Fist/golden_glove,
Mano de Dios/hand_of_god). Puede lanzarse con o sin liga. El partido resultante es un
partido normal (cuenta para XP/stats/liga). Expira a las 24h sin respuesta. Tras aceptar,
ambos deben confirmar "Jugar" en una ventana de 30s para que se cree el partido; si falla
la ventana, no se cancela, solo se resetea y se puede reintentar indefinidamente hasta la
expiración de 24h.

## Tabla `duel_challenges`
Columnas: `id, challenger_id, opponent_id, league_id, status (pending/accepted/rejected/
expired/completed), wager (jsonb), final_wager (jsonb), match_id, created_at, expires_at,
ready_players (jsonb array), ready_started_at (timestamptz)`.

## Funciones SQL

**create_duel_challenge(challenger, opponent, league, wager)**: valida que ambos tengan
≥1 skill total y que cada item no exceda el mínimo entre ambos stocks. Solo lee
player_items, nunca escribe.

**respond_duel_challenge(challenge_id, player_id, accept, confirmed_wager)**: si rechaza
→ status rejected. Si acepta, revalida stock; si algún item ya no cabe, devuelve
needs_confirmation con max_wager sin aplicar nada. Ya NO crea el partido al aceptar
(rediseñado) — solo marca status accepted y fija final_wager.

**mark_duel_ready(challenge_id, player_id)**: gestiona el botón "Jugar". Si la ventana de
30s expiró (ready_started_at < now() - 30s), resetea ready_players/ready_started_at antes
de continuar, permitiendo reintento ilimitado. Añade al jugador a ready_players; con 2
listos, revalida stock una vez más y crea el partido (INSERT INTO matches con
status:'announcing'), guarda match_id en el reto. Con 1 listo, guarda ready_started_at y
devuelve waiting.

**get_duelable_players(exclude_id)**: jugadores con ≥1 skill total (HAVING SUM(stock)>=1),
con stock desglosado por tipo.

**get_my_duels(player_id)**: todos los retos (enviados y recibidos) con role calculado,
nombre del otro jugador, y ready_players. Tuvo que recrearse con DROP FUNCTION + CREATE
por cambio de tipo de retorno (Postgres no permite CREATE OR REPLACE en ese caso).

**Resolución de apuesta en finalize_match_stats**: tras el resto de la lógica existente,
busca duel_challenges con match_id=p_match_id AND status='accepted', usando
`IF FOUND THEN` (nunca `IF v_duel IS NOT NULL`). Transfiere final_wager del perdedor al
ganador vía INSERT...ON CONFLICT...stock+N (ganador) y UPDATE...stock=greatest(stock-N,0)
(perdedor), marca status completed.

## Backend

**api/notify-duel.js**: endpoint unificado con parámetro `event`
(challenge_received, challenge_accepted, challenge_rejected, player_ready), cada uno con
su título/cuerpo propio, todos apuntando a url: '/duels' (decisión confirmada: suficiente,
no hace falta resaltar el reto específico al abrir la notificación).

## Frontend

**src/screens/DuelCreate.jsx**: selección de rival (lista filtrable vía
get_duelable_players) y composición de apuesta con controles +/- limitados
dinámicamente a min(mi_stock, stock_rival) por tipo. Soporta rival preseleccionado vía
useLocation().state.preselectedOpponentId (usado desde el botón "Retar" en League.jsx).
Rutas: /duel/new y /duel/new/:leagueId.

**src/screens/Duels.jsx**: pantalla "Mis Retos" con tres secciones — RECIBIDOS (pendientes,
aceptar/rechazar con notificación al otro jugador), LISTOS PARA JUGAR (retos accepted, con
countdown visual de 30s vía tick cada segundo, botón "▶️ Jugar", mensajes contextuales de
"ya está listo"/"esperando", botón "▶️ Entrar al partido" si match_id ya existe en vez del
flujo de Jugar/Esperando), HISTORIAL (resto). Listener Realtime sobre duel_challenges
(sin filtro de fila) que navega a Announce si detecta UPDATE con match_id propio y
ready_players incluye al jugador. Modal de confirmación si respond_duel_challenge devuelve
needs_confirmation. Estado error con banner visible. NO navega automáticamente al cargar
aunque encuentre match_id ya existente (se quitó esa lógica a petición del usuario).
Cajas de reto con padding 1.25rem, duelWager destacado a la derecha en negrita, prefijo
"Apuesta: " antes del desglose de skills.

**Home.jsx**: "Mis Ligas" y "Mis Retos" apilados verticalmente (layout cardStack/
cardLeagueSmall) a la derecha del botón grande "Buscar Partido". Badge de pendientes en
Mis Retos cargado vía get_my_duels filtrando role==='received' && status==='pending'.

**League.jsx**: botón "⚔️ Retar" junto a cada miembro (excepto uno mismo) en la pestaña
"miembros", navega a /duel/new/:leagueId pasando state:{preselectedOpponentId,
preselectedOpponentName}.

## Bugs encontrados y corregidos durante esta fase (cronológico)

A. Tras aceptar, el segundo jugador en pulsar "Jugar" navegaba bien, pero el primero se
quedaba atascado en "Esperando..." indefinidamente. Fix inicial: chequeo en loadDuels que
navegaba si encontraba match_id ya existente — luego REVERTIDO a petición del usuario
porque causaba navegación automática indeseada cada vez que entraba a Mis Retos.
Sustituido por: (1) listener Realtime, (2) botón explícito "Entrar al partido".

B. FOUND vs IS NOT NULL en finalize_match_stats (ver arriba, sección ERRORES.md pendiente).

C. close_abandoned_matches usando started_at en vez de turn_started_at (ver arriba).

D. Result.jsx con return temprano que saltaba carga de opponent/updatedPlayer (ver arriba).

## Decisiones de diseño confirmadas con el usuario

- Reto puede lanzarse con o sin liga; cuenta para XP/stats/liga normal.
- Expira a las 24h sin respuesta.
- Límites de apuesta se recalculan al aceptar Y al confirmar Jugar (doble revalidación).
- Si el stock cambió entre aceptar y confirmar, se reduce la apuesta y se pide
  confirmación, no se cancela.
- Se puede retar a cualquiera con 1+ skill total, sin restricción de "conocidos".
- Mano de Dios SÍ se puede apostar (además de Sniper e Iron Fist).
- Ventana de 30s para confirmar Jugar tras aceptar; si falla, NO se cancela el reto,
  solo se resetea y se puede reintentar indefinidamente hasta las 24h de expiración.
- Al confirmar Jugar ambos, se crea el partido automáticamente y van a Announce.jsx
  (reutilizada, no pantalla nueva).
- Notificación al pulsar la notificación push lleva a /duels genérico (no resalta el
  reto específico) — confirmado como suficiente.
