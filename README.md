# AI Workspace Manager

**Version actual:** `0.1.0`  
**Estado:** aplicacion de escritorio en desarrollo activo  
**Plataforma principal:** Windows, Electron, React, TypeScript y SQLite

AI Workspace Manager es un centro de control local para analizar, documentar, organizar y mejorar proyectos de software con ayuda de IA. La aplicacion escanea repositorios en tu equipo, detecta tecnologias y senales de salud, registra memoria del proyecto, crea tareas accionables y permite conectar proveedores de IA para analisis, asistencia y ejecucion guiada de tareas.

El objetivo no es reemplazar tu editor ni tu flujo Git, sino darte una vista operativa del estado de tus workspaces y un punto unico para convertir hallazgos tecnicos en acciones concretas.

## Para que sirve

- Auditar rapidamente proyectos locales y entender su estructura.
- Detectar lenguaje principal, framework, dependencias, presencia de README, licencia, Git, Docker y tests.
- Calcular un health score por areas como documentacion, tests, seguridad, Git, Docker, arquitectura y mantenibilidad.
- Registrar memoria local del proyecto con resultados de scans y decisiones utiles.
- Crear y seguir tareas de mantenimiento tecnico.
- Configurar proveedores de IA y probar sus conexiones desde la interfaz.
- Ejecutar agentes sobre tareas, con monitor de eventos y registro de diffs.
- Controlar consumo estimado de tokens y costos por proveedor, modelo y tipo de tarea.

## Funcionalidades principales

### Escaneo de workspaces

El scanner recorre el proyecto seleccionado, ignora carpetas pesadas como `node_modules`, `.git`, `dist`, `build`, `.cache`, `.venv` y similares, y genera:

- resumen del proyecto;
- arbol de archivos limitado para visualizacion;
- dependencias detectadas desde `package.json`, `pyproject.toml` y `requirements.txt`;
- problemas y recomendaciones;
- metricas de salud.

### Dashboard de salud

La aplicacion persiste los scans en SQLite y actualiza datos del proyecto como lenguaje, framework y puntuacion de salud. El dashboard muestra metricas para revisar el estado general y priorizar mejoras.

### Proveedores de IA

El proyecto incluye adaptadores para:

- OpenAI / GPT / Codex;
- Anthropic Claude;
- DeepSeek;
- Google Gemini;
- OpenRouter.

Las credenciales configuradas desde la interfaz se guardan mediante el almacen seguro del sistema cuando `keytar` esta disponible. Tambien existe soporte de fallback por variables de entorno para desarrollo, CI o escenarios sin interfaz grafica.

### Agentes, tareas y memoria

AI Workspace Manager permite convertir hallazgos en tareas, conservar memoria local asociada al proyecto y ejecutar agentes con herramientas internas de lectura, listado y escritura controlada de archivos. El monitor del agente muestra eventos de ejecucion, llamadas de herramientas, resultados y diffs generados.

### Seguimiento de uso

Cada interaccion IA puede registrar proveedor, modelo, tipo de tarea, tokens de entrada/salida, total estimado y costo aproximado. Esto ayuda a entender el consumo mensual y comparar proveedores.

## Requisitos

- Windows 10/11 con PowerShell.
- Node.js `>= 20`.
- npm `>= 10`.
- Acceso a internet para descargar dependencias y, si usas el instalador de un clic, descargar el ZIP del repositorio.
- Opcional: `winget`, usado por el instalador para instalar Node.js si no esta disponible.

## Instalacion rapida en Windows

