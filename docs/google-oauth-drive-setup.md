# Setup — Google OAuth + Drive Storage para Nexus OS

Esta guía tiene los pasos manuales que **tú** debes hacer en Google Cloud Console y Supabase Dashboard para que el flujo "Continuar con Google" + storage de fotos/docs en el Drive del agente funcione.

El código ya está implementado:
- Conector "Google Drive" en **Configuración → 🔗 Conexiones** dentro de `/app`.
- `src/drive-storage.js` (upload, folder ensure, delete, public link).
- `src/inmuebles.js` detecta `provider_token` y sube fotos a Drive si está disponible (fallback Supabase Storage si no).

> Nota: removimos el botón "Continuar con Google" del login para que la conexión
> sea **opcional y voluntaria** desde Configuración. El usuario entra normal con
> email/password y conecta Drive cuando lo necesite.

---

## 1. Google Cloud Console — crear OAuth Client ID

1. Entra a **https://console.cloud.google.com/**
2. Crea un proyecto nuevo (o usa el existente que diga `nexus-inmueble`).
3. Habilita el API:
   - Menú izq → **APIs y servicios** → **Biblioteca**
   - Busca **"Google Drive API"** → habilítalo.
4. Configura la pantalla de consentimiento OAuth:
   - **APIs y servicios** → **Pantalla de consentimiento OAuth**
   - Tipo: **Externo** (si tu cuenta no es Workspace) — selecciona "En producción" o "En testing"
   - Nombre de la app: `Nexus OS`
   - Email de soporte: tu email
   - Dominio autorizado: `nexus-os-chi.vercel.app` (y tu dominio custom si lo tienes)
   - Scopes a agregar (botón "Agregar o quitar permisos"):
     - `.../auth/userinfo.email`
     - `.../auth/userinfo.profile`
     - `.../auth/drive.file`  ← **clave** (permite a la app crear/editar SOLO los archivos que ella crea, no toca el resto de tu Drive)
   - Usuarios de prueba: agrega tu email mientras esté en testing.
5. Crea credenciales:
   - **APIs y servicios** → **Credenciales** → **+ CREAR CREDENCIALES** → **ID de cliente de OAuth**
   - Tipo: **Aplicación web**
   - Nombre: `Nexus OS Web`
   - URI de redirección autorizadas — agrega **ambos**:
     - `https://xhgssulypohbrbqbxdjc.supabase.co/auth/v1/callback`  ← Supabase
     - `http://localhost:5173/app.html`  ← desarrollo local (opcional)
   - Crea → te dará un **Client ID** (`xxx.apps.googleusercontent.com`) y un **Client Secret** (`GOCSPX-xxx`).
   - **Cópialos**, los vas a pegar en Supabase.

---

## 2. Supabase Dashboard — habilitar Google provider

1. Entra a **https://supabase.com/dashboard/project/xhgssulypohbrbqbxdjc/auth/providers**
2. Encuentra **Google** → toggle **Enabled**.
3. Pega:
   - **Client ID**: el `xxx.apps.googleusercontent.com` de arriba
   - **Client Secret**: el `GOCSPX-xxx`
4. En **"Authorized Client IDs"** (campo opcional): pega también el Client ID.
5. Habilita **"Skip nonce check"** si te marca error en login (en algunas versiones de Supabase JS hace falta).
6. **Save**.

---

## 3. Vercel — ya tienes los env vars necesarios

No hay env vars adicionales para Drive. El flujo funciona así:

```
Browser → "Continuar con Google" → Supabase /auth/v1/authorize → Google consent →
  Supabase callback → setea session.provider_token (token Google) → redirect a /app.html
```

A partir de ahí, cualquier llamada a Drive API usa ese `provider_token` desde la sesión activa.

---

## 4. Probar

1. En `/` (landing) → click **Continuar con Google** → autoriza con tu Gmail → te debe redirigir a `/app.html` logueado.
2. Entra a un inmueble → tab **Galería** → arrastra una foto.
3. Si todo va bien: la foto sube a **tu Drive personal**, en la carpeta `Nexus OS / Inmuebles / FOLIO_INTERNO / fotos / xxx.jpg`. Revisa tu Drive para confirmar.
4. Si no tienes token Google (entraste con email/password), cae el fallback a Supabase Storage automáticamente.

---

## 5. Consideraciones y troubleshooting

### El token Google expira
- Caduca cada ~1 hora. Supabase lo refresca automáticamente si `access_type=offline` (ya configurado).
- Si ves error "Token expirado", pídele al usuario cerrar sesión y entrar otra vez con Google.

### Permisos del scope `drive.file`
- Con `drive.file`, la app **solo ve y modifica los archivos que ELLA crea**. No accede al resto del Drive del usuario.
- Si el usuario borra Nexus OS de "Apps con acceso" en su cuenta Google, los archivos siguen ahí pero la app pierde acceso.

### Compartir fotos públicamente
- El módulo `uploadToDrive` por defecto pone permiso `reader anyone` (link público) para que el cliente pueda verlas en `propiedad.html` sin login.
- Si quieres privacidad total (solo el usuario logueado las ve), cambia `makePublic: false` en la llamada.

### Drive thumbnails vs URLs directas
- Los archivos imagen en Drive no son `<img src>` directos. Usamos `https://drive.google.com/thumbnail?id=ID&sz=w2000` que sirve la versión optimizada.
- Si una imagen no se ve, valida que el archivo esté en estado "público" (permission anyone reader).

### Migración de fotos viejas (opcional)
- Las fotos ya subidas a Supabase Storage siguen funcionando (URLs públicas).
- No hay migración automática. Si quieres mover todas a Drive en bloque, podemos armar un script aparte.

### CI workflow (`.github/workflows/ci.yml`)
- Requiere que tu PAT de GitHub tenga scope `workflow` para que yo pueda pushearlo.
- Mientras tanto, copia el archivo desde `/tmp/nexus-workflow/ci.yml` (lo dejé ahí en una ronda anterior) y súbelo manual desde la web de GitHub:
  - https://github.com/oscaromargp/nexus-os/new/master?filename=.github/workflows/ci.yml

---

## Estado actual

| Componente | Estado |
|---|---|
| Botón Google en login | ✅ implementado |
| `src/drive-storage.js` helpers | ✅ implementado |
| Photo upload usa Drive si hay token | ✅ implementado |
| Fallback Supabase Storage | ✅ implementado |
| Setup Google Cloud Console | ⏳ requiere tu acción manual (pasos 1-2) |
| Setup Supabase Auth provider | ⏳ requiere tu acción manual (paso 2) |
| Storage de documentos legales en Drive | Pendiente — siguiente iteración |
