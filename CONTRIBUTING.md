# Guía de Contribución

¡Gracias por tu interés en contribuir a Finanzas Argentina! Este documento contiene las guías y mejores prácticas para colaborar en el proyecto.

## Código de Conducta

- Sé respetuoso y profesional en todas las interacciones
- Acepta feedback constructivo
- Enfócate en lo mejor para la comunidad
- Muestra empatía hacia otros colaboradores

## Cómo Contribuir

### 1. Reportar Bugs

Si encuentras un bug:

1. Verifica que no exista un issue similar
2. Crea un nuevo issue con:
   - Descripción clara del problema
   - Pasos para reproducirlo
   - Comportamiento esperado vs. actual
   - Screenshots si aplica
   - Versión de Node.js y sistema operativo

### 2. Sugerir Mejoras

Para nuevas características o mejoras:

1. Abre un issue describiendo la propuesta
2. Explica el caso de uso
3. Discute la implementación antes de comenzar a codear
4. Espera feedback del equipo

### 3. Pull Requests

#### Antes de Crear un PR

- Fork el repositorio
- Crea una rama desde `main` con nombre descriptivo:
  ```bash
  git checkout -b feature/nombre-descriptivo
  # o
  git checkout -b fix/nombre-del-bug
  ```

#### Durante el Desarrollo

- Sigue las convenciones de código del proyecto
- Escribe tests para nuevas funcionalidades
- Mantén los commits atómicos y con mensajes claros
- Ejecuta los tests antes de hacer push:
  ```bash
  npm run test:run
  npm run lint
  ```

#### Convenciones de Código

- **TypeScript:** Usa tipos explícitos, evita `any`
- **Nombres:** camelCase para variables/funciones, PascalCase para componentes
- **Componentes:**
  - Server Components en `page.tsx`
  - Client Components con sufijo `Client.tsx`
  - Server Actions en `actions.ts`
- **Imports:** Usa alias `@/` para imports absolutos
- **Estilos:** Usa Tailwind CSS, evita CSS inline

#### Estructura de Commits

```
tipo: descripción breve (max 50 caracteres)

Descripción más detallada si es necesario.
Explica el qué y el por qué, no el cómo.

Fixes #123
```

Tipos válidos:
- `feat:` Nueva funcionalidad
- `fix:` Corrección de bug
- `docs:` Cambios en documentación
- `style:` Formato, sin cambios de lógica
- `refactor:` Refactorización de código
- `test:` Agregar o modificar tests
- `chore:` Tareas de mantenimiento

#### Crear el Pull Request

1. Push a tu fork
2. Crea el PR en GitHub
3. Completa la plantilla del PR
4. Vincula issues relacionados
5. Espera la revisión de código

### 4. Revisión de Código

- Responde a comentarios de manera constructiva
- Haz los cambios solicitados
- Marca conversaciones como resueltas cuando corresponda
- Mantén la paciencia durante el proceso

## Políticas de Seguridad

### ⚠️ CRÍTICO: Manejo de Secretos

**NUNCA commitees información sensible:**

- ❌ Archivos `.env`, `.env.local`, `.env.production`
- ❌ API keys, tokens, credenciales
- ❌ Certificados (`.pem`, `.key`, `.p12`)
- ❌ Datos personales de usuarios reales
- ❌ PDFs con información financiera real

### ✅ Buenas Prácticas de Seguridad

1. **Variables de Entorno**
   - Usa `.env.example` como template
   - Documenta todas las variables necesarias
   - Nunca incluyas valores reales en `.env.example`

2. **Datos de Prueba**
   - Usa datos ficticios en tests
   - Nombres genéricos (ej: "Juan Pérez", "Test User")
   - Fechas pasadas o futuras genéricas
   - No uses números de tarjeta reales

3. **Antes de Commitear**
   ```bash
   # Verifica que no hay archivos sensibles
   git status

   # Revisa los cambios
   git diff

   # Asegúrate que .gitignore funciona
   git check-ignore -v .env.local
   ```

4. **Si Expones Credenciales Accidentalmente**
   - ⚠️ **NO** borres el commit y fuerces push
   - Rota las credenciales INMEDIATAMENTE en Supabase
   - Notifica al equipo
   - Considera regenerar el proyecto si tiene datos sensibles

### Validación de Input

- Siempre valida datos del usuario antes de guardar en DB
- Usa el helper `sanitizeDbError()` para errores de PostgreSQL
- Escapa HTML en contenido generado por usuarios
- Previene SQL injection usando Supabase query builder

### Dependencias

- Mantén dependencias actualizadas
- Revisa vulnerabilidades con `npm audit`
- No instales paquetes no verificados

## Desarrollo Local

### Setup Inicial

```bash
# Clonar tu fork
git clone https://github.com/tu-usuario/finanzas-arg.git
cd finanzas-arg

# Agregar upstream
git remote add upstream https://github.com/original-owner/finanzas-arg.git

# Instalar dependencias
npm install

# Configurar .env.local
cp .env.example .env.local
# Edita .env.local con tus credenciales de Supabase

# Ejecutar tests
npm run test

# Iniciar dev server
npm run dev
```

### Mantener tu Fork Actualizado

```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

## Testing

- Escribe tests para nuevas funcionalidades
- Mantén cobertura de tests alta
- Tests deben ser determinísticos
- Usa mocks para servicios externos

```bash
# Tests en modo watch
npm run test

# Una ejecución
npm run test:run

# Con coverage (si está configurado)
npm run test:coverage
```

## Estructura de Módulos

Al agregar nuevas funcionalidades, sigue el patrón existente:

```
app/protected/[nuevo-modulo]/
├── page.tsx              # Server Component
├── [Feature]Client.tsx   # Client Component
└── actions.ts            # Server Actions

lib/[nuevo-modulo]/
├── index.ts              # Funciones principales
└── __tests__/
    └── index.test.ts     # Tests
```

## Recursos

- [Documentación de Next.js 15](https://nextjs.org/docs)
- [Guía de Supabase](https://supabase.com/docs)
- [shadcn/ui Components](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/docs)

## Preguntas

Si tienes preguntas:
1. Revisa la documentación existente
2. Busca en issues cerrados
3. Abre un nuevo issue con la etiqueta `question`

---

¡Gracias por contribuir a Finanzas Argentina! 🚀
