# Nexus OS — Guía de Integración n8n

Automatiza Nexus OS con n8n: crea nodos desde Telegram, recibe resúmenes diarios, exporta a Google Sheets y más.

---

## Arquitectura

```
Telegram / WhatsApp / Cron
         ↓
       [n8n]
         ↓
  /api/n8n (Vercel)      ← endpoint webhook
         ↓
     [Supabase]
         ↓
   Nexus OS (app)        ← aparece en tiempo real
```

---

## 1. Configurar el webhook en Vercel

### Variables de entorno requeridas

Agrega estas en **Vercel → Settings → Environment Variables**:

| Variable | Descripción | Ejemplo |
|---|---|---|
| `NEXUS_WEBHOOK_SECRET` | Token secreto para autenticar n8n | `una-clave-segura-123` |
| `NEXUS_SUPABASE_SERVICE_KEY` | Service Role Key de Supabase (no la anon key) | `eyJhbGci...` |
| `VITE_SUPABASE_URL` | Ya debes tenerla | `https://xxx.supabase.co` |

### Dónde obtener cada valor

1. **`NEXUS_WEBHOOK_SECRET`**: Genera uno aleatorio, por ejemplo con `openssl rand -hex 32`
2. **`NEXUS_SUPABASE_SERVICE_KEY`**: Supabase Dashboard → Settings → API → **service_role key** (NO la anon key)
3. **`VITE_SUPABASE_URL`**: Supabase Dashboard → Settings → API → Project URL

### Probar el endpoint

```bash
curl -X POST https://nexus-os-chi.vercel.app/api/n8n \
  -H "Authorization: Bearer tu-secreto" \
  -H "Content-Type: application/json" \
  -d '{ "text": "#tarea llamar al cliente mañana p1", "user_id": "tu-uuid-de-supabase" }'
```

Respuesta esperada:
```json
{ "ok": true, "node": { "id": "...", "type": "kanban", "content": "llamar al cliente" } }
```

---

## 2. Configurar n8n

### Credenciales que necesitas crear en n8n

#### A. HTTP Bearer Auth (para el webhook de Nexus)
- **Name**: `Nexus Webhook Token`
- **Token**: el mismo valor de `NEXUS_WEBHOOK_SECRET`

#### B. Supabase
- **Name**: `Nexus Supabase`
- **Host**: tu URL de Supabase (sin `/rest/v1`)
- **Service Role Secret**: la Service Role Key

#### C. Telegram Bot
- Habla con **@BotFather** en Telegram → `/newbot`
- Copia el token → crea la credencial en n8n

### Variables de entorno en n8n

En n8n → Settings → Variables, agrega:

| Variable | Valor |
|---|---|
| `NEXUS_WEBHOOK_URL` | `https://nexus-os-chi.vercel.app` |
| `NEXUS_USER_ID` | Tu UUID de usuario en Supabase |
| `NEXUS_TELEGRAM_CHAT_ID` | Tu chat ID personal (obtenlo con @userinfobot) |
| `NEXUS_SHEETS_DOC_ID` | ID de tu Google Sheet (para el workflow de export) |

---

## 3. Importar los workflows

1. En n8n → **+ New Workflow** → menú ⋯ → **Import from file**
2. Selecciona el `.json` del directorio `docs/n8n-workflows/`
3. Actualiza los IDs de las credenciales en cada nodo
4. Activa el workflow con el toggle **Active**

### Workflows disponibles

| Archivo | Descripción |
|---|---|
| `01-telegram-nexus-node.json` | Envía mensajes al bot → crea nodos en Nexus |
| `02-daily-finance-summary.json` | Resumen financiero diario por Telegram a las 8am |
| `03-payment-reminders.json` | Recordatorios de pagos de Agenda Financiera |
| `04-finance-export-sheets.json` | Export semanal de transacciones a Google Sheets |

---

## 4. Sintaxis compatible en Telegram

Una vez configurado el workflow `01`, puedes enviar al bot:

```
#tarea llamar al cliente mañana p1
#tarea comprar materiales 2026-06-15 #construccion

+$5000 pago proyecto @nómina
-$350 gasolina @bbva #auto
+$1200 freelance julio @spei

Nota libre → se guarda como nota en la Bóveda Neural

#proyecto Renovación Baños
#persona Carlos Méndez — Constructor
```

El bot responde confirmando el tipo de nodo creado y el nodo aparece en Nexus OS en tiempo real.

---

## 5. Obtener tu User ID de Supabase

1. Abre Nexus OS → Configuración (engrane ⚙️)
2. En la consola del navegador: `window.__NEXUS_USER?.id`
3. O en Supabase → Authentication → Users → copia el UUID de tu cuenta

---

## 6. Ideas de automatizaciones adicionales

| Idea | Patrón n8n |
|---|---|
| 📱 WhatsApp → Nexus | Twilio Trigger → HTTP Request → /api/n8n |
| 📧 Email → Nota | Gmail Trigger → Extract → /api/n8n |
| 📊 OTC dispersión → WhatsApp masivo | Supabase Trigger → Loop → Twilio Send |
| 🤖 AI categorizador de notas | Supabase Trigger → OpenAI → Supabase Update |
| ☁️ Backup diario → Drive | Supabase Query → Google Drive Upload |
| 📈 Alerta precio BTC | HTTP Request Bitso → IF → Telegram |
| 🔄 Sync Google Calendar | Supabase Query → Google Calendar Create |

---

## 7. Seguridad

- **Nunca** compartas el `NEXUS_WEBHOOK_SECRET` ni el `service_role key`
- El endpoint `/api/n8n` solo acepta peticiones con el token correcto
- El `service_role key` bypasa RLS: úsalo solo desde n8n, nunca en el frontend
- Para producción, considera agregar validación de `user_id` con una whitelist

---

*Nexus OS + n8n = automatización total de tu vida digital personal.*
