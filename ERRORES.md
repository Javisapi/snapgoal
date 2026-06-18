# Registro de errores — SnapGoal

## Error 1 — JSON.parse sobre columnas jsonb
**Fecha:** 2026-06-11
**Síntoma:** `"[object Object]" is not valid JSON` en consola del navegador
**Causa:** Las columnas `shootout_state` y `shootout_score` son de tipo `jsonb` en Supabase. Supabase las devuelve ya como objetos JavaScript. El código hacía `JSON.parse()` encima, lo que falla porque `JSON.parse` espera un string.
**Solución:** Crear helper `parseJ(val, fallback)` que detecta si el valor ya es objeto y lo devuelve directamente. Para escribir en columnas jsonb, pasar el objeto directamente (sin `JSON.stringify`).
**Regla:** Nunca usar `JSON.parse` ni `JSON.stringify` en columnas jsonb de Supabase. Pasar y recibir objetos directamente.

---

## Error 2 — `isMyTurn` declarado dos veces, segunda declaración sobreescribía la correcta
**Fecha:** 2026-06-11
**Síntoma:** El jugador B nunca podía tirar en la tanda de penalties aunque fuera su turno
**Causa:** Un replace añadió `const isMyTurn = match.current_turn === player.id` pero la línea antigua `const isMyTurn = isP1` seguía existiendo debajo, sobreescribiéndola
**Solución:** Eliminar la declaración duplicada con filtro por línea
**Regla:** Después de cada replace que añade o modifica una variable, verificar con `grep -n "nombre_variable"` que no hay declaraciones duplicadas

---

## Error 3 — Ternario corrupto dejado como código suelto
**Fecha:** 2026-06-11
**Síntoma:** Lógica incorrecta en el render, `myScored` tenía un ternario colgado debajo sin asignación
**Causa:** Un replace parcial eliminó la asignación pero dejó las líneas `? ... : ...` sueltas en el código
**Solución:** Eliminar las líneas sueltas con replace exacto
**Regla:** Después de cualquier replace en bloques multilínea, verificar el resultado con `sed -n` en el rango de líneas afectado

---

## Error 4 — `myTurnNow` usaba condiciones de estado en vez de `current_turn`
**Fecha:** 2026-06-11
**Síntoma:** El popup de elegir PAR/IMPAR no aparecía al jugador B cuando era su turno
**Causa:** `myTurnNow` tenía un ternario que evaluaba `state.a_scored === null` en lugar de simplemente comparar `updated.current_turn === playerRef.current?.id`
**Solución:** Simplificar a `const myTurnNow = updated.current_turn === playerRef.current?.id`
**Regla:** La lógica de turno siempre debe basarse en `current_turn` de la BD, nunca en inferencias del estado del partido

---

## Error 5 — Status del partido no se cambiaba a 'shootout' al iniciar la tanda
**Fecha:** 2026-06-11
**Síntoma:** El partido quedaba en `status: 'playing'` durante la tanda de penalties, dificultando debug y causando comportamientos inesperados
**Causa:** El update en `Game.jsx` que inicia el shootout no incluía `status: 'shootout'`
**Solución:** Añadir `status: 'shootout'` al update
**Regla:** Cada transición de estado del partido debe actualizar explícitamente el campo `status` en la BD

---

## Error 6 — Console.log con sintaxis rota dejado en producción
**Fecha:** 2026-06-11
**Síntoma:** Build fallido con `Expected , or ) but found :`
**Causa:** Un replace generó `console.log('SHOOTOUT STATE':, {...})` con dos puntos dentro del string del label, rompiendo la sintaxis JavaScript
**Solución:** Eliminar las líneas de debug con filtro por contenido
**Regla:** Antes de cada `git push`, eliminar todos los `console.log` de debug. Verificar con `grep -n "console.log" src/screens/NombrePantalla.jsx`

---

## Error 7 — `selectChoice` no actualizaba `matchRef` ni `match` state
**Fecha:** 2026-06-11
**Síntoma:** Después de que B elegía PAR/IMPAR, `canShoot` seguía siendo false porque `match.current_turn` no reflejaba el estado actualizado
**Causa:** `selectChoice` solo hacía `setShootoutState(newState)` pero no actualizaba `matchRef.current` ni el estado `match`, que es de donde se lee `current_turn` para calcular `isMyTurn`
**Solución:** Añadir `matchRef.current = { ...matchRef.current, shootout_state: newState }` y `setMatch(m => ({ ...m, shootout_state: newState }))` dentro de `selectChoice`
**Regla:** Cuando se actualiza un campo de `matches` en Supabase, actualizar también `matchRef.current` y el estado React local para que el render sea inmediato sin esperar el evento Realtime


