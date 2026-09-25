import { clock, duration } from '../lib/format.js';
import { SeverityTag, ServiceChip } from '../components/Tags.jsx';
import styles from './AlertsTable.module.css';

export function AlertsTable({ alerts, now }) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Alert</th>
            <th scope="col">Service</th>
            <th scope="col">Severity</th>
            <th scope="col">State</th>
            <th scope="col">Fired</th>
            <th scope="col">For</th>
            <th scope="col">Summary</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => {
            const end = alert.endsAt ? new Date(alert.endsAt) : now;
            return (
              <tr key={alert.id}>
                <td className="mono">{alert.name}</td>
                <td>
                  <ServiceChip service={alert.service} />
                </td>
                <td>
                  <SeverityTag severity={alert.severity} />
                </td>
                <td className={styles.state} data-state={alert.status}>
                  {alert.status}
                </td>
                <td className="mono numeric">{clock(alert.startsAt)}</td>
                <td className="mono numeric">{duration(end - new Date(alert.startsAt))}</td>
                <td className={styles.summary}>{alert.summary}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
