<div align="center">
  <img src="resources/icon_2.png" alt="AI Workspace Manager Logo" width="220">
  <h1>AI Workspace Manager</h1>

  <p>
    Centro de control local para analizar workspaces, medir salud tecnica, registrar memoria del proyecto,
    ejecutar tareas con IA y operar en Windows/macOS con Electron o en Linux/WSL con servidor web headless.
  </p>

  <p>
    <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg"></a>
    <a href="https://nodejs.org/"><img alt="Node.js >=20" src="https://img.shields.io/badge/Node.js-%3E%3D20-339933.svg?logo=node.js&logoColor=white"></a>
    <a href="https://www.electronjs.org/"><img alt="Electron Desktop" src="https://img.shields.io/badge/Electron-desktop-47848F.svg?logo=electron&logoColor=white"></a>
    <a href="https://react.dev/"><img alt="React" src="https://img.shields.io/badge/React-renderer-61DAFB.svg?logo=react&logoColor=black"></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6.svg?logo=typescript&logoColor=white"></a>
    <a href="https://www.sqlite.org/"><img alt="SQLite" src="https://img.shields.io/badge/SQLite-persistence-003B57.svg?logo=sqlite&logoColor=white"></a>
    <a href="https://www.prisma.io/"><img alt="Prisma" src="https://img.shields.io/badge/Prisma-ORM-2D3748.svg?logo=prisma&logoColor=white"></a>
    <a href="https://github.com/wilkinbarban/AI-Workspace-Manager/releases"><img alt="Releases" src="https://img.shields.io/github/v/release/wilkinbarban/AI-Workspace-Manager"></a>
  </p>

  <p>
    <a href="#instalacion-rapida-en-windows">Windows</a> |
    <a href="#instalacion-rapida-en-linux-wsl-y-macos">Linux / WSL / macOS</a> |
    <a href="#comandos-disponibles">Comandos</a> |
    <a href="#arquitectura">Arquitectura</a>
  </p>
</div>

## Resumen

AI Workspace Manager es una aplicacion local para auditar, documentar y mejorar proyectos de software con ayuda de IA. Escanea carpetas del equipo, detecta tecnologias, calcula metricas de salud, genera recomendaciones, conserva memoria cronologica, registra tareas completadas y permite ejecutar agentes sobre tareas con diffs visibles.

El proyecto soporta dos modos principales:

- **Desktop Electron** para Windows y macOS.
- **Web headless** para Linux y WSL, con backend Node.js local y frontend en navegador.

La version actual del proyecto es `0.1.0` y la licencia es MIT.

## Funcionalidades

- Escaneo local de workspaces con exclusion de carpetas pesadas como `node_modules`, `.git`, `dist`, `build`, `.cache` y entornos virtuales.
- Deteccion de lenguaje principal, framework, dependencias, README, licencia, Git, Docker y tests.
- Health score por documentacion, tests, seguridad, Git, Docker, arquitectura y mantenibilidad.
- Memoria del proyecto con scans, analisis IA y tareas completadas.
- Tareas manuales o generadas por IA, con registro de avance.
- Proveedores IA configurables: OpenAI, Anthropic, DeepSeek, Google Gemini y OpenRouter.
- Consumo estimado de tokens y costos por proveedor, modelo y tipo de tarea.
- Agente con herramientas internas para listar, leer y escribir archivos dentro del workspace.
- Monitor de eventos del agente y visor de diffs para auditar cambios.
- SQLite local gestionado por Prisma.

## Requisitos

- Node.js `>= 20`.
- npm `>= 10`.
- Acceso a internet para descargar el ZIP del repositorio y dependencias npm.
- Windows: PowerShell; opcionalmente `winget` para instalar Node.js automaticamente.
- Linux/WSL: `curl` y `unzip` o `python3`.
- macOS: Homebrew recomendado si falta Node.js.
- Opcional: `keytar` para guardar API keys en el almacen seguro del sistema. Si no esta disponible, la aplicacion cambia a configuracion por `.env`.