## Error 8 — Replace con string multilínea falla en Python heredoc
**Fecha:** 2026-06-12
**Síntoma:** `SyntaxError: EOL while scanning string literal` al intentar usar `content.replace()` con strings que contienen saltos de línea literales
**Causa:** Python no permite saltos de línea dentro de strings entre comillas simples o dobles en heredoc de terminal
**Solución:** Usar `\n` escapado dentro del string, o usar sed para reemplazos que contengan saltos de línea, o reescribir el archivo completo cuando hay demasiados cambios acumulados
**Regla:** Cuando un archivo tiene demasiados patches acumulados y empieza a dar errores de estructura, reescribirlo entero es más seguro que seguir aplicando patches

## Error 9 — Bloque if no cerrado correctamente al insertar código en medio
**Fecha:** 2026-06-12
**Síntoma:** Build falla con `Unexpected token` en Skills.jsx por divs mal anidados
**Causa:** Al insertar la sección "¿Cómo conseguir más?" con replace, el div del styles.list no se cerró correctamente — quedó fuera del contenedor
**Solución:** Reescribir el archivo completo
**Regla:** Cuando se insertan bloques JSX con replace, verificar siempre la estructura de divs con `sed -n` en el rango afectado antes de compilar

## Error 10 — Canal Realtime de chat solo se abría en partidos de liga
**Fecha:** 2026-06-12
**Síntoma:** Chat no disponible en partidos generales
**Causa:** El canal `supabase.channel('chat-' + matchId)` estaba dentro de un `if (m.league_id)` — solo se suscribía si el partido tenía league_id
**Solución:** Mover la suscripción fuera del if, mantener el setLeagueId dentro
**Regla:** Revisar siempre las condiciones que envuelven suscripciones Realtime — es fácil que queden dentro de guards que no deberían aplicarse

## Error 11 — proShooterStock leído desde estado React en Realtime listener (valor stale)
**Fecha:** 2026-06-12
**Síntoma:** El popup del Sniper no aparecía aunque el jugador tuviera stock
**Causa:** El listener Realtime captura el valor de `proShooterStock` en el momento del closure — si los items no se habían cargado aún, el valor era 0
**Solución:** Usar `proShooterStockRef.current` (ref siempre actualizada) en el listener, y hacer query directa a player_items en el momento de mostrar el popup
**Regla:** En listeners Realtime, nunca leer estado React directamente — usar siempre refs sincronizadas o queries directas a Supabase


## Error 12 — Variable usada antes de su declaración (ReferenceError silencioso)
**Fecha:** 2026-06-17
**Síntoma:** La Mano de Dios dejaba el partido en estado inconsistente, sin mensaje de error claro para el usuario
**Causa:** En `activateHandOfGod`, el código usaba `last2orig` y `last2new` dentro del `UPDATE` de `matches` (para construir el mensaje) ANTES de que esas constantes estuvieran declaradas más abajo en la función — un error de scope/hoisting con `const` que lanza `ReferenceError` en tiempo de ejecución, interrumpiendo silenciosamente el resto de la función sin guardar el estado correctamente
**Solución:** Reordenar las declaraciones de `last2orig`/`last2new` al principio de la función, antes de cualquier uso
**Regla:** Al escribir funciones largas con múltiples pasos async, declarar TODAS las constantes derivadas al principio de la función, antes del primer `await`, para evitar errores de orden de declaración que con `const`/`let` no se detectan en tiempo de escritura sino de ejecución

## Error 13 — Guard de "ya procesado" a nivel de partido en vez de a nivel de jugador
**Fecha:** 2026-06-17
**Síntoma:** En partidas humano-vs-humano, solo el jugador que hacía la última jugada veía sus misiones diarias actualizadas; el rival que solo observaba el fin de partido nunca actualizaba las suyas
**Causa:** El guard anti-duplicado `missions_processed` (booleano único en `matches`) se diseñó pensando solo en el caso "humano vs bot" (mismo navegador, dos código-fuentes compitiendo por el mismo evento) — al aplicarlo también a partidas humano-vs-humano, bloqueaba al segundo jugador que intentara reclamar el procesamiento de SUS PROPIAS misiones, no solo evitaba duplicados del mismo jugador
**Solución:** Cambiar a `missions_processed_players` (jsonb array) + función SQL `claim_missions_processing(match_id, player_id)` que verifica/reclama por combinación partido+jugador, no solo por partido. Además, el listener de Realtime que detecta `status: 'finished'` para el jugador observador ahora también invoca `updateStats` antes de navegar, en vez de solo navegar
**Regla:** Cuando se diseña un guard anti-duplicado/anti-race-condition que debe aplicarse independientemente a "N actores" sobre el mismo recurso compartido (aquí: 2 jugadores sobre 1 partido), el guard debe llevar la identidad del actor en su clave, no ser un booleano único global al recurso

