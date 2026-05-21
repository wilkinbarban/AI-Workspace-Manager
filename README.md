# AI Workspace Manager

**Version actual:** `0.1.0`  
**Estado:** aplicacion en desarrollo activo  
**Plataformas:** Windows con Electron; Linux/WSL con servidor web headless; macOS con Electron

AI Workspace Manager es un centro de control local para analizar, documentar, organizar y mejorar proyectos de software con ayuda de IA. La aplicacion escanea repositorios en tu equipo, detecta tecnologias y senales de salud, registra memoria del proyecto, crea tareas accionables y permite conectar proveedores de IA para analisis, asistencia y ejecucion guiada.

El objetivo no es reemplazar tu editor ni tu flujo Git, sino darte una vista operativa del estado de tus workspaces y un punto unico para convertir hallazgos tecnicos en acciones concretas.

## Para que sirve

- Auditar rapidamente proyectos locales y entender su estructura.
- Detectar lenguaje principal, framework, dependencias, README, licencia, Git, Docker y tests.
- Calcular un health score por documentacion, tests, seguridad, Git, Docker, arquitectura y mantenibilidad.
- Registrar memoria local del proyecto con scans, analisis IA y tareas completadas.
- Crear y seguir tareas de mantenimiento tecnico.
- Configurar proveedores de IA y probar sus conexiones desde la interfaz.
- Ejecutar agentes sobre tareas, con monitor de eventos y registro de diffs.
- Controlar consumo estimado de tokens y costos por proveedor, modelo y tipo de tarea.

## Modos de ejecucion

### Windows

Windows usa la aplicacion Electron de escritorio. El instalador `install.ps1` descarga el proyecto, instala dependencias, prepara Prisma/SQLite, valida Electron y arranca `npm run dev`.

### Linux y WSL

Linux y WSL usan exclusivamente el modo web headless. No se intenta abrir Electron ni depender de una interfaz grafica nativa. El flujo inicia:

- backend Node.js local en `http://localhost:3000`;
- frontend Vite en `http://localhost:5173`;
- WebSocket API en `/ws`, proxyado por Vite hacia el backend.

El boton para anadir proyecto solicita una ruta absoluta del sistema Linux/WSL, por ejemplo:

```text
/home/usuario/workspace/mi-proyecto
```

### macOS

macOS conserva el flujo Electron de escritorio. El instalador Bash valida Node/npm, instala dependencias, repara Electron si hace falta y arranca `npm run dev`.

## Requisitos

- Node.js `>= 20`.
- npm `>= 10`.
- Acceso a internet para descargar dependencias y el codigo fuente.
- Windows: PowerShell y, opcionalmente, `winget`.
- Linux/WSL: `curl` y `unzip` o `python3`.
- macOS: Homebrew recomendado si falta Node.js.
- Opcional en Linux: `libsecret-1-dev` o equivalente si quieres usar Gnome Keyring con `keytar`; si no esta disponible, puedes usar variables en `.env`.

## Instalacion rapida en Windows

Ejecuta en PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/wilkinbarban/AI-Workspace-Manager/main/install.ps1 | iex"
```

El instalador:

- valida Node.js y npm;
- intenta instalar Node.js con `winget` si falta;
- descarga el proyecto desde la rama `main`;
- evita instalar en Escritorio sincronizado con OneDrive;
- crea backup si existe una instalacion previa;
- crea `.env` desde `.env.example` si no existe;
- instala dependencias con `npm ci` o `npm install`;
- valida y repara Electron;
- ejecuta `npm run prisma:generate` y `npm run db:push`;
- inicia la app con `npm run dev`;
- guarda la salida detallada en `install.log`.

## Instalacion rapida en Linux, WSL y macOS

Ejecuta en una terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/wilkinbarban/AI-Workspace-Manager/main/install.sh | bash
```

El instalador:

- detecta Linux, WSL o macOS;
- valida Node.js `>= 20` y npm `>= 10`;
- instala Node.js automaticamente en distribuciones compatibles;
- descarga el repositorio desde GitHub;
- crea backup de una instalacion previa;
- copia `.env.example` a `.env`;
- instala dependencias;
- prepara Prisma y SQLite;
- en Linux/WSL omite Electron y arranca backend + frontend web;
- en macOS repara Electron y arranca la app de escritorio;
- guarda `install.log` en la carpeta instalada.

En Linux/WSL abre:

```text
http://localhost:5173
```

Logs generados:

- `install.log`: instalacion y preparacion.
- `server.log`: backend Node.js.
- `web.log`: frontend Vite.

Puedes cambiar la carpeta de instalacion:

```bash
TARGET_FOLDER="$HOME/AI-Workspace-Manager" curl -fsSL https://raw.githubusercontent.com/wilkinbarban/AI-Workspace-Manager/main/install.sh | bash
```

Puedes preparar sin iniciar automaticamente:

