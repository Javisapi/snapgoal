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
| `matchmaking_queue` | Cola de emparejamiento con expiración |
| `matches` | Partidos con estado, cronómetro y scores |
| `plays` | Registro de cada tirada |

### Funciones SQL clave
- `do_matchmaking(player_id)` — Emparejamiento atómico sin race conditions
- `finalize_match_stats(...)` — Actualización atómica de estadísticas con lock
- `close_abandoned_matches(player_id)` — Limpieza de partidos zombie
- `update_player_goals_cards(...)` — Actualización de goles y tarjetas

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
El rival elige la barrera (20-30, 30-40, 40-50) → el tirador debe parar dentro del rango = GOL

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
- **Empate** → penaltis a muerte súbita (máx. 3 tandas)

### Puntos
- Victoria: **3 pts** · Empate: **1 pt** · Derrota: **0 pts**

---

## Sistema de Ligas privadas

### Concepto
Un jugador crea una liga privada con nombre y duración. Se genera un código de 6 caracteres que comparte con sus amigos. Dentro de la liga los jugadores solo se emparejan entre ellos y tienen su propio ranking.

### Flujo
1. **Crear liga** — nombre + duración predefinida → código generado automáticamente
2. **Invitar** — compartir código por WhatsApp (link directo) o manualmente
3. **Unirse** — introducir el código de 6 caracteres
4. **Jugar** — "Buscar rival en la liga" empareja solo con miembros de esa liga
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
Durante un partido de liga aparece un botón 💬 en la barra inferior. Los jugadores pueden enviar mensajes preconfigurados que aparecen 3 segundos y desaparecen:
- ⚽ ¡Vaya golazo!
- 💥 BOOOM
- 😂 ahahahahah
- 🚩 ¡Exijo VAR!
- 🤨 El árbitro está comprado
- 🤝 Buen partido

### Tablas de base de datos
- `leagues` — ligas con código, fecha de expiración y creador
- `league_members` — miembros con estadísticas internas de liga
- `league_messages` — mensajes de chat por partido

### Funciones SQL
- `generate_league_code()` — genera código único de 6 caracteres
- `do_league_matchmaking(player_id, league_id)` — emparejamiento atómico dentro de una liga
- `finalize_match_stats(...)` — actualiza stats globales Y de liga si el partido tiene `league_id`

---

## Versiones estables

### v1.5-stable
- **Iron Fist** (ex guante de oro): habilidad defensiva en penalties — elige derecha/izquierda para bloquear mitad del cronómetro
- **Sniper** (ex lanzador pro): habilidad ofensiva en faltas — amplía ventana de 5 a 10 centésimas
- Sistema genérico de items en tabla `player_items` (preparado para futuras habilidades)
- Iconos SVG en partido: guante dorado y diana para mostrar stock de cada jugador
- Hitos de XP: cada 100 XP por encima de 1500 otorgan +3 Iron Fists y +3 Snipers automáticamente (trigger SQL)
- Pantalla **Skills** accesible desde Home con descripción detallada de cada habilidad
- Chat disponible en todos los partidos (no solo ligas) con emojis + texto corto en grid 3x2
- Flash de gol con guard para no repetirse por Realtime
- Pantalla Announce: XP vs pts de liga según contexto, historial de enfrentamientos directos (h2h)
- Ranking general ordenado por XP, muestra pts de victorias como secundario


### v1.4-stable
- Sistema XP Glicko-1: rating inicial 1500, RD inicial 350, mínimo 50
- XP visible en Home, Ranking, Announce y Result (con delta +/-)
- Ranking general ordenado por XP, con puntos de victorias visibles
- Partidos de liga no afectan al XP — solo puntos simples +3/0
- Reglas actualizadas: explicación XP con ejemplo real (A:1500 vs B:1800 → +270/-85)
- Reglas de desempate en ligas documentadas
- `finalize_match_stats` devuelve jsonb con deltas XP
- `calculate_glicko` función SQL independiente y reutilizable


### v1.3-stable
- Penaltis de desempate funcionando: turnos basados en `current_turn`, jsonb sin stringify, muerte súbita infinita
- Eliminados los empates del juego — siempre hay un ganador
- Función SQL `finalize_match_stats` actualizada sin empates
- Ventana de falta reducida a 5 centésimas (20-25, 30-35, 40-45) inclusive en ambos extremos
- Flash de gol en todos los partidos, duración 0.5s, sin repetición por Realtime
- Home redesign: cards con iconos SVG, copa del mundial en Mis Ligas
- Confirmación de borrado de cuenta por nombre de usuario

