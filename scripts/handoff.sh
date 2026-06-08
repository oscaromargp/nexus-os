#!/usr/bin/env bash
# Genera HANDOFF.md para cambio rápido entre Claude Code y opencode
# Uso: npm run handoff  (o ./scripts/handoff.sh)

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

HANDOFF_FILE="HANDOFF.md"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
LAST_COMMIT=$(git log --oneline -1 2>/dev/null || echo "no commits")

# Función para extraer la próxima tarea del NEXUS_PROJECT_LOG.md
get_next_task() {
  local log_file="NEXUS_PROJECT_LOG.md"
  if [[ -f "$log_file" ]]; then
    awk '/^### 🔄 Pendiente inmediato/,/^### /' "$log_file" | head -20 | tail -n +2 | head -10
  fi
}

# Función para obtener archivos modificados recientemente
get_recent_files() {
  git status --porcelain 2>/dev/null | head -20
  git diff --name-only HEAD~3..HEAD 2>/dev/null | sort -u | head -15
}

cat > "$HANDOFF_FILE" <<EOF
# Handoff — $TIMESTAMP

> Generado automáticamente para continuidad entre **Claude Code** ↔ **opencode**

---

## 📍 Estado actual
- **Rama**: \`$BRANCH\`
- **Último commit**: \`$LAST_COMMIT\`
- **Log principal**: \`NEXUS_PROJECT_LOG.md\` (fuente de verdad única)
- **Guía opencode**: \`AGENTS.md\`
- **Guía Claude**: \`CLAUDE.md\`

---

## 🔄 Próximas tareas (desde NEXUS_PROJECT_LOG.md)
$(get_next_task)

---

## 📝 Archivos modificados recientemente
\`\`\`
$(get_recent_files)
\`\`\`

---

## ✅ Checklist de verificación antes de continuar
- [ ] Leer \`NEXUS_PROJECT_LOG.md\` completo
- [ ] Verificar \`git log --oneline -5\`
- [ ] Verificar \`git tag -l "v*"\`
- [ ] Ejecutar \`npm run build\` (0 errores)
- [ ] Ejecutar \`npm test\` (22 tests passing)
- [ ] Deploy: \`vercel deploy --prod --yes\`

---

## 🛠️ Comandos útiles
\`\`\`bash
# Contexto opencode
npm run context:save    # Guardar snapshot manual
npm run context:load    # Cargar último snapshot

# Handoff
npm run handoff         # Regenerar este archivo

# Deploy completo
npm run build && npm test && vercel deploy --prod --yes

# Supabase migraciones
supabase db push        # Aplicar migraciones locales a remoto
\`\`\`

---

## 📋 Notas de la sesión anterior
*Consultar \`NEXUS_PROJECT_LOG.md\` para historia completa y decisiones técnicas.*

EOF

echo "✅ HANDOFF.md generado en $REPO_ROOT/$HANDOFF_FILE"