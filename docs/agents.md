# Agents

Los agentes internos son perfiles de prompt, no modelos separados.

- Architecture Agent: estructura, modularidad y mantenibilidad.
- Documentation Agent: README, INSTALL, ROADMAP y CHANGELOG.
- Security Agent: secretos, archivos sensibles y comandos peligrosos.
- Dependency Agent: dependencias, lockfiles y riesgos de stack.
- Task Agent: convierte recomendaciones en tareas pequenas y revisables.

En el MVP 0.1 se implementa un orquestador general con salida JSON normalizada.

## Multi-provider base

Cada agente puede recibir un proveedor IA especifico mediante `providerId` y un
tipo de tarea. La seleccion sigue este orden:

1. proveedor elegido manualmente;
2. proveedor asignado al tipo de tarea;
3. proveedor predeterminado global;
4. primer proveedor habilitado.

Agentes que puedan ejecutar cambios quedan marcados con `requiresConfirmation`.
