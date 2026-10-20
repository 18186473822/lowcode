/** 表达式引擎统一错误。 */

export type ExpressionErrorCode =
  | 'E_EXPR_SYNTAX'      // 词法/语法错误
  | 'E_EXPR_SECURITY'    // 触发安全护栏（原型链、禁用标识符）
  | 'E_EXPR_UNKNOWN_FN'  // 调用了白名单外的函数/方法
  | 'E_EXPR_EVAL'        // 求值期错误

export class ExpressionError extends Error {
  constructor(
    message: string,
    public readonly code: ExpressionErrorCode,
    /** 出错位置（字符下标），-1 表示未知 */
    public readonly pos: number = -1,
    /** 原始表达式 */
    public readonly expr?: string,
  ) {
    super(message)
    this.name = 'ExpressionError'
  }

  /** 人类可读的定位信息，如 "第 12 列" */
  get location(): string {
    return this.pos >= 0 ? `第 ${this.pos + 1} 列` : '未知位置'
  }
}

export function syntaxError(msg: string, pos: number, expr?: string): ExpressionError {
  return new ExpressionError(`${msg}（${pos + 1} 列）`, 'E_EXPR_SYNTAX', pos, expr)
}
