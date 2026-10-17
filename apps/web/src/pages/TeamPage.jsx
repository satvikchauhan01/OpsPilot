import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useCreateUser, useRemoveUser, useSetRole, useUsers } from '../lib/queries.js';
import { dateTime, plural } from '../lib/format.js';
import { useConsole } from '../layout/ConsoleContext.js';
import { Button } from '../components/Button.jsx';
import { Field } from '../components/Field.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Panel } from '../components/Panel.jsx';
import { Empty, QueryState } from '../components/States.jsx';
import { PlusIcon } from '../components/Icons.jsx';
import styles from './TeamPage.module.css';

const ROLES = [
  { role: 'viewer', label: 'Viewer', can: 'Reads everything: incidents, investigations, runbooks, the audit log.' },
  {
    role: 'responder',
    label: 'Responder',
    can: 'Also approves and rejects fixes, changes incident status, edits postmortems and resets the demo.',
  },
  { role: 'admin', label: 'Admin', can: 'Also adds people, changes their roles and removes them.' },
];

export function TeamPage() {
  const { user } = useAuth();
  const users = useUsers();
  const [adding, setAdding] = useState(false);

  if (user.role !== 'admin') {
    return (
      <div className={styles.page}>
        <PageHeader kicker="Govern" title="Team" />
        <Panel title="Admins only">
          <Empty title="Only an admin can manage the team">Ask an admin if your role should change.</Empty>
        </Panel>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        kicker="Govern"
        title="Team"
        lede="Who can sign in, and what each of them may do. A change reaches sessions that are already open within seconds, and every change is written to the audit log."
        actions={
          !adding && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <PlusIcon /> Add a person
            </Button>
          )
        }
      />

      <ul className={styles.roles}>
        {ROLES.map((entry) => (
          <li key={entry.role}>
            <span className={styles.roleName}>{entry.label}</span>
            <span className={styles.roleCan}>{entry.can}</span>
          </li>
        ))}
      </ul>

      {adding && <AddMember onDone={() => setAdding(false)} />}

      <Panel title="People" meta={users.data && plural(users.data.length, 'account')} flush>
        <QueryState query={users} loadingLabel="Loading the team">
          {(list) => <Members list={list} me={user} />}
        </QueryState>
      </Panel>
      <p className={styles.note}>
        Guests are not accounts: in demo mode anyone can start a two-hour guest session, which can start scenarios and
        approve fixes on the demo shop, and nothing else.
      </p>
    </div>
  );
}

function Members({ list, me }) {
  const setRole = useSetRole();
  const remove = useRemoveUser();
  const { toast } = useConsole();
  const [confirming, setConfirming] = useState(null);
  const admins = list.filter((member) => member.role === 'admin').length;

  function changeRole(member, role) {
    setRole.mutate(
      { id: member.id, role },
      {
        onSuccess: () => toast({ tone: 'ok', title: `${member.name} is now ${article(role)} ${role}` }),
        onError: (error) => toast({ tone: 'critical', title: 'Role not changed', detail: error.message }),
      },
    );
  }

  function removeMember(member) {
    remove.mutate(member.id, {
      onSuccess: () =>
        toast({ tone: 'ok', title: `${member.name} removed`, detail: 'Their sessions stop working within seconds.' }),
      onError: (error) => toast({ tone: 'critical', title: 'Not removed', detail: error.message }),
      onSettled: () => setConfirming(null),
    });
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Email</th>
          <th scope="col">Role</th>
          <th scope="col">Joined</th>
          <th scope="col">
            <span className="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {list.map((member) => {
          const self = member.id === me.id;
          const lastAdmin = member.role === 'admin' && admins <= 1;
          const locked = self || lastAdmin;
          const keepAdmin = lastAdmin ? 'The team needs at least one admin' : undefined;
          const roleLock = self ? 'You cannot change your own role' : keepAdmin;
          const removeLock = self ? 'You cannot remove yourself' : keepAdmin;
          return (
            <tr key={member.id}>
              <th scope="row">
                <span className={styles.name}>{member.name}</span>
                {self && <span className={styles.you}>you</span>}
              </th>
              <td className={styles.email}>{member.email}</td>
              <td>
                <select
                  className={styles.role}
                  value={member.role}
                  disabled={locked || setRole.isPending}
                  title={roleLock}
                  aria-label={`Role of ${member.name}`}
                  onChange={(event) => changeRole(member, event.target.value)}
                >
                  {ROLES.map((entry) => (
                    <option key={entry.role} value={entry.role}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className={styles.joined}>{dateTime(member.createdAt)}</td>
              <td className={styles.actions}>
                {confirming === member.id ? (
                  <span className={styles.confirm}>
                    Remove {member.name}?
                    <Button size="sm" variant="danger" disabled={remove.isPending} onClick={() => removeMember(member)}>
                      Remove
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      Keep
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={locked}
                    title={removeLock}
                    onClick={() => setConfirming(member.id)}
                  >
                    Remove
                  </Button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AddMember({ onDone }) {
  const create = useCreateUser();
  const { toast } = useConsole();
  const [password, setPassword] = useState('');

  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const member = {
      name: form.get('name'),
      email: form.get('email'),
      role: form.get('role'),
      password,
    };
    create.mutate(member, {
      onSuccess: (created) => {
        toast({
          tone: 'ok',
          title: `${created.name} added as ${article(created.role)} ${created.role}`,
          detail: 'Give them their password privately. It is not shown again.',
        });
        onDone();
      },
    });
  }

  return (
    <Panel title="Add a person">
      <form className={styles.form} onSubmit={submit}>
        <Field label="Name">
          <input name="name" required maxLength={80} autoFocus autoComplete="off" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" required autoComplete="off" />
        </Field>
        <Field label="Role">
          <select name="role" defaultValue="viewer">
            {ROLES.map((entry) => (
              <option key={entry.role} value={entry.role}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="First password" hint="At least 10 characters." grow>
          <span className={styles.password}>
            <input
              name="password"
              type="text"
              required
              minLength={10}
              maxLength={200}
              autoComplete="new-password"
              spellCheck={false}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button size="sm" onClick={() => setPassword(randomPassword())}>
              Generate
            </Button>
          </span>
        </Field>
        <div className={styles.formButtons}>
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending ? 'Adding…' : 'Add'}
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
        {create.error && (
          <p className={styles.error} role="alert">
            {create.error.message}
          </p>
        )}
      </form>
    </Panel>
  );
}

// 18 characters from an alphabet without look-alikes (no 0/O, 1/l/I), read aloud easily.
function randomPassword() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function article(role) {
  return role === 'admin' ? 'an' : 'a';
}
