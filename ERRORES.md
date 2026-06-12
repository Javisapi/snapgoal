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

