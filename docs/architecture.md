# Architecture

AI Workspace Manager usa Electron como contenedor desktop, React como renderer y
Node.js en el proceso main para acceder de forma controlada al sistema local.

## Boundaries

- Main process: filesystem, base de datos, proveedores IA, scanner y servicios.
- Preload: API minima y validada mediante IPC.
- Renderer: UI, formularios, dashboard y visualizacion de datos.
- Shared: tipos, schemas Zod, constantes y errores.

El MVP 0.1 no ejecuta comandos ni modifica archivos del workspace importado.
