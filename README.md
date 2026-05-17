# AI Workspace Manager v1.0.0

**AI Workspace Manager** es una plataforma centralizada (desktop application) orientada al análisis, diagnóstico y optimización de proyectos de software utilizando agentes de Inteligencia Artificial avanzados.

## Objeto Social y Objetivo del Proyecto

El objetivo principal de **AI Workspace Manager** es proveer a desarrolladores, líderes técnicos y arquitectos de software de una herramienta todo en uno para auditar la salud de sus repositorios locales. La aplicación permite mantener el control total sobre el código fuente, al tiempo que automatiza la detección de problemas, sugiere recomendaciones arquitectónicas y permite ejecutar agentes autónomos para refactorización, generación de código y documentación.

La herramienta nace con el **objeto social** de reducir la deuda técnica en los equipos de desarrollo y democratizar el acceso a auditorías de código de nivel "Senior Architect" mediante IA, asegurando en todo momento que la privacidad de los datos locales se mantenga, salvo por los envíos estrictamente necesarios a las APIs configuradas.

## Funcionalidades Principales

- **Análisis de Repositorios Locales:** Escaneo en tiempo real de la estructura, lenguaje, framework y dependencias de cualquier proyecto local.
- **Métricas de Salud:** Generación de un _Health Score_ que evalúa arquitectura, pruebas, seguridad, Git, Docker, etc.
- **Agentes IA Integrados:** Capacidad de ejecutar tareas autónomas (agentes) para resolver problemas detectados directamente en tu código, con previsualización de diferencias (`file diffs`).
- **Control de Consumo de Tokens:** Sistema de registro detallado de uso de tokens y estimación de costos en USD.
- **Gestión de Memoria y Tareas:** Almacenamiento local persistente (SQLite) del contexto de diseño, decisiones arquitectónicas y tareas de mantenimiento del proyecto.

## Proveedores IA Soportados

La aplicación soporta los siguientes proveedores líderes en la industria, permitiendo enrutar las tareas al modelo más adecuado:

1. **OpenAI** (`gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`, `gpt-4o`, `o3`, `o4-mini`)
2. **Anthropic Claude** (`claude-sonnet-4-6`, `claude-opus-4-7`, `claude-haiku-4-5`)
3. **DeepSeek** (`deepseek-v4-pro`, `deepseek-v4-flash`)
4. **Google Gemini** (`gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`)
5. **OpenRouter** (Enrutador dinámico multiproveedor)

> **Seguridad:** Todas las credenciales (API Keys) se cifran y almacenan de forma local y segura en el sistema operativo del usuario.

## Arquitectura del Proyecto

El proyecto está construido bajo el paradigma de **Electron**, con una clara separación de responsabilidades:
- **Core (Backend):** Lógica de negocio, acceso a BD con Prisma (SQLite), escáner del workspace, registro y conexión con los proveedores de IA.
- **Renderer (Frontend):** Construido en React + TypeScript + Tailwind CSS v4. Se comunica con el backend estrictamente a través del puente IPC (`preload`), garantizando seguridad.
- **Shared:** Tipos, contratos y utilidades compartidas entre frontend y backend para tipado estático riguroso en toda la aplicación.

## Instalación Rápida (Un Clic - Windows PowerShell)

Si estás en Windows, puedes configurar e instalar todo tu entorno (incluyendo Node.js, npm, descarga directa del proyecto y la base de datos local) de forma 100% automatizada ejecutando el siguiente comando en tu PowerShell:

```powershell
powershell -c "irm https://raw.githubusercontent.com/wilkinbarban/AI-Workspace-Manager/main/install.ps1 | iex"
```

> [!NOTE]
> **¿Qué realiza este script automatizado?**
> * **Validación de Entorno:** Comprueba si cuentas con Node.js (versión >= 20) y npm (versión >= 10) instalados en tu sistema.
> * **Instalación de Dependencias del Sistema:** Si falta Node.js o npm, los descarga e instala de forma silenciosa utilizando **winget** de Microsoft.
> * **Recarga Dinámica de PATH:** Actualiza las variables de entorno de la sesión activa de PowerShell para utilizar inmediatamente los nuevos comandos sin necesidad de reiniciar la consola.
> * **Descarga y Extracción Directa:** Descarga el código fuente en un archivo ZIP directamente de GitHub y lo extrae de forma limpia en tu **Escritorio** (`AI-Workspace-Manager`). ¡No necesitas tener instalado Git!
> * **Configuración del Proyecto:** Accede a la carpeta en tu escritorio y ejecuta la instalación de paquetes (`npm install`), genera el cliente Prisma (`npm run prisma:generate`) y despliega la base de datos local SQLite (`npm run db:push`).
> * **Arranque:** Inicia de forma automática el servidor de desarrollo (`npm run dev`).

## Instalación y Desarrollo Manual

### Requisitos previos
- Node.js >= 20
- npm >= 10

### Setup inicial

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar la base de datos local SQLite
# (Duplicar el archivo .env.example y renombrarlo a .env)
npm run prisma:generate
npm run db:push

# 3. Iniciar la aplicación en modo desarrollo
npm run dev
```

Si encuentras un error indicando `Electron uninstall`, ejecuta `npm run electron:install` primero.

## Licencia

Este proyecto se distribuye bajo los términos de la licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más detalles.
