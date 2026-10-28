import { notificationDescription, formatActivityTime, resolveNotificationTarget } from './notificationPresentation';
import './notification-inbox.css';

export default function NotificationInbox({ notifications, projects, onOpen, onMarkAllRead, busy }) {
  const unread = notifications.filter(item => !item.read_at).length;
  return <section className="notificationInbox" role="dialog" aria-label="Notifications">
    <header><div><h2>Notifications</h2><p>{unread ? `${unread} unread` : 'You’re all caught up'}</p></div></header>
    {unread > 0 && <div className="notificationInboxAction"><button type="button" disabled={busy} onClick={onMarkAllRead}>Mark all as read</button></div>}
    {notifications.length === 0 ? <div className="notificationInboxEmpty"><strong>You’re all caught up</strong><span>New project and issue updates will appear here.</span></div> :
      <ul>{notifications.map(item => {
        const target = resolveNotificationTarget(item,projects);
        const project = target?.project;
        const issue = target?.issue;
        const linked = Boolean(project);
        const Content = <><span className={`notificationInboxDot ${item.read_at ? 'read' : 'unread'}`} aria-hidden="true"/><span className="notificationInboxCopy"><strong>{item.title || 'Workspace update'}</strong><span>{notificationDescription(item,target)}</span>{project && <span className="notificationInboxProject">{project.name}{issue ? ` · Issue #${issue.issue_number}` : ''}</span>}<time dateTime={item.created_at}>{formatActivityTime(item.created_at)}</time></span><span className={`notificationInboxState ${item.read_at ? 'read' : 'unread'}`}>{item.read_at ? 'Read' : 'Unread'}</span></>;
        return <li key={item.id} className={!item.read_at ? 'unread' : ''}>{linked ? <button type="button" className="notificationInboxItem" onClick={() => onOpen(project, issue)}>{Content}</button> : <div className="notificationInboxItem">{Content}</div>}</li>;
      })}</ul>}
  </section>;
}