## Error 14 — Bug estructural: el bot nunca registra la resolución de eventos especiales como filas separadas
**Fecha:** 2026-06-17
**Síntoma:** Las Estadísticas PRO mostraban 0% de acierto en falta/penalty/corner para Cerverai, a pesar de que el bot sí mete goles de ese tipo en partidas reales
**Causa:** Cerverai (`useBotPlayer.js`) inserta solo UNA fila en `plays` por el evento que origina un pending (`FALTA`, `PENALTY`, `CORNER`), pero nunca inserta una segunda fila con el resultado de la resolución (`GOL_FALTA`/`FALTA_FALLO`, etc.) como sí hace el código para jugadores humanos en `Game.jsx`. El gol/fallo del bot solo se refleja en el cambio de `score_p1`/`score_p2`, no en `plays`
**Solución:** Decisión de producto: excluir a Cerverai de cálculos que dependan de esos sub-tipos de resultado en `plays`, en vez de parchear retroactivamente la inserción de filas históricas. Si se necesita en el futuro, habría que añadir el INSERT faltante en cada rama de resolución de `useBotPlayer.js` análogo al de `Game.jsx`
**Regla:** Cuando se implementa un "jugador IA" que debe parecerse a un jugador humano en cuanto a la estructura de datos que genera, verificar explícitamente que inserta exactamente las mismas filas/eventos en las mismas tablas que el código del jugador humano — no asumir paridad solo porque el resultado visual final (marcador) es correcto

## Error 15 — Cálculo de estadísticas agregadas con bucle N+1 desde el cliente
**Fecha:** 2026-06-17
**Síntoma:** La tabla de Estadísticas PRO daba resultados incorrectos (ceros falsos, conteos mal hechos) para algunos jugadores
**Causa:** La implementación inicial hacía un `for...of` sobre la lista de jugadores con una query separada a `plays` por cada uno (`N+1 queries`) y filtraba/contaba en JavaScript. Esto era ineficiente y, en este caso concreto, también incorrecto para casos límite
**Solución:** Reemplazado por una función SQL agregada `get_pro_stats()` usando `COUNT(*) FILTER(...)` en una sola query con JOIN — mucho más eficiente y correcto, verificado manualmente contra los datos reales de cada jugador antes de confiar en el resultado
**Regla:** Cualquier estadística agregada por jugador sobre una tabla grande (`plays`, `matches`) debe calcularse con una función SQL agregada en una sola pasada, nunca con un bucle de queries individuales desde el cliente — además de ser más rápido, evita errores sutiles de sincronización/timing entre llamadas

## Error 16 — viewport-fit=cover sin compensar con safe-area-inset rompe el layout en iOS
**Fecha:** 2026-06-18
**Síntoma:** Al añadir `viewport-fit=cover` al meta viewport (para extender el fondo decorativo detrás del notch/cámara del iPhone), todo el contenido de la Home quedó desplazado hacia arriba y apareció una franja negra brusca en la parte inferior de la pantalla
**Causa:** `viewport-fit=cover` le dice al navegador que use toda el área física de la pantalla, pero sin aplicar `padding: env(safe-area-inset-*)` correctamente calibrado en los elementos de contenido (no en el contenedor raíz completo), el layout se descalibra — los cambios adicionales para compensar esto (`100dvh`, cambiar `justifyContent` de `space-between` a `center`, degradados extendidos) introdujeron más problemas en cascada en vez de resolverlo
**Solución temporal:** Revertir `viewport-fit=cover` por completo, volviendo al meta viewport original sin esa propiedad. La extensión del fondo tras el notch queda como tarea pendiente para una sesión dedicada, implementando el padding de safe-area de forma más quirúrgica (solo en el contenido interactivo, nunca en el contenedor que define el `height`/`justifyContent` del layout general)
**Regla:** Cambios de viewport/safe-area en iOS deben probarse de forma aislada (un solo cambio por commit) y revertirse inmediatamente si rompen el layout general, en vez de seguir apilando fixes sobre un layout ya roto — apilar fixes sin revertir primero al estado bueno conocido hace mucho más difícil identificar la causa raíz real

