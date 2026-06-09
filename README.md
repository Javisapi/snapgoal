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

## Versiones estables

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

