# Plan 0: AI Workspace Manager (Core Agéntico)

## 1. Misión del Proyecto
Transformar la aplicación de un simple "escáner estático" a un **Compañero Agéntico Real**. El objetivo es ahorrar tiempo y carga mental al desarrollador, ofreciendo contexto inteligente, detectando áreas de mejora reales (no reglas rígidas tontas), y proporcionando **Agentes Autónomos** capaces de ejecutar las tareas sugeridas de forma segura.

## 2. Nueva Interfaz: Flujo de Asistente (Wizard Flow)
Para evitar la sobrecarga cognitiva de una lista interminable (scroll largo), el **Dashboard** se transformará en un flujo paso a paso, con transiciones suaves, permitiendo avanzar o retroceder:

1. **Paso 1: Selección de Proyecto.** (Abrir carpeta).
2. **Paso 2: Descubrimiento de Contexto.** La IA analiza el código y deduce qué tipo de proyecto es, configurando sus propios criterios (ej. *si es un script simple, no exigirá Docker*).
3. **Paso 3: Panel de Diagnóstico y Tareas.** Se listan los bugs, deudas técnicas, falta de modularidad y mejoras en documentación.
4. **Paso 4: Ejecución Agéntica.** El desarrollador hace clic en "Ejecutar" sobre una tarea. La interfaz cambia a un **Monitor en Tiempo Real** donde se ve al Agente "pensando", analizando archivos y usando herramientas.
5. **Paso 5: Revisión (Historial / Diff Visual).** Una nueva sección donde el usuario aprueba o rechaza los cambios realizados por el agente, visualizando el código eliminado en rojo y el añadido en verde.

## 3. Seguridad y Autonomía (Safe-Guards)
El principio fundamental es que **la IA no rompe el proyecto del usuario de forma irreversible**:
- **Proyectos con Git:** El agente creará automáticamente una rama separada para sus cambios.
- **Proyectos Locales sin Git:** El agente guardará copias de respaldo con la extensión `*.original` antes de modificar cualquier archivo.
- **Aprobación:** Nada se fusiona a la rama principal (o se considera final) sin pasar por el panel de "Revisión / Historial".

## 4. Inteligencia Artificial y Modelos
- Solo se soportarán modelos con capacidades **Agénticas (Tool/Function Calling)**: *DeepSeek v4 Pro, Claude 3.5 Sonnet, GPT-4o, Gemini 1.5/2.0*, etc.
- Esto asegura que el modelo no solo "hable", sino que pueda invocar acciones reales en el sistema operativo.

## 5. Sistema de Skills (Herramientas Nativas)
El Workspace Manager vendrá precargado con habilidades nativas para que el agente pueda trabajar. Algunas de las "Skills" iniciales serán:
- `readFile`: Leer el contenido de un archivo.
- `writeFile`: Modificar o crear un archivo de forma precisa.
- `listDir`: Explorar carpetas.
- `runTerminalCommand`: Ejecutar comandos seguros (ej. `npm run test`, `tsc --noEmit`) para validar si su propio código funciona.
- `gitOperations`: Manejo de ramas y commits.

---
*Este documento marca el inicio del desarrollo arquitectónico. El código del sistema IPC, el Renderer de React y el Backend en Electron se adaptarán para cumplir estrictamente con este flujo.*