## Error 17 — Editar un template de email en el dashboard de Supabase no siempre aplica el cambio con solo "guardar"
**Fecha:** 2026-06-18
**Síntoma:** Tras editar el HTML del template "Magic Link" en Supabase (Authentication → Email Templates) y pulsar guardar, el email real recibido seguía mostrando el contenido antiguo
**Causa:** No completamente clara, pero el dashboard de Supabase en este caso requirió **resetear el template y volver a cargarlo** (no solo editar el HTML existente y guardar) para que el cambio se propagara correctamente al envío real de emails
**Solución:** Resetear el template a su valor por defecto y volver a pegar el HTML deseado desde cero, en vez de editar incrementalmente el contenido existente
**Regla:** Si un cambio en un template de email de Supabase no se refleja tras guardar, probar resetear el template por completo antes de asumir que el problema está en SMTP, en el código del cliente, o en un caché de proveedor externo — verificar primero la causa más simple


## Error 18 — Race condition de escritura: el segundo actor en llamar a una función compartida sobreescribe el resultado del primero
**Fecha:** 2026-06-18
**Síntoma:** En partidos contra bot, el XP no se repartía aunque la función SQL `finalize_match_stats` calculaba el XP correctamente; por separado, en partidos humano-vs-humano, los banners de misión completada de un jugador desaparecían cuando ambos jugadores completaban una misión distinta en el mismo partido
**Causa:** Dos jugadores (o dos clientes) llaman a la misma función SQL para el mismo partido. La función tiene un guard "primero en llegar, único en ganar" (`stats_updated`) que calcula el resultado real solo la primera vez y devuelve un valor vacío/null las siguientes veces. El cliente, al recibir ese valor vacío, lo escribe igualmente sobre la columna compartida (`xp_result`, `missions_result`) sin comprobar si es un valor "real" o un "ya procesado, nada que hacer" — sobreescribiendo silenciosamente el resultado bueno que el primer llamante ya había guardado
**Solución:** (a) Cuando la función detecta que el recurso ya fue procesado, debe devolver el dato YA GUARDADO en BD, no un valor vacío — así cualquier llamante adicional recibe siempre el dato real, nunca un null que pueda pisar algo. (b) Para datos que deben acumularse de varios actores sobre la misma fila (como las misiones de dos jugadores distintos), la escritura final a la columna compartida debe hacerse dentro de la propia función SQL con `jsonb_set` sobre una clave por actor (`by_player[player_id]`), nunca con un `update(...)` directo desde el cliente que asigna el objeto completo
**Regla:** Cualquier función SQL compartida por dos actores sobre el mismo recurso, con guard de "solo una vez", debe: 1) devolver el resultado real ya almacenado en cualquier llamada posterior, nunca un valor vacío que un cliente pueda confundir con datos válidos; 2) si distintos actores pueden aportar datos propios al mismo recurso, hacer el merge atómicamente dentro de la función con una clave por actor, nunca permitir que el cliente sobreescriba la columna completa

## Error 19 — Fondo translúcido en un overlay de "información oculta" filtra esa información
**Fecha:** 2026-06-18
**Síntoma:** En el popup de Iron Fist (el defensor elige Portero PAR o IMPAR durante un penalty), el fondo era `rgba(0,0,0,0.93)` — un 7% de transparencia. Esto permitía que el contenido de la pantalla por debajo (incluyendo, en ciertas condiciones de contraste, la elección que ya había hecho el lanzador) se filtrara visualmente al defensor antes de decidir, rompiendo la mecánica de información oculta que da sentido al minijuego
**Causa:** El valor de opacidad se copió del patrón usado en otros popups informativos (Sniper, Mano de Dios) sin considerar que, a diferencia de esos casos, el Iron Fist depende estructuralmente de que el jugador que decide NO pueda ver ninguna pista del estado del rival
**Solución:** Cambiar el fondo a un color sólido `#000000` sin transparencia
**Regla:** Cualquier overlay/popup cuyo propósito sea ocultar información estratégica de un jugador frente al otro (decisiones simultáneas, elecciones secretas) debe usar un fondo 100% opaco sin excepción — la transparencia parcial es aceptable solo en popups puramente informativos donde no hay nada que ocultar

## Error 20 — FOUND vs IS NOT NULL en PL/pgSQL tras SELECT INTO
**Fecha:** 2026-06-18
**Síntoma:** Ninguna apuesta de duelo se resolvía nunca al terminar un partido; no había error visible
**Causa:** En `finalize_match_stats`, se declaró `v_duel record` y se comprobó `IF v_duel IS NOT NULL` tras un `SELECT INTO` — en Postgres esta condición es poco fiable y se evaluaba como falsa aunque la fila existiera
**Solución:** Usar `IF FOUND THEN` (variable especial que Postgres actualiza tras cualquier SELECT INTO)
**Regla:** En PL/pgSQL, nunca usar `IS NOT NULL` sobre una variable `record` para comprobar si un SELECT INTO encontró fila — usar siempre `IF FOUND`

