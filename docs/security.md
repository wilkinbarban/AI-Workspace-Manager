# Security

Reglas del MVP:

- No exponer `fs` ni `child_process` al renderer.
- No modificar archivos del workspace importado.
- No enviar `.env` ni archivos sensibles al proveedor IA.
- Guardar claves con `keytar` cuando este disponible.
- Usar `.env` solo como fallback local de desarrollo.
- Validar payloads IPC con Zod.
- No mostrar claves completas despues de guardarlas; solo `sk-****abcd`.
- No registrar claves ni enviarlas a proveedores IA.

Comandos destructivos, terminal integrada y cambios automatizados quedan fuera
del MVP 0.1.
