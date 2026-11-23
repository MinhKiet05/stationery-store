export default function StatCard({ label, value, description, icon: Icon, tone = 'blue' }) {
  return <article className={`dashboard-stat dashboard-stat-${tone}`}>
    <div className="dashboard-stat-top"><h2>{label}</h2><span className={`dashboard-icon-tile tone-${tone}`}><Icon size={21} aria-hidden="true" /></span></div>
    <p className="dashboard-stat-value">{value}</p><p className="dashboard-stat-description">{description}</p>
  </article>;
}
