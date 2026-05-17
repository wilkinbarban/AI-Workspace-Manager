# Workflows

## Importar proyecto

1. El usuario selecciona una carpeta.
2. Main valida que exista y sea directorio.
3. Se crea o actualiza el registro del proyecto en SQLite.
4. El usuario ejecuta el scanner y ve el dashboard.

## Analisis IA

1. El scanner genera contexto compacto.
2. El usuario puede elegir proveedor y tipo de tarea.
3. El router elige IA manual, por tarea o predeterminada.
4. El orquestador construye el prompt.
5. El proveedor devuelve problemas, recomendaciones y tareas sugeridas.
6. El Task Engine guarda tareas en estado `pending`.
7. La memoria registra el analisis.
8. El tracker registra tokens y costo estimado cuando es posible.

## Memoria

La memoria guarda decisiones, hallazgos y eventos relevantes por proyecto para
que futuras sesiones partan de contexto persistente.

## Asistente inicial IA

1. La app comprueba si hay algun proveedor habilitado.
2. Si no existe, muestra un asistente visual.
3. El usuario elige proveedor, pega API Key o configura URL local.
4. Puede probar conexion desde Configuracion.
5. La clave se guarda usando el almacen seguro del sistema.
