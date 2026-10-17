import { Link } from 'react-router';
import styles from './Button.module.css';

// One look for every button in the console. The variant says how much a button asks for:
// primary for the one thing a screen wants from you, secondary for the rest, ghost for
// quiet tools, danger for the moment a change reaches the cluster.
export function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={`${styles.button} ${className}`}
      data-variant={variant}
      data-size={size}
      {...props}
    />
  );
}

export function ButtonLink({ variant = 'secondary', size = 'md', className = '', ...props }) {
  return <Link className={`${styles.button} ${className}`} data-variant={variant} data-size={size} {...props} />;
}