```bash
START_APP=false curl -fsSL https://raw.githubusercontent.com/wilkinbarban/AI-Workspace-Manager/main/install.sh | bash
```

## Instalacion manual en Windows/macOS

```powershell
npm install
Copy-Item .env.example .env
npm run electron:repair
npm run prisma:generate
npm run db:push
npm run dev
```

## Ejecucion manual en Linux/WSL

Linux y WSL usan el modo web headless como ruta oficial.

Terminal 1:

```bash
ELECTRON_SKIP_BINARY_DOWNLOAD=1 AIWM_SKIP_ELECTRON_REPAIR=1 AIWM_HEADLESS_WEB=1 npm install
cp .env.example .env
npm run prisma:generate
npm run db:push
npm run web:server
```

Terminal 2:

```bash
npm run web:dev -- --host 0.0.0.0 --port 5173
```

Luego abre:

```text
http://localhost:5173
```

## Configuracion de IA

La primera vez que abras la app, configura al menos un proveedor IA desde la pantalla inicial o desde ajustes.

Datos habituales:

- nombre visible del proveedor;
- tipo de proveedor;
- Base URL;
- modelo;
- API key;
- limite mensual opcional de tokens.

Tambien puedes usar variables de entorno en `.env`:

```env
DEEPSEEK_API_KEY=""
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""
GEMINI_API_KEY=""
OPENROUTER_API_KEY=""
```

Base SQLite local:

```env
DATABASE_URL="file:../../../.data/ai-workspace-manager.db"
```

## Comandos disponibles

| Comando | Uso |
| --- | --- |
| `npm run dev` | Inicia la aplicacion Electron en modo desarrollo para Windows/macOS. |
| `npm run web:dev` | Inicia el frontend web con Vite en el puerto 5173. |
| `npm run web:server` | Inicia el backend Node.js con `tsx` en el puerto 3000. |
| `npm run web:build` | Compila frontend web y servidor backend. |
| `npm run web:build:server` | Compila solo el servidor backend hacia `out/server/index.js`. |
| `npm run web:start` | Inicia el servidor compilado y sirve la UI desde `out/web`. |
| `npm run build` | Ejecuta typecheck y compila la app Electron. |
| `npm run preview` | Previsualiza el build de Electron. |
| `npm run typecheck` | Verifica tipos TypeScript sin emitir archivos. |
| `npm run lint` | Ejecuta ESLint con cero warnings permitidos. |
| `npm test` | Ejecuta pruebas con Vitest. |
| `npm run prisma:generate` | Genera el cliente Prisma. |
| `npm run prisma:migrate` | Crea y aplica migraciones Prisma en desarrollo. |
| `npm run prisma:studio` | Abre Prisma Studio. |
| `npm run db:push` | Aplica el schema Prisma directamente a SQLite. |
| `npm run electron:install` | Ejecuta el instalador oficial del paquete Electron. |
| `npm run electron:repair` | Verifica y repara una instalacion incompleta de Electron. |

## Arquitectura

- `src/main`: proceso principal de Electron, IPC, preload y servicios de aplicacion compartidos.
- `src/server`: servidor Node.js headless para Linux/WSL con HTTP y WebSocket.
- `src/renderer`: interfaz React, estilos, componentes, hooks y cliente API por IPC o WebSocket.
- `src/core`: logica de dominio, scanner, agentes, skills y proveedores IA.
- `src/database`: cliente Prisma, schema, migraciones y mappers.
- `src/shared`: tipos, esquemas, constantes IPC y errores compartidos.
- `tests`: pruebas unitarias con Vitest.

En Electron, el renderer usa `window.api` expuesto por preload. En navegador, el renderer usa `webSocketApi`, que envia mensajes correlacionados al servidor local por `/ws`.

## Datos locales y seguridad

- Los proyectos, scans, tareas, memoria, reportes y consumo IA se almacenan en SQLite.
- Las API keys guardadas desde la UI usan `keytar` cuando esta disponible.
- `.env` es local y no debe subirse al repositorio.
- El scanner no sigue symlinks y excluye carpetas generadas o pesadas.
- El servidor web escucha en `127.0.0.1` por defecto y acepta origenes locales.

## Troubleshooting

### PowerShell no permite ejecutar el instalador

Usa el comando recomendado con `-ExecutionPolicy Bypass`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/wilkinbarban/AI-Workspace-Manager/main/install.ps1 | iex"
```

### `winget` no existe

Instala Node.js manualmente desde `https://nodejs.org`, abre una nueva terminal y vuelve a ejecutar el instalador.

### Linux/WSL no abre el navegador

Abre manualmente:

```text
http://localhost:5173
```

Revisa `server.log` y `web.log` dentro de la carpeta instalada.

### Error con Electron en Windows/macOS

Si aparece `Electron uninstall`, ejecuta:

```powershell
npm run electron:repair
npm run dev
```

En Linux/WSL este flujo no aplica porque el modo oficial es web headless.