## Versiones estables

### v1.5-stable
- **Iron Fist** (ex guante de oro): habilidad defensiva en penalties — elige derecha/izquierda para bloquear mitad del cronómetro
- **Sniper** (ex lanzador pro): habilidad ofensiva en faltas — amplía ventana de 5 a 10 centésimas
- Sistema genérico de items en tabla `player_items` (preparado para futuras habilidades)
- Iconos SVG en partido: guante dorado y diana para mostrar stock de cada jugador
- Hitos de XP: cada 100 XP por encima de 1500 otorgan +3 Iron Fists y +3 Snipers automáticamente (trigger SQL)
- Pantalla **Skills** accesible desde Home con descripción detallada de cada habilidad
- Chat disponible en todos los partidos (no solo ligas) con emojis + texto corto en grid 3x2
- Flash de gol con guard para no repetirse por Realtime
- Pantalla Announce: XP vs pts de liga según contexto, historial de enfrentamientos directos (h2h)
- Ranking general ordenado por XP, muestra pts de victorias como secundario


### v1.4-stable
- Sistema XP Glicko-1: rating inicial 1500, RD inicial 350, mínimo 50
- XP visible en Home, Ranking, Announce y Result (con delta +/-)
- Ranking general ordenado por XP, con puntos de victorias visibles
- Partidos de liga no afectan al XP — solo puntos simples +3/0
- Reglas actualizadas: explicación XP con ejemplo real (A:1500 vs B:1800 → +270/-85)
- Reglas de desempate en ligas documentadas
- `finalize_match_stats` devuelve jsonb con deltas XP
- `calculate_glicko` función SQL independiente y reutilizable


| Tag | Descripción |
|---|---|
| `v1.0-stable` | Primera versión estable — estadísticas correctas, matchmaking robusto, timer mejorado |

### Recuperar una versión estable
```bash
git checkout v1.0-stable
```

### Volver a la versión más reciente
```bash
git checkout main
```

---

## Variables de entorno
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

---

## Desarrollo local

```bash
npm install
npm run dev
```

---

## Despliegue

El despliegue es automático via Vercel al hacer push a `main`.

Vercel usa `pnpm` — configurado en `package.json` con `"packageManager": "pnpm@9.0.0"`.

---

## Escalabilidad

### Situación actual (Opción B — hasta ~100 jugadores simultáneos)
- Cada cliente hace polling con **jitter aleatorio de 1-4 segundos** para distribuir la carga
- La función SQL `do_matchmaking` usa `FOR UPDATE SKIP LOCKED` para emparejamiento atómico sin duplicados
- Supabase free tier soporta 60 conexiones simultáneas — suficiente para decenas de jugadores

### Para escalar a cientos de jugadores (Opción A — pendiente de implementar)
Implementar un **matchmaker centralizado** via **Supabase Edge Function**:
- Una función serverless que corre cada 2 segundos
- Empareja a TODOS los jugadores en cola de una vez en un solo proceso
- Los clientes solo escuchan via Realtime — sin polling
- 0 contención de locks
- Escala a cientos de jugadores simultáneos sin cambios en el cliente

---

## Decisiones técnicas importantes

### Cronómetro
- El **tirador** usa `performance.now()` localmente — máxima precisión
- El **observador** sincroniza via Realtime con compensación de latencia
- `iAmTheShooterRef` separa completamente la lógica de tirador y observador
- `timerVersionRef` previene ticks fantasma de intervals anteriores

### Matchmaking
- Función SQL atómica `do_matchmaking` con `FOR UPDATE SKIP LOCKED`
- Cola con expiración de 10 segundos (`expires_at`)
- Polling cada 2 segundos como respaldo al Realtime

### Estadísticas
- `finalize_match_stats` con lock atómico (`stats_updated`) previene doble contabilización
- Solo se ejecuta una vez por partido aunque ambos jugadores la llamen simultáneamente

### Autenticación
- Sesión anónima de Supabase — sin email ni contraseña
- El jugador elige su nombre de usuario único
- La sesión persiste en el dispositivo indefinidamente

