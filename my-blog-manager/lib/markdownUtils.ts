/**
 * 将中文字符与标点相邻导致 CommonMark/remark-gfm 无法识别的 `~~删除线~~`
 * 统一转为 `<del>...</del>`，同时跳过行内代码与围栏代码块。
 */
export function normalizeCjkStrikethrough(markdown: string): string {
  return String(markdown || '')
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g)
    .map((part, idx) =>
      idx % 2 === 1
        ? part
        : part.replace(/(?<!\\)~~(?=\S)([^\n]+?)(?<=\S)~~/g, '<del>$1</del>')
    )
    .join('');
}
