export default function ParentIntro({ eyebrow, title, children }) {
  return <div className="parent-intro"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{children && <p>{children}</p>}</div>
}