## Modos de ejecucion

### Windows

Windows usa la aplicacion Electron de escritorio. El instalador `install.ps1` descarga el proyecto desde `main`, prepara la carpeta local, instala dependencias, repara Electron si hace falta, configura Prisma/SQLite y ejecuta `npm run dev`.

En este modo la interfaz se comunica con el proceso principal de Electron por IPC seguro (`window.api`). La configuracion de IA se gestiona desde el boton global **Configurar IA**. Si `keytar` esta disponible, las API keys se guardan en el almacen seguro del sistema operativo; si no esta disponible, la interfaz muestra el flujo alternativo por `.env`.

### Linux y WSL

Linux y WSL usan el modo web headless como ruta oficial. No se intenta arrancar Electron. El instalador Bash levanta:

- backend Node.js en `http://localhost:3000`;
- frontend Vite en `http://localhost:5173`;
- WebSocket API local en `/ws`.

En desarrollo se abre `http://localhost:5173`, que consume el backend local en `http://localhost:3000/ws`. En produccion, despues de `npm run web:build`, `npm run web:start` sirve la UI compilada y la API desde un solo puerto: `http://localhost:3000`.

La configuracion de IA en Linux/WSL debe tratarse como headless: la API key puede probarse temporalmente desde la interfaz, pero para dejarla persistente se debe escribir en `.env` y reiniciar el servidor.

El boton de anadir proyecto solicita una ruta absoluta, por ejemplo:

```text
/home/usuario/workspace/mi-proyecto
```

### macOS

macOS usa Electron Desktop en modo desarrollo. `install.sh` detecta `Darwin`, valida Node/npm, instala dependencias, repara Electron, prepara Prisma/SQLite y arranca `npm run dev`.

> Nota: el proyecto aun no genera instaladores `.app` o `.dmg`; el soporte macOS actual es para ejecucion de desarrollo con Electron.

macOS comparte el mismo flujo de configuracion IA que Windows: boton **Configurar IA**, guardado con `keytar` si esta disponible y fallback por `.env` si el almacen seguro nativo no puede cargarse.

## Instalacion rapida en Windows

Ejecuta en PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/wilkinbarban/AI-Workspace-Manager/main/install.ps1 | iex"
```

Flujo real de `install.ps1`:

- crea `install.log` temporal y luego lo mueve a la carpeta instalada;
- valida Node.js `>= 20`;
- valida npm `>= 10`;
- instala Node.js con `winget` si falta y `winget` esta disponible;
- descarga `main.zip` desde GitHub;
- evita instalar en Escritorio sincronizado con OneDrive;
- usa `%USERPROFILE%\AI-Workspace-Manager` si detecta OneDrive;
- crea backup con timestamp si ya existe una instalacion previa;
- copia `.env.example` a `.env` cuando no existe;
- instala dependencias con `npm ci` si hay `package-lock.json`, o `npm install` como fallback;
- valida `node_modules/electron/path.txt`, `dist/version` y el ejecutable de Electron;
- ejecuta `npm run electron:repair` y fallback manual si Electron esta incompleto;
- ejecuta `npm run prisma:generate`;
- ejecuta `npm run db:push`;
- inicia la aplicacion con `npm run dev`;
- guarda stdout/stderr de comandos externos en `install.log`.

Ruta de log:

```text
<carpeta-del-proyecto>\install.log
```

## Instalacion rapida en Linux, WSL y macOS

Ejecuta en una terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/wilkinbarban/AI-Workspace-Manager/main/install.sh | bash
```

Flujo real de `install.sh`:

