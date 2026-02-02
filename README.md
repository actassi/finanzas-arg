# 💰 Finanzas Argentina

Sistema de gestión de finanzas personales construido con Next.js 15, React 19 y Supabase. Diseñado para rastrear transacciones, categorizar gastos y generar reportes visuales.

## Características

- 🏦 **Gestión de Cuentas** - Administra múltiples cuentas bancarias y tarjetas de crédito
- 📊 **Categorías Personalizables** - Organiza tus gastos con categorías con códigos de color
- 💳 **Importación de PDFs** - Parseo automático de resúmenes de tarjetas (Visa, etc.) usando OCR y extracción de texto
- 📈 **Reportes Visuales** - Gráficos interactivos con Recharts para analizar tus gastos
- 🤖 **Reglas de Auto-clasificación** - Clasifica transacciones automáticamente según patrones
- 🔒 **Autenticación Segura** - Sistema de auth completo con Supabase
- 🌙 **Modo Oscuro** - Tema oscuro por defecto con soporte para temas personalizados

## Tech Stack

- **Framework:** Next.js 15 (App Router) + React 19
- **Base de Datos:** Supabase (PostgreSQL)
- **Estilos:** Tailwind CSS + shadcn/ui
- **Gráficos:** Recharts
- **PDF Parsing:** pdfjs-dist + tesseract.js (OCR fallback)
- **Testing:** Vitest

## Requisitos Previos

- Node.js 20+
- Cuenta de Supabase (gratuita disponible en [database.new](https://database.new))

## Instalación

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/tu-usuario/finanzas-arg.git
   cd finanzas-arg
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**

   Copia `.env.example` a `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

   Actualiza las variables en `.env.local` con tus credenciales de Supabase:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=tu-project-url
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=tu-publishable-key
   ```

4. **Ejecutar el servidor de desarrollo**
   ```bash
   npm run dev
   ```

   La aplicación estará disponible en [http://localhost:3000](http://localhost:3000)

## Comandos Disponibles

```bash
npm run dev         # Servidor de desarrollo
npm run build       # Build de producción
npm run start       # Servidor de producción
npm run lint        # Ejecutar ESLint
npm run test        # Tests en modo watch
npm run test:run    # Ejecutar tests una vez
```

## Estructura del Proyecto

```
app/
├── protected/
│   ├── accounts/       # Gestión de cuentas bancarias
│   ├── categories/     # Categorías de gastos
│   ├── transactions/   # CRUD de transacciones + import PDF
│   ├── reports/        # Visualizaciones y reportes
│   └── rules/          # Reglas de auto-clasificación
lib/
├── pdf/                # Parsers de PDFs (text + OCR)
├── supabase/           # Clientes de Supabase
└── utils.ts            # Utilidades
components/ui/          # Componentes de shadcn/ui
types/db.ts             # Tipos TypeScript de la DB
```

## Arquitectura

Este proyecto sigue el patrón de Next.js 15 con App Router:

- **Server Components** (`page.tsx`) - Fetch de datos con Supabase
- **Client Components** (`*Client.tsx`) - UI interactiva con `"use client"`
- **Server Actions** (`actions.ts`) - Mutaciones con validación

### Flujo de Datos

```
page.tsx (Server)
  → fetch data via Supabase
  → pasa a Client Component

Client Component
  → invoca Server Action
  → action valida y muta DB
  → revalidatePath()
```

## Importación de PDFs

El sistema soporta importación automática de resúmenes de tarjetas:

1. **Extracción de texto** - Intenta primero con pdfjs-dist
2. **OCR Fallback** - Si falla, usa Tesseract.js para OCR
3. **Parsing** - Detecta transacciones y las estructura

Parsers disponibles:
- Visa Macro (Argentina)
- Extensible para otros bancos

## Testing

```bash
npm run test        # Modo watch
npm run test:run    # Una ejecución
```

Los tests incluyen:
- Parseo de PDFs (texto y OCR)
- Validación de datos
- Timeout de 60s para tests de OCR

## Deployment

### Vercel (Recomendado)

1. Haz push de tu código a GitHub
2. Importa el proyecto en [Vercel](https://vercel.com)
3. Conecta con Supabase usando la [integración oficial](https://vercel.com/integrations/supabase)
4. Las variables de entorno se configuran automáticamente

### Otras Plataformas

Asegúrate de configurar las variables de entorno:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

## Contribuir

Las contribuciones son bienvenidas. Por favor lee [CONTRIBUTING.md](CONTRIBUTING.md) para detalles sobre el proceso y políticas de seguridad.

## Seguridad

- ⚠️ **NUNCA** commitees archivos `.env*.local` o `.env`
- Usa `.env.example` como template
- Si expones credenciales accidentalmente, rótalas inmediatamente en Supabase
- Los errores de DB son sanitizados antes de mostrarse al usuario

## Licencia

Este proyecto está bajo la licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

## Autor

Creado con ❤️ para la comunidad argentina

---

**¿Encontraste un bug?** [Reporta un issue](https://github.com/tu-usuario/finanzas-arg/issues)
