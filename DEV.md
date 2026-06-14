# SnapGoal — Developer Onboarding

## Descripción
SnapGoal es una web app de fútbol multijugador en tiempo real. Dos jugadores compiten parando un cronómetro compartido en centésimas de segundo. Incluye sistema de ligas privadas, ranking global, habilidades, entrenamiento y notificaciones push PWA.

**URL producción:** https://snapgoal.vercel.app  
**Repositorio:** https://github.com/Javisapi/snapgoal

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + Vite 8 |
| Routing | React Router v7 |
| Base de datos | Supabase (PostgreSQL + Realtime) |
| Auth | Supabase Auth anónima (sin email) |
| Despliegue | Vercel (auto-deploy en push a `main`) |
| Package manager | pnpm 9 (usar pnpm, no npm ni yarn) |
| Push notifications | web-push + VAPID |

---

## Setup local

### 1. Requisitos
- Node.js >= 20 (ver `.nvmrc`)
- pnpm 9: `npm install -g pnpm@9`

### 2. Clonar e instalar
```bash
git clone https://github.com/Javisapi/snapgoal.git
cd snapgoal
pnpm install
```

### 3. Variables de entorno
Crea un archivo `.env` en la raíz con:
VITE_SUPABASE_URL=https://xxxx.supabase.co

VITE_SUPABASE_ANON_KEY=eyJ...

VITE_VAPID_PUBLIC_KEY=...

Las encontrarás en:
- Supabase → Settings → API
- Vercel → tu proyecto → Settings → Environment Variables

### 4. Arrancar en local
```bash
pnpm dev
```

La app corre en `http://localhost:5173`

---

## Variables de entorno completas

### Frontend (prefijo VITE_ — expuestas al navegador)
| Variable | Dónde encontrarla |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public |
| `VITE_VAPID_PUBLIC_KEY` | Generada con `npx web-push generate-vapid-keys` |

