# Recordatorio de Medicamentos por Telegram (Salud · Fase B)

El backend ya está listo y desplegado. Para activar el lazo **recordatorio → respuesta**, faltan estos pasos en tu n8n (10 min). Es un solo evento por toma: llega el aviso, pulsas ✅/❌ y el sistema actualiza el estado.

## Cómo funciona

```
Cron n8n (cada 30 min)
   └─ POST /api/health { action: 'med_due' }      ← devuelve dosis vencidas sin registrar
        └─ Telegram: "💊 Hora de tu Vitamina D"  [✅ Lo tomé] [❌ No lo tomé]
             └─ pulsas un botón (callback_query)
                  └─ POST /api/health { action: 'med_log_telegram' }  ← actualiza estado
                       └─ el historial en Nexus queda con source = 'telegram'
```

## 1. Variables de entorno en n8n

| Variable | Valor |
|---|---|
| `NEXUS_API_BASE` | `https://nexus-os-chi.vercel.app` |
| `NEXUS_WEBHOOK_SECRET` | el mismo que ya usas (debe coincidir con Vercel) |
| `NEXUS_USER_ID` | tu UID de Supabase → Authentication → Users → copia el `UID` |
| `NEXUS_TELEGRAM_CHAT_ID` | tu chat de Telegram (el que ya usas) |
| `TELEGRAM_BOT_TOKEN` | el token de tu bot (el que ya usas) |

## 2. Importar el workflow de envío

n8n → **Import from File** → `docs/n8n-workflows/05-meds-reminders.json` → **Activar**.

Esto manda los recordatorios. Ajusta el horario del cron si quieres (por defecto cada 30 min, de 7am a 10pm).

## 3. Manejar la respuesta (botones) en el bot existente

En tu workflow del bot (`01-telegram-nexus-node.json`), antes de procesar mensajes normales, agrega una rama para `callback_query`:

```js
// Si el callback empieza con "med:" → es una respuesta de medicamento
const cb = $json.callback_query;
if (cb && typeof cb.data === 'string' && cb.data.startsWith('med:')) {
  // formato: med:<medication_id>:<HH:mm>:<t|n>
  const [, medId, time, flag] = cb.data.split(':');
  const status = flag === 't' ? 'tomado' : 'no_tomado';

  // 1) Actualiza el estado en Nexus
  await fetch(`${$env.NEXUS_API_BASE}/api/health`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-nexus-service-secret': $env.NEXUS_WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      action: 'med_log_telegram',
      user_id: $env.NEXUS_USER_ID,
      medication_id: medId,
      scheduled_time: time,
      status,
    }),
  });

  // 2) Confirma en Telegram (answerCallbackQuery + edita el mensaje)
  const token = $env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: cb.id, text: status === 'tomado' ? '✅ Registrado' : '❌ Registrado' }),
  });
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      text: (cb.message.text || '') + `\n\n${status === 'tomado' ? '✅ Marcado como TOMADO' : '❌ Marcado como NO tomado'}`,
    }),
  });
  return; // no seguir al parser normal
}
```

> Si tu bot usa el nodo Telegram Trigger, asegúrate de que esté escuchando también `callback_query` (en "Updates" marca `callback_query`, no sólo `message`).

## Acciones de servicio (referencia)

Ambas requieren el header `x-nexus-service-secret: <NEXUS_WEBHOOK_SECRET>` y `user_id` en el body.

- `med_due` → `{ due: [{ medication_id, name, kind, dose, purpose, time, scheduled_for }], count }`
  Devuelve sólo dosis de hoy cuya hora ya pasó y que aún no tienen registro (tomado/no_tomado).
- `med_log_telegram` → `{ medication_id, scheduled_time, status: 'tomado'|'no_tomado', scheduled_for? }`
  Marca la toma con `source = 'telegram'`.

## Probar sin esperar al cron

Desde una terminal (sustituye el secret y tu UID):

```bash
curl -s -X POST https://nexus-os-chi.vercel.app/api/health \
  -H "Content-Type: application/json" \
  -H "x-nexus-service-secret: TU_NEXUS_WEBHOOK_SECRET" \
  -d '{"action":"med_due","user_id":"TU_UID","now":"23:59"}'
```

Si devuelve `due: [...]`, el backend está respondiendo. (`now:"23:59"` fuerza que cuente todas las dosis del día.)
