import { categoryIcon } from '../categorize'
import type { Category } from '../types'

/** A small colored tag showing a category's icon (if recognized), dot, and name. */
export default function CategoryTag({ category }: { category: Category }) {
  const icon = categoryIcon(category.name)
  return (
    <span className="tag" style={{ background: `${category.color}22`, color: category.color }}>
      {icon ? <span aria-hidden="true">{icon}</span> : <span className="dot" style={{ background: category.color }} />}
      {category.name}
    </span>
  )
}