### Backend (solo Vercel Serverless Functions)
| Variable | Dónde encontrarla |
|---|---|
| `SUPABASE_URL` | Igual que `VITE_SUPABASE_URL` (sin `/rest/v1`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role |
| `VAPID_PRIVATE_KEY` | Generada con `npx web-push generate-vapid-keys` |
| `VAPID_MAILTO` | `mailto:tu@email.com` |

> ⚠️ Nunca exponer `SUPABASE_SERVICE_ROLE_KEY` ni `VAPID_PRIVATE_KEY` en el frontend.

---

## Estructura del proyecto
snapgoal/

├── api/                        # Vercel Serverless Functions

│   └── notify-league.js        # Envía push notifications a miembros de una liga

├── public/

│   ├── sw.js                   # Service worker (caché PWA)

│   ├── sw-push.js              # Service worker (push notifications)

│   ├── manifest.json           # PWA manifest

│   └── icon-192.png / 512.png  # Iconos PWA

├── src/

│   ├── lib/

│   │   ├── supabase.js         # Cliente Supabase

│   │   └── pushNotifications.js # Lógica de suscripción push

│   ├── hooks/

│   │   ├── useAuth.js          # Hook de autenticación anónima

│   │   └── useLatency.js       # Hook de latencia Supabase

│   ├── components/

│   │   └── LatencyIndicator.jsx

│   └── screens/

│       ├── Home.jsx            # Registro / bienvenida

│       ├── Queue.jsx           # Matchmaking

│       ├── Announce.jsx        # Confirmación pre-partido

│       ├── Game.jsx            # Partido en curso

│       ├── Result.jsx          # Resultado final

│       ├── Ranking.jsx         # Clasificación global

│       ├── Rules.jsx           # Reglas del juego

│       ├── Leagues.jsx         # Lista de ligas del jugador

│       ├── League.jsx          # Detalle de una liga

│       ├── Skills.jsx          # Habilidades (Iron Fist, Sniper)

│       ├── Academy.jsx         # Centro de entrenamiento

│       ├── Shootout.jsx        # Penaltis de desempate

│       └── TrainingGame.jsx    # Partida de entrenamiento

├── index.html

├── vite.config.js

├── vercel.json                 # Rewrites para SPA

└── package.json

---

## Base de datos (Supabase)

### Tablas principales
| Tabla | Descripción |
|---|---|
| `players` | Perfiles: username, stats, XP, auth_id |
| `matches` | Partidos: estado, cronómetro, scores, league_id |
| `plays` | Registro de cada tirada |
| `matchmaking_queue` | Cola de emparejamiento con expiración |
| `leagues` | Ligas privadas: nombre, código, expiración |
| `league_members` | Miembros con stats internas de liga |
| `league_messages` | Chat en partidos de liga |
| `player_items` | Habilidades (Iron Fist, Sniper) |
| `training_sessions` | Historial de entrenamientos |
| `push_subscriptions` | Suscripciones push PWA por jugador |

### Tabla push_subscriptions
```sql
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);
```

### Funciones SQL clave
| Función | Descripción |
|---|---|
| `do_matchmaking(player_id)` | Emparejamiento atómico global |
| `do_league_matchmaking(player_id, league_id)` | Emparejamiento dentro de una liga |
| `finalize_match_stats(...)` | Actualiza stats globales y de liga (con lock) |
| `close_abandoned_matches(player_id)` | Limpia partidos zombie |
| `generate_league_code()` | Genera código único de 6 caracteres |
| `calculate_glicko(...)` | Cálculo de XP con sistema Glicko-1 |
| `update_player_goals_cards(...)` | Actualiza goles y tarjetas |

---

## Serverless Functions (Vercel)

### `api/notify-league.js`
Envía notificaciones push a todos los miembros de una liga excepto al remitente.

**Endpoint:** `POST /api/notify-league`

**Body:**
```json
{
  "league_id": "uuid",
  "sender_name": "username",
  "sender_id": "uuid"
}
```

**Respuesta:**
```json
{ "sent": 3 }
```

---

## PWA Push Notifications

### Flujo completo
1. `main.jsx` llama a `registerPushSW()` al arrancar — registra `sw-push.js`
2. `Home.jsx` llama a `requestPermissionAndSubscribe(supabase, player.id)` cuando el player está cargado
3. El navegador pide permiso al usuario
4. Si acepta, la suscripción se guarda en `push_subscriptions`
5. Desde `League.jsx`, el botón "Notificación: Convoca a tus rivales" llama a `/api/notify-league`
6. La función obtiene las suscripciones de los miembros y manda la push via VAPID
7. `sw-push.js` recibe el evento `push` y muestra la notificación

### Generar nuevas VAPID keys (solo si es necesario)
```bash
npx web-push generate-vapid-keys
```
Actualizar `VITE_VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` en Vercel y hacer Redeploy.

---

## Despliegue

El despliegue es automático: cualquier push a `main` desencadena un build en Vercel.

```bash
git add -A && git commit -m "descripción" && git push
```

Si se añaden nuevas variables de entorno en Vercel, hay que hacer **Redeploy manual**:  
Vercel → Deployments → último deploy → `...` → Redeploy

### Build local (verificar antes de push)
```bash
pnpm build
```

---

## Autenticación

SnapGoal usa **sesiones anónimas de Supabase** — sin email ni contraseña.

1. El jugador elige un username único
2. Se crea una sesión anónima con `supabase.auth.signInAnonymously()`
3. Se crea un registro en `players` con `auth_id = session.user.id`
4. La sesión persiste en el dispositivo indefinidamente via localStorage de Supabase

El player se cachea en `sessionStorage` con clave `player_[auth_id]` para evitar queries repetidas.

---

## Realtime

Los partidos usan **Supabase Realtime** para sincronizar el estado entre jugadores:
- El tirador usa `performance.now()` localmente para máxima precisión
- El observador recibe actualizaciones via Realtime con compensación de latencia
- El matchmaking usa polling cada 2 segundos como respaldo al Realtime

---

## Versiones estables

```bash
git checkout v1.7-stable   # última versión estable
git checkout main          # versión más reciente
```

Ver historial completo en README.md.

---

## Decisiones técnicas importantes

- **pnpm obligatorio** — Vercel está configurado para pnpm. Usar npm genera `package-lock.json` que puede causar conflictos.
- **`SUPABASE_URL` sin `/rest/v1`** — la Serverless Function necesita solo la URL base (`https://xxxx.supabase.co`), no la URL completa de la API REST.
- **`vercel.json` con rewrite `/*` → `/`** — necesario para que React Router funcione en producción.
- **Service workers separados** — `sw.js` gestiona caché PWA y `sw-push.js` gestiona push. Están separados para evitar conflictos.
- **Sesiones anónimas** — no hay sistema de recuperación de cuenta. Si el usuario borra los datos del navegador, pierde su cuenta. Es una decisión de diseño deliberada para simplicidad.

---

## Roadmap de producto

### App Stores
- **Google Play Store** — publicar como PWA via PWABuilder (pwabulder.com). Coste: 25$ único. Proceso: generar APK/AAB desde PWABuilder + cuenta Google Play Developer.
- **Apple App Store** — publicar como PWA wrapper via PWABuilder. Coste: 99€/año (cuenta Apple Developer obligatoria). Riesgo: Apple puede rechazar apps que sean "solo una web". Recomendado hacerlo después de Google Play.

**Orden sugerido:** Google Play primero (más barato, más sencillo, Android es la plataforma natural para PWAs), Apple después cuando el juego tenga más tracción.

---

## Sistema de presencia en tiempo real

### Canal único
Todos los componentes usan el canal `snapgoal-presence`. No crear canales adicionales de presencia.

### Hooks
- `useTrackPresence(playerId, status)` — trackea al jugador. Llamar en Home (idle) y Game (playing)
- `usePresenceMap(onChange)` — suscribe a cambios del mapa `{ player_id: status }`

### Estados
- `idle` → dot verde → jugador en la app pero sin partido
- `playing` → dot ámbar → jugador en partida activa
- `offline` → dot rojo → jugador no detectado en el canal

### Componente
`src/components/StatusDot.jsx` — acepta `status` y `size` props.

---

## Dashboard de administración

### Acceso
`https://snapgoal.vercel.app/admin/login`
Emails autorizados: `snapgoal00@gmail.com`, `javi.fernandez.castanon@gmail.com`

### Rutas
| Ruta | Descripción |
|---|---|
| `/admin/login` | Login con magic link |
| `/verify-admin` | Procesa el token del magic link |
| `/admin` | Dashboard principal (protegido por AdminGuard) |

### Vistas SQL en Supabase
| Vista | Descripción |
|---|---|
| `admin_player_stats` | Nuevos jugadores y acumulado por día |
| `admin_match_stats` | Partidos, goles y abandonados por día |
| `admin_active_players` | Jugadores activos en los últimos 7 días |
| `admin_top_players` | Top 10 jugadores por partidos jugados |
| `admin_totals` | Totales históricos de todas las métricas |

### Archivos
- `src/screens/Admin.jsx` — dashboard principal
- `src/screens/AdminLogin.jsx` — pantalla de login
- `src/screens/VerifyAdmin.jsx` — procesador del magic link
- `src/components/AdminGuard.jsx` — protección de ruta + lista de emails autorizados