---

## Error 21 — close_abandoned_matches usaba started_at en vez de turn_started_at
**Fecha:** 2026-06-18
**Síntoma:** Partidos de Reto se cerraban con marcador 0-5 antes de que se jugara ninguna tirada, porque el flujo Mis Retos→confirmar→Announce→Game acumula más tiempo del normal
**Causa:** La función usaba `started_at` (momento de creación del registro) para medir inactividad de 5 minutos, en vez de `turn_started_at` (momento real de última actividad)
**Solución:** Cambiar a `turn_started_at IS NOT NULL AND turn_started_at < now() - interval '5 minutes'`, igual que ya hacía `close_zombie_matches`
**Regla:** La inactividad siempre debe medirse desde la última actividad real del partido (`turn_started_at`), nunca desde su creación (`started_at`)

---

## Error 22 — Return temprano en Result.jsx saltaba carga de opponent y updatedPlayer
**Fecha:** 2026-06-18
**Síntoma:** Pantalla de resultado se quedaba en "Cargando..." infinito cuando el ganador no tenía ningún gol registrado en `plays` (partido cerrado por inactividad o abandono sin jugadas reales)
**Causa:** El código hacía `return` antes de llegar a `setOpponent(opp)` y `setUpdatedPlayer(updP)`. Result.jsx exige `match && opponent && player && updatedPlayer` para salir del estado "Cargando..."
**Solución:** Mover la carga de opponent y updatedPlayer ANTES del return temprano del camino `lastGoalIdx < 0`
**Regla:** Cualquier dato que sea condición necesaria para que un componente salga de su estado de carga debe cargarse antes de cualquier return temprano, independientemente del camino de ejecución

---

## Error 23 — Variable de estado usada en useEffect antes de ser declarada
**Fecha:** 2026-06-18
**Síntoma:** Pantalla de resultado completamente negra con `Uncaught ReferenceError: Cannot access 'A' before initialization`
**Causa:** Se añadió un `useEffect` que referenciaba `showReplay` y `showMissionBanner`, pero `showReplay` estaba declarada más abajo en el mismo componente — con `const`/`let` esto lanza ReferenceError en tiempo de ejecución, no en compilación
**Solución:** Mover la declaración de `showReplay` por encima del `useEffect` que la referencia
**Regla:** Al añadir un `useEffect` con dependencias, verificar que TODAS las variables del array de dependencias y del cuerpo estén declaradas antes del `useEffect` en el orden del archivo — React/Vite no siempre detecta esto en tiempo de build

---

## Error 24 — duel_challenges no tiene columna winner_id
**Fecha:** 2026-06-18
**Síntoma:** El banner de recompensa de reto nunca aparecía al ganador aunque el reto estuviera `completed`
**Causa:** El código accedía a `duelData.winner_id` pero la tabla `duel_challenges` no tiene esa columna — el valor era siempre `undefined`, por lo que la condición `duelData.winner_id === p.id` nunca se cumplía
**Solución:** Usar `m.winner_id` (del objeto `match` ya cargado desde la tabla `matches`) en vez de `duelData.winner_id`
**Regla:** Antes de acceder a una columna de una tabla, verificar que existe en el esquema real — no asumir que existe por analogía con otras tablas relacionadas

---

## Error 25 — Timer del rival sigue corriendo durante decisión de Mano de Dios
**Fecha:** 2026-06-18
**Síntoma:** Mientras el tirador decidía si usar la Mano de Dios (ventana de 5s), el cronómetro del rival seguía avanzando. Al confirmar la decisión, el cronómetro volvía al valor donde se paró
**Causa:** Cuando se activa el popup de Mano de Dios, el tirador para el timer localmente pero nunca actualiza `timer_running: false` en Supabase. El rival sigue recibiendo el estado `timer_running: true` vía Realtime y su cronómetro local sigue corriendo
**Solución:** Añadir un UPDATE a Supabase con `timer_running: false` y `elapsed_centesimas: total` antes de mostrar el popup, para que el rival reciba el estado correcto vía Realtime
**Regla:** Cualquier pausa o interrupción del cronómetro que ocurra en el cliente del tirador debe propagarse inmediatamente a Supabase para que el cliente del rival sincronice — nunca asumir que el estado local y el remoto están sincronizados sin un UPDATE explícito
