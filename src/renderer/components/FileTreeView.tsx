import type { FileTreeNode } from '@shared/types/workspace'

interface FileTreeViewProps {
  nodes: FileTreeNode[]
  depth?: number
}

export function FileTreeView({ nodes, depth = 0 }: FileTreeViewProps) {
  return (
    <div className={depth === 0 ? 'space-y-1' : 'tree-indent space-y-1'}>
      {nodes.map((node) => (
        <div key={node.relativePath}>
          <div className="tree-row">
            <span className="w-10 shrink-0 muted">{node.kind === 'directory' ? 'dir' : 'file'}</span>
            <span className="truncate" title={node.relativePath}>
              {node.name}
            </span>
          </div>
          {node.children && node.children.length > 0 ? <FileTreeView nodes={node.children} depth={depth + 1} /> : null}
        </div>
      ))}
    </div>
  )
}
