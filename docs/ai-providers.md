# AI Providers

AI Workspace Manager v1.0.0 soporta de forma nativa los siguientes proveedores de IA líderes en el mercado, manteniendo una interfaz unificada:

- `validateConfig()`
- `testConnection()`
- `chat()`
- `streamChat()` (preparado)
- `getUsage()` (preparado)

## Proveedores Activos

La plataforma ha sido depurada para enfocarse únicamente en los modelos más capaces y seguros:

1. **OpenAI**
   - Modelos: `gpt-5.4-pro`, `gpt-5.4-flash`, `gpt-5.3-codex`
   - Autenticación: Bearer Token

2. **Anthropic Claude**
   - Modelos: `claude-4.6-sonnet`, `claude-4.6-opus`
   - Autenticación: `x-api-key` header

3. **DeepSeek**
   - Modelos: `deepseek-v4-pro`, `deepseek-v4-flash`
   - Autenticación: Bearer Token
   - Nota: Las claves se crean en `https://platform.deepseek.com`, pero la API es `https://api.deepseek.com`.

4. **Google Gemini**
   - Modelos: `gemini-3.0-flash`, `gemini-3.0-pro`
   - Autenticación: Parámetro en URL (`?key=`)

5. **OpenRouter**
   - Modelos: Soporta combinaciones de los anteriores mediante el enrutador (ej: `anthropic/claude-4.6-sonnet`, `openai/gpt-5.4-pro`).

## Seguridad

Las API Keys se guardan cifradas utilizando los mecanismos nativos del sistema operativo (`keytar` en entornos Desktop). En el Frontend, siempre se entrega una versión enmascarada del secreto (ej. `sk-****`). La comunicación se realiza exclusivamente a través del puente seguro IPC de Electron; el Renderer no tiene conexión a internet para peticiones a la IA, asegurando que las claves no salgan del Backend.

## Enrutamiento y Selección por Tarea

AI Workspace Manager puede configurar proveedores por defecto para tipos específicos de tareas:
- Análisis
- Generación de Código
- Refactorización
- Documentación
- Análisis de Errores (Bugs)
- Creación de Pruebas

Si una tarea específica no tiene un proveedor asignado, se utilizará el Proveedor por Defecto Global.

## Consumo de Tokens

La aplicación registra en su base de datos local SQLite el consumo exacto (o estimado, si el proveedor no entrega métricas completas) de los tokens de entrada y salida, multiplicándolo por una estimación en USD para dar previsibilidad a los costos de uso.
