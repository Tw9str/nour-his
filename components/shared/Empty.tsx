import { Icon, type IconName } from './Icons';
export function Empty({
  title,
  detail,
  icon = 'patients',
}: {
  title: string;
  detail: string;
  icon?: IconName;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={32} />
      </div>
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