- detecta `Linux` o `Darwin`;
- identifica distribucion Linux desde `/etc/os-release`;
- valida Node.js `>= 20` y npm `>= 10`;
- en Linux instala Node.js con `apt`, `dnf`, `pacman` o `zypper` cuando aplica;
- en macOS usa Homebrew si necesita instalar Node.js;
- descarga el ZIP de `main` desde GitHub;
- extrae con `unzip` o fallback Python;
- crea backup con timestamp si la carpeta destino ya existe;
- copia `.env.example` a `.env`;
- instala dependencias con `npm ci` o `npm install`;
- en Linux/WSL exporta `ELECTRON_SKIP_BINARY_DOWNLOAD=1`, `AIWM_SKIP_ELECTRON_REPAIR=1` y `AIWM_HEADLESS_WEB=1`;
- en Linux/WSL no repara Electron y arranca backend + frontend web;
- en macOS repara Electron y ejecuta `npm run dev`;
- ejecuta `npm run prisma:generate`;
- ejecuta `npm run db:push`;
- mueve el log final a `<carpeta-del-proyecto>/install.log`.

En Linux/WSL, abre:

```text
http://localhost:5173
```

Logs generados:

- `install.log`: instalacion y preparacion.
- `server.log`: backend Node.js.
- `web.log`: frontend Vite.

Variables utiles:

```bash
TARGET_FOLDER="$HOME/AI-Workspace-Manager" curl -fsSL https://raw.githubusercontent.com/wilkinbarban/AI-Workspace-Manager/main/install.sh | bash
START_APP=false curl -fsSL https://raw.githubusercontent.com/wilkinbarban/AI-Workspace-Manager/main/install.sh | bash
BACKEND_PORT=3000 FRONTEND_PORT=5173 curl -fsSL https://raw.githubusercontent.com/wilkinbarban/AI-Workspace-Manager/main/install.sh | bash
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

En macOS, usa `cp` en lugar de `Copy-Item`:

```bash
npm install
cp .env.example .env
npm run electron:repair
npm run prisma:generate
npm run db:push
npm run dev
```

## Ejecucion manual en Linux/WSL

### Desarrollo web en Linux/WSL

Opcion recomendada en una sola terminal:

```bash
ELECTRON_SKIP_BINARY_DOWNLOAD=1 AIWM_SKIP_ELECTRON_REPAIR=1 AIWM_HEADLESS_WEB=1 npm install
cp .env.example .env
npm run prisma:generate
npm run db:push
npm run web:dev:all
```

Luego abre:

```text
http://localhost:5173
```

Opcion alternativa en dos terminales:

Terminal 1, backend:

```bash
ELECTRON_SKIP_BINARY_DOWNLOAD=1 AIWM_SKIP_ELECTRON_REPAIR=1 AIWM_HEADLESS_WEB=1 npm install
cp .env.example .env
npm run prisma:generate
npm run db:push
npm run web:server
```

Terminal 2, frontend:

```bash
npm run web:dev -- --host 0.0.0.0 --port 5173
```

Luego abre:

```text
http://localhost:5173
```

No abras `http://localhost:3000` esperando ver la interfaz durante desarrollo. En desarrollo ese puerto es solo backend API/WebSocket.

### Produccion web local

Para probar el modo web compilado en un solo puerto:

```bash
ELECTRON_SKIP_BINARY_DOWNLOAD=1 AIWM_SKIP_ELECTRON_REPAIR=1 AIWM_HEADLESS_WEB=1 npm install
cp .env.example .env
npm run prisma:generate
npm run db:push
npm run web:build
npm run web:start
```

Luego abre:

```text
http://localhost:3000
```

En este modo `web:start` sirve la UI desde `out/web`, el backend desde `out/server/index.js` y el WebSocket en `ws://localhost:3000/ws`.

## Configuracion de IA

La aplicacion necesita al menos un proveedor IA activo para mostrar el dashboard completo. La configuracion puede hacerse desde la pantalla inicial o desde el boton global **Configurar IA** en la barra superior.

Proveedores disponibles:

- OpenAI / GPT / Codex.
- Anthropic Claude.
- DeepSeek.
- Google Gemini.
- OpenRouter.

