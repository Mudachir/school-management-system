export default function AdminHeader({ title }) {
  return (
    <header className="admin-header">
      <div className="admin-header-inner">
        <div className="header-heading">
          <p className="eyebrow">Admin workspace</p>
          <h1 aria-live="polite">{title}</h1>
          <p className="header-welcome">Welcome, Administrator</p>
        </div>
        <div className="header-profile" aria-label="Admin profile visual placeholder">
          <span className="profile-initials" aria-hidden="true">AD</span>
          <div className="profile-copy">
            <p>Administrator</p>
            <p className="profile-role">School admin</p>
          </div>
        </div>
      </div>
    </header>
  )
}
