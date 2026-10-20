/**
 * 表达式 AST 节点定义。
 * 刻意保持扁平、可序列化（便于缓存与调试打印）。
 */
export type Node =
  | LiteralNode
  | IdentifierNode
  | MemberNode
  | UnaryNode
  | BinaryNode
  | LogicalNode
  | ConditionalNode
  | CallNode
  | ArrowNode
  | ArrayNode
  | ObjectNode

export interface LiteralNode {
  type: 'Literal'
  value: number | string | boolean | null | undefined
}

export interface IdentifierNode {
  type: 'Identifier'
  name: string
}

export interface MemberNode {
  type: 'Member'
  object: Node
  /** computed=false 时为 Identifier 形式的属性名 */
  property: Node
  computed: boolean
  /** 可选链 a?.b */
  optional: boolean
}

export interface UnaryNode {
  type: 'Unary'
  operator: '-' | '+' | '!'
  argument: Node
}

export interface BinaryNode {
  type: 'Binary'
  operator: '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '===' | '!==' | '<' | '<=' | '>' | '>='
  left: Node
  right: Node
}

export interface LogicalNode {
  type: 'Logical'
  operator: '&&' | '||' | '??'
  left: Node
  right: Node
}

export interface ConditionalNode {
  type: 'Conditional'
  test: Node
  consequent: Node
  alternate: Node
}

export interface CallNode {
  type: 'Call'
  callee: Node
  args: Node[]
  /** 可选调用 a?.() */
  optional: boolean
}

export interface ArrowNode {
  type: 'Arrow'
  params: string[]
  body: Node
}

export interface ArrayNode {
  type: 'Array'
  elements: Node[]
}

export interface ObjectNode {
  type: 'Object'
  properties: Array<{ key: string; value: Node }>
}

/** 二元运算的操作数：一元/箭头/三元需要补括号才不产生优先级歧义 */
function wrapOperand(n: Node): string {
  const s = toString(n)
  return n.type === 'Unary' || n.type === 'Arrow' || n.type === 'Conditional' ? `(${s})` : s
}

/** AST → 可读字符串（用于错误提示与设计器展示） */
export function toString(node: Node): string {
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' ? JSON.stringify(node.value) : String(node.value)
    case 'Identifier':
      return node.name
    case 'Member':
      return node.computed
        ? `${toString(node.object)}[${toString(node.property)}]`
        : `${toString(node.object)}${node.optional ? '?.' : '.'}${toString(node.property)}`
    case 'Unary':
      return `${node.operator}${toString(node.argument)}`
    case 'Binary':
      return `(${wrapOperand(node.left)} ${node.operator} ${wrapOperand(node.right)})`
    case 'Logical':
      return `(${wrapOperand(node.left)} ${node.operator} ${wrapOperand(node.right)})`
    case 'Conditional':
      return `(${toString(node.test)} ? ${toString(node.consequent)} : ${toString(node.alternate)})`
    case 'Call':
      return `${toString(node.callee)}(${node.args.map(toString).join(', ')})`
    case 'Arrow':
      return `(${node.params.join(', ')}) => ${toString(node.body)}`
    case 'Array':
      return `[${node.elements.map(toString).join(', ')}]`
    case 'Object':
      return `{ ${node.properties.map((p) => `${p.key}: ${toString(p.value)}`).join(', ')} }`
    default:
      return '?'
  }
}
