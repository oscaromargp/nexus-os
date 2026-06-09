# n8n + Nexus OS — Roadmap por etapas

## 🎯 Arquitectura

```
Nexus OS ─┐
          ├─ webhook POST ─► n8n.zxyw.site ─► API externa
          │                  (workflow)        (WA, email, Drive, etc)
          │
          └─ guarda URL en localStorage por evento
```

Cada evento de Nexus (lead nuevo, inmueble captado, etc.) puede disparar
un workflow distinto en tu n8n. Configuras la URL en
**Configuración → 🔗 Conexiones → n8n Webhooks por evento**.

## 📦 Eventos que dispara Nexus

| Event ID | Cuándo se dispara | Payload |
|---|---|---|
| `lead_new` | Cliente llena form en propiedad.html | `{lead, property, snapshot}` |
| `property_created` | Captas un inmueble nuevo | `{property}` |
| `property_updated` | Editas inmueble | `{property, changes}` |
| `report_generated` | Reporte IA terminado | `{report_id, property}` |
| `backup_completed` | Backup a Drive terminó | `{folder, counts}` |
| `daily_summary` | Cron 8am cada día | `{stats_day}` |

Payload siempre tiene esta estructura base:
```json
{
  "event": "lead_new",
  "timestamp": "2026-01-15T22:30:00Z",
  "source": "nexus-os",
  "data": { ... }
}
```

---

## 🗺 Roadmap por etapas (simple → avanzado)

### **Etapa 1 — Notificación a Telegram (5 min)**
> El más fácil. Solo necesitas un bot de Telegram.

📄 **`etapa-1-telegram-lead.json`**

- **Disparador**: webhook `lead_new`
- **Acción**: enviar mensaje a tu Telegram

**Setup previo**:
1. Habla con [@BotFather](https://t.me/BotFather) en Telegram → `/newbot` → te da un TOKEN.
2. Habla con [@userinfobot](https://t.me/userinfobot) → te dice tu CHAT_ID.
3. Importa el JSON en n8n.
4. En el nodo Telegram, pega TOKEN + CHAT_ID.
5. Copia la URL del webhook → pégala en Nexus → Conexiones → `📩 Nuevo lead`.

**Test**: en Nexus, en Configuración → Conexiones → tap "Test" del evento.

---

### **Etapa 2 — Email con SMTP (5 min)**
> Para envío real de emails sin Gmail.

📄 **`etapa-2-email-smtp.json`**

- **Disparador**: webhook genérico `/api/email-via-n8n` (tu app ya lo llama)
- **Acción**: enviar email con SMTP (cualquier servidor)

**Setup previo**:
1. Conseguir credenciales SMTP. Opciones:
   - Tu hosting (HostGator suele dar SMTP gratis con tu dominio).
   - Brevo (300 emails/día gratis).
   - SendGrid (100/día gratis).
   - Resend (3000/mes gratis).
2. Importa el JSON, configura nodo SMTP con credenciales.
3. Copia URL webhook → pégala en Conexiones → "Email vía n8n".
4. Tap "✉ Test" desde Nexus.

---

### **Etapa 3 — WhatsApp Cloud API al recibir lead (15 min)**
> Mensaje automático al cliente cuando llena form.

📄 **`etapa-3-whatsapp-lead.json`**

- **Disparador**: webhook `lead_new`
- **Acción**: enviar WA al cliente + a ti

**Setup previo** (esto sí es trabajo):
1. Ve a https://developers.facebook.com → Crea cuenta de developer si no tienes.
2. **My Apps** → **Create App** → tipo "Business".
3. En el dashboard de la app → **Add Product** → **WhatsApp**.
4. Te dará gratis un **test phone number** + tu propio **phone_number_id**.
5. Genera un **Permanent Access Token**:
   - Business Settings → System Users → Create system user "n8n-bot".
   - Asigna asset: WhatsApp Business Account.
   - Generate New Token → permanent → marca `whatsapp_business_messaging`.
6. Anota:
   - `PHONE_NUMBER_ID`
   - `ACCESS_TOKEN`
7. Importa el JSON → configura ambos en el nodo HTTP Request.
8. Copia webhook URL → pega en Conexiones → `📩 Nuevo lead`.

**Plantilla de mensaje** (el JSON ya la incluye):
```
¡Hola {{nombre}}! 👋
Gracias por interesarte en {{titulo_inmueble}}.

📍 {{ubicacion}}
💰 {{precio}}

Te contactaré en breve para coordinar.
— Tu agente Nexus OS
```

---

### **Etapa 4 — Drip campaigns email (20 min)**
> Cadena automática a leads no contactados.

📄 **`etapa-4-drip-campaign.json`**

- **Disparador**: cron diario 9am
- **Acción**: query a Supabase REST API → leads con status=nuevo de hace 3/7/14 días → send email

**Setup previo**:
1. Necesitas SUPABASE_URL y SUPABASE_SERVICE_KEY (ya los tienes en Vercel).
2. Importa el JSON, configura credenciales Supabase + SMTP.
3. NO necesita webhook desde Nexus — corre solo.

**Plantillas por etapa**:
- Día 3 → "¿Sigues interesado? Te dejo este recordatorio…"
- Día 7 → "Te perdiste algunas propiedades nuevas que llegaron…"
- Día 14 → "¿Cuál fue tu impedimento? Quizá podemos ayudar."

---

### **Etapa 5 — Backup multi-destino (15 min)**
> Snapshot diario a Drive + Dropbox + S3 simultaneo.

📄 **`etapa-5-backup-multi.json`**

- **Disparador**: webhook `backup_completed` desde Nexus
- **Acción**: tomar el folder Drive + copiar a Dropbox + S3

**Setup previo**:
1. Credenciales Dropbox (gratis API key).
2. Credenciales AWS S3 (o Backblaze B2 que es 10x más barato).
3. Importa JSON, configura ambos.
4. Pega URL en Conexiones → `📦 Backup completado`.

---

## 🧠 Etapas avanzadas (siguiente fase)

| # | Workflow | Dificultad |
|---|---|---|
| 6 | OCR de INE/CURP del propietario | 🟡 medio |
| 7 | Auto-publicar a Inmuebles24 | 🔴 alto (depende API) |
| 8 | AI categoriza lead (caliente/tibio/frío) con Gemini | 🟡 medio |
| 9 | Generador de cartel inmobiliario con Bannerbear | 🟢 fácil |
| 10 | Sync calendar Google al agendar visita | 🟡 medio |

Cuando estés listo, pídelos y te genero los JSON.

---

## 🛠 Cómo importar un workflow en n8n

1. Abre **n8n.zxyw.site**.
2. Click **+ Add Workflow** (top right).
3. Click **menú ⋮** → **Import from File**.
4. Selecciona el `.json` de la etapa.
5. n8n carga el flow visual. **NO LO ACTIVES TODAVÍA**.
6. Click sobre cada nodo que tenga ⚠️ → configura credenciales.
7. Cuando todos los nodos estén verdes, **Save** y **Activate**.
8. Copia URL del nodo Webhook (icono 🔗) → pégala en Nexus.

---

## 🔍 Debug

- Cada workflow tiene **Executions** (panel izquierdo). Ve los logs cuando dispares.
- En Nexus, abre DevTools del navegador → Network → verifica que POST llegue con 200.
- Si el workflow falla, n8n te dice exactamente qué nodo y qué error.