Campos configurables:

- proveedor;
- Base URL;
- modelo;
- API key;
- proveedor predeterminado;
- estado habilitado;
- limite mensual opcional de tokens.

### Escritorio Windows/macOS

En Electron, **Configurar IA** permite guardar o actualizar proveedores desde la interfaz:

1. Pulsa **Configurar IA**.
2. Selecciona proveedor.
3. Elige modelo y Base URL.
4. Pega la API key.
5. Usa **Probar conexion** para validar.
6. Usa **Guardar proveedor** para persistir la configuracion.

Cuando `keytar` esta disponible, la API key no se guarda en SQLite: se almacena en el almacen seguro del sistema operativo. En la base local solo queda un secreto enmascarado, por ejemplo `sk-****1234`.

Si ya habia una clave guardada, el campo aparece como **Nueva API key (opcional)**. Puedes cambiar modelo/Base URL sin volver a pegar la clave; solo pega una nueva clave si quieres reemplazarla.

### Web Linux/WSL/headless

En modo web/headless no se debe asumir que existe un almacen seguro nativo. Por eso la UI cambia de comportamiento cuando `keytar` no esta disponible:

- muestra el proveedor y sus modelos;
- permite escribir una **API key temporal** para **Probar conexion**;
- genera el bloque `.env` exacto que debes copiar;
- no guarda la API key desde la UI;
- requiere reiniciar el backend para que Node cargue los cambios del `.env`.

Ejemplo para DeepSeek:

```env
DEEPSEEK_API_KEY="tu_api_key"
DEEPSEEK_BASE_URL="https://api.deepseek.com"
DEEPSEEK_MODEL="deepseek-v4-flash"
```

Ejemplo para OpenAI:

```env
OPENAI_API_KEY="tu_api_key"
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_MODEL="gpt-4.1-mini"
```

Ejemplo para Anthropic:

```env
ANTHROPIC_API_KEY="tu_api_key"
ANTHROPIC_BASE_URL="https://api.anthropic.com/v1"
ANTHROPIC_MODEL="claude-sonnet-4-6"
```

Ejemplo para Gemini:

```env
GEMINI_API_KEY="tu_api_key"
GEMINI_BASE_URL="https://generativelanguage.googleapis.com/v1beta"
GEMINI_MODEL="gemini-2.5-flash"
```

Ejemplo para OpenRouter:

```env
OPENROUTER_API_KEY="tu_api_key"
OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"
OPENROUTER_MODEL="openai/gpt-4.1-mini"
```

Despues de modificar `.env`, reinicia el modo web:

```bash
# Desarrollo
npm run web:dev:all

# Produccion local
npm run web:start
```

Cuando una variable `.env` esta configurada, el proveedor aparece en la app como proveedor virtual, por ejemplo `DeepSeek (.env)`.

### Base SQLite local

La base de datos se define en `.env` con:

```env
DATABASE_URL="file:../../../.data/ai-workspace-manager.db"
```

## Comandos disponibles

| Comando | Uso |
| --- | --- |
| `npm run dev` | Inicia Electron en modo desarrollo para Windows/macOS. Usa `node --disable-warning=DEP0205` para ocultar el warning conocido de `module.register()` en Node moderno sin cambiar el comportamiento. |
| `npm run web:dev` | Inicia el frontend web con Vite en el puerto 5173. |
| `npm run web:dev:all` | Inicia backend y frontend juntos para Linux/WSL en modo desarrollo. |
| `npm run web:server` | Inicia el backend Node.js con `tsx` en el puerto 3000. |
| `npm run web:build` | Compila frontend web y servidor backend. |
| `npm run web:build:server` | Compila solo el servidor backend hacia `out/server/index.js`. |
| `npm run web:start` | Inicia el servidor compilado y sirve UI, API y WebSocket desde `http://localhost:3000`. |
| `npm run build` | Ejecuta typecheck y compila la app Electron. Tambien oculta `DEP0205` durante el build. |
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

