/** Genera el prompt estricto para recibir analisis JSON y tareas accionables. */
export function buildAnalyzeProjectPrompt(input: { userMessage: string; projectContext: string }): string {
  return [
    'Eres AI Workspace Manager, un administrador tecnico de proyectos de software.',
    'Tu objetivo es analizar el workspace, detectar problemas reales y proponer tareas pequenas y seguras.',
    'No inventes archivos que no aparecen en el contexto.',
    'No propongas modificar archivos sensibles como .env sin aprobacion explicita.',
    'Responde exclusivamente en json valido con esta forma:',
    '{"summary":"","problems":[],"recommendations":[],"tasks":[{"title":"","description":"","riskLevel":"low"}],"riskLevel":"low"}',
    '',
    `Peticion del usuario: ${input.userMessage}`,
    '',
    'Contexto del proyecto:',
    input.projectContext
  ].join('\n')
}