Ejecuta este comando en PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/wilkinbarban/AI-Workspace-Manager/main/install.ps1 | iex"
```

El instalador:

- valida Node.js y npm;
- intenta instalar Node.js con `winget` si falta;
- descarga el proyecto desde la rama `main` como ZIP;
- elige una ruta de instalacion segura, evitando Escritorio sincronizado con OneDrive;
- crea backup si ya existe una instalacion previa;
- crea `.env` desde `.env.example` si no existe;
- instala dependencias con `npm ci` cuando hay `package-lock.json`, o `npm install` como fallback;
- valida y repara Electron con `npm run electron:repair` si detecta una instalacion incompleta;
- genera el cliente Prisma;
- aplica el esquema SQLite local con `npm run db:push`;
- inicia la app con `npm run dev`.

La consola del instalador muestra solo el avance principal, un indicador animado durante tareas largas y errores accionables. La salida completa de `npm`, Prisma, Electron y otros comandos se guarda en:

```text
<carpeta-del-proyecto>\install.log
```

Si ocurre un fallo antes de crear la carpeta final del proyecto, el instalador mostrara la ruta del log temporal en la consola.

La ruta por defecto es:

- `%USERPROFILE%\AI-Workspace-Manager` si hay OneDrive activo;
- `Desktop\AI-Workspace-Manager` si el Escritorio no esta sincronizado.

## Instalacion manual

Clona o descarga el repositorio y ejecuta:

```powershell
npm install
Copy-Item .env.example .env
npm run prisma:generate
npm run db:push
npm run dev
```

Si ya tienes `package-lock.json` y quieres una instalacion reproducible:

```powershell
npm ci
```

Si Electron no queda instalado correctamente:

```powershell
npm run electron:repair
```

## Configuracion de IA

La primera vez que abras la app, configura al menos un proveedor IA desde la pantalla inicial o desde Ajustes.

Datos habituales:

- nombre visible del proveedor;
- tipo de proveedor;
- Base URL, normalmente precargada por el manifest;
- modelo;
- API key;
- limite mensual opcional de tokens.

Tambien puedes usar variables de entorno en `.env`. Este modo se recomienda para CI, automatizaciones o desarrollo sin UI:

```env
DEEPSEEK_API_KEY=""
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""
GEMINI_API_KEY=""
OPENROUTER_API_KEY=""
```

La base de datos local se configura con:

```env
DATABASE_URL="file:../../../.data/ai-workspace-manager.db"
```

## Comandos disponibles

| Comando | Uso |
| --- | --- |
| `npm run dev` | Inicia la aplicacion Electron en modo desarrollo. |
| `npm run web:dev` | Inicia el renderer como app web con Vite. |
| `npm run web:build` | Compila el build web del renderer. |
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

El proyecto esta dividido por responsabilidades:

- `src/main`: proceso principal de Electron, IPC, menus, preload y servicios de aplicacion.
- `src/renderer`: interfaz React, estilos, componentes, hooks y cliente de API.
- `src/core`: logica de dominio, scanner de workspaces, detectores, reportes, agentes, skills y proveedores IA.
- `src/database`: cliente Prisma, schema, migraciones y mappers.
- `src/shared`: tipos, esquemas, constantes IPC y errores compartidos entre main y renderer.
- `tests`: pruebas unitarias con Vitest.

La comunicacion entre renderer y backend ocurre por IPC a traves de `preload`, evitando acceso directo del frontend a APIs privilegiadas de Node.

## Datos locales y seguridad

- Los proyectos, scans, tareas, memoria, reportes y logs se almacenan en SQLite.
- Las API keys guardadas desde la UI usan el almacen seguro del sistema mediante `keytar` cuando esta disponible.
- El archivo `.env` esta pensado para valores locales y no debe subirse al repositorio.
- El scanner evita seguir symlinks y excluye carpetas generadas o muy pesadas para reducir ruido y riesgo.

## Troubleshooting

### PowerShell no permite ejecutar el instalador

Usa el comando recomendado con `-ExecutionPolicy Bypass` para esa sesion:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/wilkinbarban/AI-Workspace-Manager/main/install.ps1 | iex"
```

### `winget` no existe

Instala Node.js manualmente desde `https://nodejs.org`, abre una nueva terminal y vuelve a ejecutar el instalador.

### Node.js o npm no aparecen despues de instalar

Cierra y abre PowerShell. El instalador intenta refrescar `PATH`, pero algunos entornos requieren una terminal nueva.

### Error con Electron

Si aparece `Electron uninstall`, ejecuta:

```powershell
npm run electron:repair
```

Luego intenta de nuevo:

```powershell
npm run dev
```

Cuando el problema ocurre durante la instalacion de un clic, revisa `install.log` dentro de la carpeta instalada. El instalador valida `node_modules/electron/path.txt`, `node_modules/electron/dist/version` y `node_modules/electron/dist/electron.exe` antes de iniciar la app. Si la reparacion normal no deja Electron listo, el instalador extrae manualmente el ZIP oficial de Electron desde la cache local o lo descarga desde GitHub Releases.

### Error con Prisma o SQLite

Verifica que existe `.env` y que contiene `DATABASE_URL`. Despues ejecuta:

```powershell
npm run prisma:generate
npm run db:push
```

### Ya existe una instalacion previa

El instalador seguro no borra tu carpeta anterior sin respaldo. Si encuentra una instalacion existente, la mueve a una carpeta con sufijo `.backup-YYYYMMDD-HHMMSS` antes de instalar una copia nueva.

### OneDrive bloquea archivos

Si el Escritorio esta sincronizado con OneDrive, el instalador usa `%USERPROFILE%\AI-Workspace-Manager` para evitar bloqueos, latencia de sincronizacion y errores de permisos.

## Licencia

Este proyecto se distribuye bajo licencia MIT. Consulta [LICENSE](LICENSE) para mas informacion.