```text
src/
  main/       Electron main, preload, IPC y servicios de aplicacion.
  server/     Servidor Node.js headless con HTTP y WebSocket para Linux/WSL.
  renderer/   Interfaz React, hooks y cliente API por IPC o WebSocket.
  core/       Scanner, agentes, skills, proveedores IA y logica de dominio.
  database/   Prisma, schema SQLite, migraciones y mappers.
  shared/     Tipos, esquemas Zod, constantes IPC y errores compartidos.
tests/        Pruebas unitarias con Vitest.
```

Comunicacion:

- Electron: `renderer -> preload -> IPC -> services`.
- Web headless: `renderer -> WebSocket /ws -> src/server -> services`.

## Datos locales y seguridad

- Los proyectos, scans, tareas, memoria, reportes y consumo IA se almacenan en SQLite.
- Las API keys guardadas desde la UI usan `keytar` cuando esta disponible.
- Si `keytar` no esta disponible, la UI no persiste secretos y muestra instrucciones `.env`.
- Las API keys usadas en **API key temporal** solo sirven para probar conexion en esa sesion del formulario.
- Los proveedores definidos por `.env` se exponen como proveedores virtuales con id interno `env:<proveedor>`.
- `.env` es local y no debe subirse al repositorio.
- El scanner no sigue symlinks y excluye carpetas generadas o pesadas.
- Las skills del agente validan rutas para no escribir fuera del workspace activo.
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

Si ejecutaste `npm run web:build` seguido de `npm run web:start`, abre:

```text
http://localhost:3000
```

En desarrollo `5173` es el frontend Vite y `3000` es el backend. En produccion local `3000` sirve todo.

### Error con Electron en Windows/macOS

Si aparece `Electron uninstall`, ejecuta:

```powershell
npm run electron:repair
npm run dev
```

En Linux/WSL este flujo no aplica porque el modo oficial es web headless.

### No se guardan API keys

Si `keytar` no esta disponible en tu sistema, el boton **Configurar IA** no intentara guardar la API key desde la UI. Veras un campo **API key temporal** para probar conexion y un bloque `.env` con las variables exactas. Copia esas variables en `.env`, reinicia el servidor y vuelve a abrir la app.

Variables principales:

```env
DEEPSEEK_API_KEY="tu_api_key"
OPENAI_API_KEY="tu_api_key"
ANTHROPIC_API_KEY="tu_api_key"
GEMINI_API_KEY="tu_api_key"
OPENROUTER_API_KEY="tu_api_key"
```

### No aparece la pantalla de configuracion IA

Si ya existe un proveedor activo, la app entra directo al dashboard. Usa el boton **Configurar IA** en la barra superior para cambiar modelo, Base URL o API key.

Si solo ves la barra superior y no carga el formulario, comprueba que el backend web este activo:

```bash
curl http://localhost:3000/api/status
```

En desarrollo web, el frontend debe poder conectar con `ws://localhost:3000/ws`.

### Warning `DEP0205` al iniciar Electron

Node.js moderno puede mostrar:

```text
[DEP0205] DeprecationWarning: module.register() is deprecated.
```

El script `npm run dev` ya ejecuta `electron-vite` mediante `node --disable-warning=DEP0205`, igual que el build, para mantener limpia la consola. El warning venia del tooling de Vite/Electron, no del codigo de la aplicacion.

## Estado del soporte por plataforma

| Plataforma | Modo oficial | Estado |
| --- | --- | --- |
| Windows | Electron Desktop con `install.ps1` | Soportado |
| Linux | Web headless con `install.sh` | Soportado |
| WSL | Web headless con `install.sh` | Soportado |
| macOS | Electron Desktop con `install.sh` | Soportado en desarrollo |

## Licencia

Este proyecto se distribuye bajo licencia MIT. Consulta [LICENSE](LICENSE).
