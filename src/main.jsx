import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Clock3,
  Coffee,
  History,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  LogOut,
  Eye,
  EyeOff,
  Menu,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Timer,
  Trash2,
  UserCircle2,
  UserRoundCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { supabase, supabaseConfig } from './supabaseClient'
import './style.css'

const PK = 'Asia/Karachi'
const MAIN_ADMIN_EMAIL = 'admin@yaafu.com'
const now = () => new Date()
const dateFmt = (date) => new Intl.DateTimeFormat('en-PK', {
  timeZone: PK,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
}).format(date)
const timeFmt = (date) => new Intl.DateTimeFormat('en-PK', {
  timeZone: PK,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
}).format(date)
const todayDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: PK }).format(now())
const todayYM = () => todayDate().slice(0, 7)
const workDateFmt = (value) => dateFmt(new Date(`${value}T00:00:00+05:00`))

function durationMs(start, end = now()) {
  return Math.max(0, new Date(end).getTime() - new Date(start).getTime())
}

function durationFmt(start, end = now(), includeSeconds = false) {
  const totalSeconds = Math.floor(durationMs(start, end) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const base = `${hours}h ${String(minutes).padStart(2, '0')}m`
  return includeSeconds ? `${base} ${String(seconds).padStart(2, '0')}s` : base
}

function millisecondsFmt(milliseconds, includeSeconds = false) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const base = `${hours}h ${String(minutes).padStart(2, '0')}m`
  return includeSeconds ? `${base} ${String(seconds).padStart(2, '0')}s` : base
}

function recordDuration(record, activeNow = now()) {
  return durationMs(record.check_in, record.check_out || activeNow)
}

function sortSessions(records) {
  return [...records].sort((a, b) => new Date(a.check_in) - new Date(b.check_in))
}

function useCurrentTime(intervalMs = 1000) {
  const [time, setTime] = useState(now())
  useEffect(() => {
    const interval = window.setInterval(() => setTime(now()), intervalMs)
    return () => window.clearInterval(interval)
  }, [intervalMs])
  return time
}

async function getFunctionError(error) {
  if (!error) return 'Something went wrong.'
  try {
    if (error.context?.json) {
      const body = await error.context.json()
      return body?.error || body?.message || error.message
    }
  } catch (_) {}
  return error.message || 'Something went wrong.'
}

function friendlyAuthError(error) {
  const message = error?.message || 'Unable to sign in right now.'
  if (/invalid login credentials/i.test(message)) return 'The email or password is incorrect.'
  if (/failed to fetch|network|fetch/i.test(message)) return 'Cannot reach the secure server. Check your connection and try again.'
  return message
}

function App() {
  const [authSession, setAuthSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [users, setUsers] = useState([])
  const [records, setRecords] = useState([])
  const [leaves, setLeaves] = useState([])
  const [page, setPage] = useState('dashboard')
  const [booting, setBooting] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [actionBusy, setActionBusy] = useState('')
  const [fatalError, setFatalError] = useState('')
  const [toast, setToast] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 3400)
  }, [])

  const loadWorkspace = useCallback(async (activeProfile, silent = false) => {
    if (!activeProfile) return
    if (!silent) setSyncing(true)

    try {
      const [profilesResult, attendanceResult, leaveResult] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, role, active, created_at').order('created_at', { ascending: true }),
        supabase.from('attendance').select('*').order('work_date', { ascending: false }).order('check_in', { ascending: false }),
        supabase.from('leave_requests').select('*').order('created_at', { ascending: false }),
      ])

      if (profilesResult.error) throw profilesResult.error
      if (attendanceResult.error) throw attendanceResult.error
      if (leaveResult.error) throw leaveResult.error

      setUsers(profilesResult.data || [])
      setRecords(attendanceResult.data || [])
      setLeaves(leaveResult.data || [])
    } catch (error) {
      if (!silent) notify(error.message || 'Unable to load workspace.', 'error')
    } finally {
      if (!silent) setSyncing(false)
    }
  }, [notify])

  useEffect(() => {
    let mounted = true

    async function restoreSession() {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (!mounted) return
        if (error) throw error
        setAuthSession(data.session || null)
      } catch (error) {
        if (mounted) {
          setAuthSession(null)
          setFatalError(friendlyAuthError(error))
        }
      } finally {
        if (mounted) setBooting(false)
      }
    }

    restoreSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session || null)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadSignedInUser() {
      if (!authSession?.user) {
        setProfile(null)
        setUsers([])
        setRecords([])
        setLeaves([])
        setBooting(false)
        return
      }

      setBooting(true)
      setFatalError('')

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, active, created_at')
        .eq('id', authSession.user.id)
        .single()

      if (cancelled) return

      if (error || !data) {
        setFatalError(error?.message || 'Your profile could not be loaded.')
        await supabase.auth.signOut({ scope: 'local' })
        setBooting(false)
        return
      }

      if (!data.active) {
        await supabase.auth.signOut({ scope: 'local' })
        notify('Your account is inactive. Contact an administrator.', 'error')
        setBooting(false)
        return
      }

      setProfile(data)
      await loadWorkspace(data)
      if (!cancelled) setBooting(false)
    }

    loadSignedInUser()
    return () => { cancelled = true }
  }, [authSession?.user?.id, loadWorkspace, notify])

  useEffect(() => {
    if (!profile) return undefined
    const refresh = () => loadWorkspace(profile, true)
    const timer = window.setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [profile, loadWorkspace])

  const today = todayDate()
  const mine = useMemo(
    () => records.filter((record) => record.user_id === profile?.id),
    [records, profile?.id],
  )
  const current = mine.find((record) => !record.check_out) || null
  const shiftRecords = useMemo(
    () => sortSessions(mine.filter((record) => record.work_date === (current?.work_date || today))),
    [mine, current?.work_date, today],
  )

  const doCheck = async (action) => {
    if (!profile || actionBusy) return
    setActionBusy('attendance')
    try {
      const { error } = await supabase.functions.invoke('attendance-action', {
        body: { action },
      })
      if (error) throw new Error(await getFunctionError(error))
      await loadWorkspace(profile, true)
      notify(action === 'check_in' ? 'Check-in saved successfully.' : 'Check-out saved successfully.')
    } catch (error) {
      notify(error.message || 'Attendance could not be saved.', 'error')
    } finally {
      setActionBusy('')
    }
  }

  const submitLeave = async (form) => {
    const minimumDate = todayDate()
    if (form.from < minimumDate) {
      notify('Leave start date cannot be in the past.', 'error')
      return false
    }
    if (form.to < form.from) {
      notify('Leave end date cannot be before the start date.', 'error')
      return false
    }

    setActionBusy('leave')
    try {
      const { error } = await supabase.from('leave_requests').insert({
        user_id: profile.id,
        leave_type: form.type,
        from_date: form.from,
        to_date: form.to,
        reason: form.reason.trim(),
      })
      if (error) throw error
      await loadWorkspace(profile, true)
      notify('Leave request submitted.')
      return true
    } catch (error) {
      notify(error.message || 'Leave request could not be submitted.', 'error')
      return false
    } finally {
      setActionBusy('')
    }
  }

  const updateLeave = async (id, status) => {
    setActionBusy(`leave-${id}`)
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status,
          reviewed_by: profile.id,
          reviewed_at: now().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
      await loadWorkspace(profile, true)
      notify(`Leave request ${status}.`)
    } catch (error) {
      notify(error.message || 'Leave request could not be updated.', 'error')
    } finally {
      setActionBusy('')
    }
  }

  const createUser = async (form) => {
    setActionBusy('create-user')
    try {
      const { error } = await supabase.functions.invoke('create-user', {
        body: {
          full_name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
        },
      })
      if (error) throw new Error(await getFunctionError(error))
      await loadWorkspace(profile, true)
      notify('Employee created and saved securely.')
      return true
    } catch (error) {
      notify(error.message || 'Employee could not be created.', 'error')
      return false
    } finally {
      setActionBusy('')
    }
  }

  const toggleUser = async (user) => {
    if (user.id === profile.id || user.role === 'admin') {
      notify('The main administrator account cannot be changed.', 'error')
      return
    }
    setActionBusy(`user-${user.id}`)
    try {
      const { error } = await supabase.functions.invoke('set-user-status', {
        body: { user_id: user.id, active: !user.active },
      })
      if (error) throw new Error(await getFunctionError(error))
      await loadWorkspace(profile, true)
      notify(user.active ? 'Employee deactivated.' : 'Employee activated.')
    } catch (error) {
      notify(error.message || 'Employee status could not be updated.', 'error')
    } finally {
      setActionBusy('')
    }
  }

  const deleteUser = async (user) => {
    if (user.id === profile.id || user.role === 'admin') {
      notify('The main administrator cannot be deleted.', 'error')
      return false
    }
    setActionBusy(`delete-${user.id}`)
    try {
      const { error } = await supabase.functions.invoke('delete-user', {
        body: { user_id: user.id },
      })
      if (error) throw new Error(await getFunctionError(error))
      await loadWorkspace(profile, true)
      notify('Employee deleted permanently.')
      return true
    } catch (error) {
      notify(error.message || 'Employee could not be deleted.', 'error')
      return false
    } finally {
      setActionBusy('')
    }
  }

  const clearAttendanceDay = async (userId, workDate) => {
    if (profile.role !== 'admin') return false
    setActionBusy(`clear-${userId}-${workDate}`)
    try {
      const { error } = await supabase.functions.invoke('attendance-action', {
        body: { action: 'clear_day', user_id: userId, work_date: workDate },
      })
      if (error) throw new Error(await getFunctionError(error))
      await loadWorkspace(profile, true)
      notify(`Shift starting ${workDateFmt(workDate)} cleared.`)
      return true
    } catch (error) {
      notify(error.message || 'Attendance could not be cleared.', 'error')
      return false
    } finally {
      setActionBusy('')
    }
  }

  if (booting) return <LoadingScreen />
  if (!authSession || !profile) return <AuthScreen fatalError={fatalError} notify={notify} />

  const nav = [
    ['dashboard', 'Dashboard', LayoutDashboard],
    ['timesheet', 'My Timesheet', Clock3],
    ['leave', 'Leave', ClipboardList],
    ...(profile.role === 'admin' ? [
      ['users', 'Users', Users],
      ['reports', 'Reports', CalendarDays],
    ] : []),
  ]

  return (
    <div className="app">
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      {menuOpen && <button className="mobile-overlay" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
      <aside className={menuOpen ? 'open' : ''}>
        <div className="sidebrand">
          <img src="/logo.svg" alt="YAAFU Enterprises" />
          <div><b>YAAFU</b><span>ENTERPRISES</span></div>
        </div>
        <nav aria-label="Main navigation">
          {nav.map(([id, title, Icon]) => (
            <button
              key={id}
              className={page === id ? 'active' : ''}
              onClick={() => { setPage(id); setMenuOpen(false) }}
            >
              <Icon size={18} />{title}
            </button>
          ))}
        </nav>
        <div className="spacer" />
        <button onClick={() => supabase.auth.signOut({ scope: 'local' })}><LogOut size={18} />Logout</button>
      </aside>

      <main>
        <header>
          <button className="icon menu-button" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu /></button>
          <div className="header-label"><span>YAAFU Workspace</span><small>Pakistan Standard Time</small></div>
          <div className="system-status"><span />Secure connection</div>
          <button className="refresh" onClick={() => loadWorkspace(profile)} disabled={syncing}>
            <RefreshCw size={16} className={syncing ? 'spin' : ''} />
            <span>Sync</span>
          </button>
          <div className="profile">
            <UserCircle2 />
            <span>{profile.full_name}<small>{profile.role === 'admin' ? 'Main administrator' : 'Employee'}</small></span>
          </div>
        </header>

        <section className="content">
          {page === 'dashboard' && (
            <Dashboard
              session={profile}
              current={current}
              shiftRecords={shiftRecords}
              doCheck={doCheck}
              mine={mine}
              leaves={leaves}
              busy={actionBusy === 'attendance'}
            />
          )}
          {page === 'timesheet' && <Timesheet records={mine} users={users} />}
          {page === 'leave' && (
            <Leave
              session={profile}
              users={users}
              leaves={leaves}
              onSubmit={submitLeave}
              onUpdate={updateLeave}
              busy={actionBusy}
            />
          )}
          {page === 'users' && profile.role === 'admin' && (
            <UserAdmin
              currentUser={profile}
              users={users}
              onCreate={createUser}
              onToggle={toggleUser}
              onDelete={deleteUser}
              busy={actionBusy}
            />
          )}
          {page === 'reports' && profile.role === 'admin' && (
            <Reports
              records={records}
              users={users}
              onClearAttendance={clearAttendanceDay}
              busy={actionBusy}
            />
          )}
        </section>
      </main>
    </div>
  )
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    console.error('YAAFU workspace failed to render', error, info)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div className="system-page">
        <div className="system-card">
          <div className="system-logo"><img src="/logo.svg" alt="YAAFU Enterprises" /></div>
          <div className="system-icon danger"><AlertTriangle /></div>
          <span className="eyebrow">APPLICATION ERROR</span>
          <h1>The workspace could not open</h1>
          <p>An unexpected browser error stopped the application. Reload the page to start a clean session.</p>
          <button className="system-primary" onClick={() => window.location.reload()}><RefreshCw />Reload workspace</button>
        </div>
      </div>
    )
  }
}

function ConfigurationScreen() {
  const details = supabaseConfig.missingVariables.length
    ? `Missing: ${supabaseConfig.missingVariables.join(', ')}`
    : supabaseConfig.error

  return (
    <div className="system-page configuration-page">
      <div className="system-card configuration-card">
        <div className="system-logo"><img src="/logo.svg" alt="YAAFU Enterprises" /></div>
        <div className="system-icon"><ShieldCheck /></div>
        <span className="eyebrow">DEPLOYMENT SETUP REQUIRED</span>
        <h1>Connect this deployment to Supabase</h1>
        <p>The website built correctly, but it needs two public Supabase variables before the secure login can load.</p>
        <div className="config-variables">
          <code>VITE_SUPABASE_URL</code>
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
        </div>
        <div className="config-alert"><AlertTriangle />{details || 'The Supabase configuration is invalid.'}</div>
        <ol className="config-steps">
          <li>Open the Vercel project and go to <b>Settings → Environment Variables</b>.</li>
          <li>Add both variables for <b>Production</b> and <b>Preview</b>.</li>
          <li>Open <b>Deployments</b> and redeploy the latest commit.</li>
        </ol>
        <div className="system-actions">
          <a className="system-primary" href="https://vercel.com/dashboard" target="_blank" rel="noreferrer">Open Vercel dashboard <ChevronRight /></a>
          <a className="system-secondary" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Open Supabase</a>
        </div>
        <small>Use a publishable key only. Never place a secret or service-role key in this frontend.</small>
      </div>
    </div>
  )
}


function PasswordInput({ id, value, onChange, autoComplete, placeholder, minLength, required = true }) {
  const [visible, setVisible] = useState(false)
  const label = visible ? 'Hide password' : 'Show password'

  return (
    <div className="password-field">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((current) => !current)}
        aria-label={label}
        title={label}
      >
        {visible ? <EyeOff size={19} /> : <Eye size={19} />}
      </button>
    </div>
  )
}

function AuthScreen({ fatalError }) {
  const [login, setLogin] = useState({ email: MAIN_ADMIN_EMAIL, password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(fatalError || '')

  useEffect(() => setError(fatalError || ''), [fatalError])

  const signIn = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: login.email.trim().toLowerCase(),
        password: login.password,
      })
      if (signInError) throw signInError
    } catch (signInError) {
      setError(friendlyAuthError(signInError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className="brand-panel">
          <img src="/logo.svg" alt="YAAFU Enterprises" />
          <div className="brand-kicker">SECURE WORKFORCE CRM</div>
          <h1>Work smarter.<br />Stay accountable.</h1>
          <p>Attendance, timesheets, employee management and leave approvals in one secure workspace.</p>
          <div className="brand-points">
            <span><Clock3 />Live attendance tracking</span>
            <span><Users />Secure employee management</span>
            <span><ShieldCheck />Protected by role-based access</span>
          </div>
          <div className="tz"><Clock3 size={17} />Pakistan Standard Time · Asia/Karachi</div>
        </div>

        <form className="login-card" onSubmit={signIn}>
          <div className="portal-badge"><span />Employee portal</div>
          <div className="login-icon"><LockKeyhole /></div>
          <h2>Welcome back</h2>
          <p>Use your approved YAAFU account to continue.</p>
          <label htmlFor="login-email">Email address</label>
          <input id="login-email" type="email" required autoComplete="email" value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} />
          <label htmlFor="login-password">Password</label>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            value={login.password}
            onChange={(event) => setLogin({ ...login, password: event.target.value })}
          />
          {error && <div className="error">{error}</div>}
          <button disabled={busy}>{busy ? <><LoaderCircle className="spin" />Signing in...</> : 'Login securely'}</button>
          <div className="login-trust"><ShieldCheck />Your session is encrypted and access-controlled.</div>
        </form>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return <div className="loading-screen"><img src="/logo.svg" alt="YAAFU" /><LoaderCircle className="spin" /><b>Loading secure workspace...</b><span>Restoring your protected session</span></div>
}

function Dashboard({ session, current, shiftRecords, doCheck, mine, leaves, busy }) {
  const time = useCurrentTime()
  const [pendingAction, setPendingAction] = useState(null)
  const shiftActiveMs = shiftRecords.reduce((sum, record) => sum + recordDuration(record, time), 0)
  const durationValue = shiftRecords.length ? millisecondsFmt(shiftActiveMs, Boolean(current)) : '—'
  const statusValue = current ? 'Checked in' : shiftRecords.length ? 'Checked out' : 'Not checked in'
  const nextAction = current ? 'check_out' : 'check_in'
  const lastSession = shiftRecords[shiftRecords.length - 1] || null

  const confirmAttendance = async () => {
    const action = pendingAction
    setPendingAction(null)
    if (action) await doCheck(action)
  }

  return (
    <>
      <div className="title">
        <div><span className="eyebrow">OVERVIEW</span><h1>Good day, {session.full_name.split(' ')[0]}</h1><p>{dateFmt(time)} · Pakistan Standard Time</p></div>
      </div>
      <div className="stats">
        <Card title="Current time" value={timeFmt(time)} icon={<Clock3 />} />
        <Card title="Today's status" value={statusValue} icon={<Check />} />
        <Card title={current ? 'Current shift time' : 'Last shift time'} value={durationValue} icon={<Timer />} />
        <Card title="Shift sessions" value={`${shiftRecords.length}`} icon={<CalendarDays />} />
      </div>
      <div className="grid2 dashboard-grid">
        <div className="panel check">
          <div className="panel-label">SHIFT ATTENDANCE</div>
          <h3>{current ? 'You are currently active' : shiftRecords.length ? 'Ready to resume?' : 'Ready to begin?'}</h3>
          <div className="bigclock">{timeFmt(time)}</div>
          <div className="datepill">{dateFmt(time)}</div>
          <button
            className={current ? 'danger' : ''}
            onClick={() => setPendingAction(nextAction)}
            disabled={busy}
          >
            {busy
              ? <><LoaderCircle className="spin" />Saving...</>
              : current
                  ? <><LogOut />Check out</>
                  : <><LogIn />Check in</>}
          </button>
          {current && <div className="active-note"><span className="pulse" />Checked in at {timeFmt(new Date(current.check_in))} · {durationFmt(current.check_in, time, true)}</div>}
          {!current && lastSession?.check_out && <p>Last session ended at {timeFmt(new Date(lastSession.check_out))}. Check in again when your next shift starts.</p>}
          {!shiftRecords.length && <p>Check in when your shift starts. Checkout can happen after midnight.</p>}
          {shiftRecords.length > 0 && <div className="session-count"><History />{shiftRecords.length} session{shiftRecords.length === 1 ? '' : 's'} in this shift</div>}
        </div>
        <div className="panel">
          <div className="panelhead compact-head"><div><div className="panel-label">RECENT ACTIVITY</div><h3>Attendance history</h3></div><span className="record-count">{mine.length} records</span></div>
          <TimesheetTable records={mine.slice(0, 6)} users={[session]} compact activeNow={time} />
          {!mine.length && <Empty />}
        </div>
      </div>
      <div className="dashboard-footer-note"><ClipboardList size={17} />{leaves.filter((leave) => leave.user_id === session.id && leave.status === 'pending').length} pending leave request(s)</div>
      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction === 'check_out' ? 'Confirm check-out' : 'Confirm check-in'}
        message={pendingAction === 'check_out'
          ? 'Are you sure you want to check out? This session will end now and you can check in again later today.'
          : shiftRecords.length
            ? 'Start a new work session? The gap since your last check-out will appear as a break in the admin timeline.'
            : 'Are you sure you want to check in? Your working time will start immediately.'}
        confirmLabel={pendingAction === 'check_out' ? 'Yes, check out' : 'Yes, check in'}
        tone={pendingAction === 'check_out' ? 'danger' : 'primary'}
        onCancel={() => setPendingAction(null)}
        onConfirm={confirmAttendance}
      />
    </>
  )
}

function Card({ title, value, icon }) {
  return <div className="card"><div className="cardicon">{icon}</div><div><span>{title}</span><b>{value}</b></div></div>
}

function Timesheet({ records, users }) {
  const activeNow = useCurrentTime()
  return (
    <div className="panel">
      <div className="panelhead"><div><span className="eyebrow">ATTENDANCE</span><h2>My timesheet</h2><p>Your daily check-in, check-out and active hours</p></div></div>
      <TimesheetTable records={records} users={users} activeNow={activeNow} />
      {!records.length && <Empty />}
    </div>
  )
}

function TimesheetTable({ records, users, compact = false, activeNow = now() }) {
  const sessionNumbers = new Map()
  const groups = new Map()
  records.forEach((record) => {
    const key = `${record.user_id}-${record.work_date}`
    groups.set(key, [...(groups.get(key) || []), record])
  })
  groups.forEach((group) => sortSessions(group).forEach((record, index) => sessionNumbers.set(record.id, index + 1)))

  return (
    <div className="table-wrap">
      <table className={compact ? 'compact-table' : ''}>
        <thead><tr>{!compact && <th>Employee</th>}<th>Date</th><th>Session</th><th>Check in</th><th>Check out</th><th>Hours</th></tr></thead>
        <tbody>{records.map((record) => {
          const user = users.find((item) => item.id === record.user_id)
          const hours = record.check_out
            ? durationFmt(record.check_in, record.check_out)
            : `${durationFmt(record.check_in, activeNow)} active`
          return (
            <tr key={record.id}>
              {!compact && <td><b>{user?.full_name || 'User'}</b><small>{user?.email}</small></td>}
              <td>{workDateFmt(record.work_date)}</td>
              <td><span className="session-badge">#{sessionNumbers.get(record.id)}</span></td>
              <td>{timeFmt(new Date(record.check_in))}</td>
              <td>{record.check_out ? timeFmt(new Date(record.check_out)) : <span className="live-badge">Active</span>}</td>
              <td><b>{hours}</b></td>
            </tr>
          )
        })}</tbody>
      </table>
    </div>
  )
}

function Leave({ session, users, leaves, onSubmit, onUpdate, busy }) {
  const minimumDate = todayDate()
  const [form, setForm] = useState({ from: '', to: '', type: 'Annual Leave', reason: '' })
  const requestedDays = form.from && form.to
    ? Math.floor((new Date(`${form.to}T00:00:00+05:00`) - new Date(`${form.from}T00:00:00+05:00`)) / 86400000) + 1
    : 0
  const submit = async (event) => {
    event.preventDefault()
    const saved = await onSubmit(form)
    if (saved) setForm({ from: '', to: '', type: 'Annual Leave', reason: '' })
  }
  const updateFrom = (value) => {
    setForm((current) => ({
      ...current,
      from: value,
      to: current.to && current.to < value ? value : current.to,
    }))
  }
  const list = session.role === 'admin' ? leaves : leaves.filter((leave) => leave.user_id === session.id)

  return (
    <div className="grid2 no-top">
      <form className="panel form-panel" onSubmit={submit}>
        <span className="eyebrow">NEW REQUEST</span>
        <h2>Apply for leave</h2>
        <p>Choose today or a future date. Past dates are blocked automatically.</p>
        <div className="leave-date-notice"><CalendarDays /><span><b>Planning window</b>Requests start from {workDateFmt(minimumDate)} onward.</span></div>
        <div className="formgrid">
          <label>Leave type<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option>Annual Leave</option><option>Sick Leave</option><option>Casual Leave</option><option>Unpaid Leave</option></select></label>
          <label>Start date<input type="date" required min={minimumDate} value={form.from} onChange={(event) => updateFrom(event.target.value)} /><small>Past dates cannot be selected.</small></label>
          <label>Return date<input type="date" required min={form.from || minimumDate} value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} /><small>{requestedDays ? `${requestedDays} calendar day${requestedDays === 1 ? '' : 's'} selected` : 'Select the final leave date.'}</small></label>
          <label className="full">Reason<textarea required minLength="3" maxLength="300" placeholder="Example: Family commitment or medical appointment" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /><small className="character-count">{form.reason.length}/300 characters</small></label>
        </div>
        <button className="primary" disabled={busy === 'leave'}>{busy === 'leave' ? 'Submitting...' : 'Submit request'}</button>
      </form>

      <div className="panel">
        <span className="eyebrow">REQUESTS</span>
        <h2>{session.role === 'admin' ? 'Leave approvals' : 'My requests'}</h2>
        {list.map((leave) => (
          <div className="leaveitem" key={leave.id}>
            <div>
              <b>{users.find((user) => user.id === leave.user_id)?.full_name || 'User'}</b>
              <span>{leave.leave_type} · {workDateFmt(leave.from_date)} to {workDateFmt(leave.to_date)}</span>
              <p>{leave.reason}</p>
            </div>
            <em className={leave.status}>{leave.status}</em>
            {session.role === 'admin' && leave.status === 'pending' && (
              <div className="actions">
                <button disabled={busy === `leave-${leave.id}`} onClick={() => onUpdate(leave.id, 'approved')} title="Approve" aria-label="Approve leave"><Check /></button>
                <button disabled={busy === `leave-${leave.id}`} onClick={() => onUpdate(leave.id, 'rejected')} title="Reject" aria-label="Reject leave"><X /></button>
              </div>
            )}
          </div>
        ))}
        {!list.length && <Empty />}
      </div>
    </div>
  )
}

function UserAdmin({ currentUser, users, onCreate, onToggle, onDelete, busy }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [deleteTarget, setDeleteTarget] = useState(null)
  const admin = users.find((user) => user.role === 'admin')
  const employees = users.filter((user) => user.role === 'employee')

  const add = async (event) => {
    event.preventDefault()
    const saved = await onCreate(form)
    if (saved) setForm({ name: '', email: '', password: '' })
  }

  const confirmDelete = async () => {
    const target = deleteTarget
    if (!target) return
    const deleted = await onDelete(target)
    if (deleted) setDeleteTarget(null)
  }

  return (
    <div className="grid2 no-top users-layout">
      <form className="panel form-panel" onSubmit={add}>
        <span className="eyebrow">EMPLOYEE ACCESS</span>
        <h2>Create employee</h2>
        <p>New accounts are saved in Supabase Auth and the CRM database.</p>
        <label>Full name<input required minLength="2" placeholder="Employee name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Email<input type="email" required placeholder="employee@company.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label>Password
          <PasswordInput
            minLength={8}
            autoComplete="new-password"
            placeholder="Minimum 8 characters"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </label>
        <div className="security-note"><ShieldCheck size={18} /><span><b>Password protected</b>Passwords are handled by Supabase Auth and are never displayed in the admin panel.</span></div>
        <button className="primary inline-button" disabled={busy === 'create-user'}><UserPlus />{busy === 'create-user' ? 'Creating...' : 'Create employee'}</button>
      </form>

      <div className="panel users-panel">
        <div className="panelhead"><div><span className="eyebrow">USER MANAGEMENT</span><h2>Users</h2><p>One main admin and your created employees</p></div><span className="record-count">{users.length} total</span></div>
        {admin && (
          <div className="admin-user-card">
            <div className="avatar admin-avatar">{admin.full_name?.[0]?.toUpperCase() || 'A'}</div>
            <div><b>{admin.full_name}</b><span>{admin.email}</span></div>
            <div className="admin-badge"><ShieldCheck size={14} />Main admin</div>
          </div>
        )}
        <div className="employee-heading"><span>Employees</span><b>{employees.length}</b></div>
        {employees.map((user) => (
          <div className={`userrow ${!user.active ? 'inactive-user' : ''}`} key={user.id}>
            <div className="avatar">{user.full_name?.[0]?.toUpperCase() || 'U'}</div>
            <div><b>{user.full_name}</b><span>{user.email}</span></div>
            <button
              className={`status-button ${user.active ? 'active-status' : ''}`}
              disabled={busy === `user-${user.id}` || user.id === currentUser.id}
              onClick={() => onToggle(user)}
            >
              {busy === `user-${user.id}` ? 'Saving...' : user.active ? 'Active' : 'Inactive'}
            </button>
            <button
              className="delete-button"
              disabled={busy === `delete-${user.id}`}
              onClick={() => setDeleteTarget(user)}
              aria-label={`Delete ${user.full_name}`}
              title="Delete employee"
            >
              {busy === `delete-${user.id}` ? <LoaderCircle className="spin" /> : <Trash2 />}
            </button>
          </div>
        ))}
        {!employees.length && <Empty title="No employees yet" message="Create employees when you are ready." icon={<Users />} />}
      </div>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete employee permanently?"
        message={`${deleteTarget?.full_name || 'This employee'} and all related attendance and leave records will be removed. This action cannot be undone.`}
        confirmLabel="Delete employee"
        tone="danger"
        busy={Boolean(deleteTarget && busy === `delete-${deleteTarget.id}`)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function Reports({ records, users, onClearAttendance, busy }) {
  const activeNow = useCurrentTime()
  const [query, setQuery] = useState('')
  const [month, setMonth] = useState(todayYM())
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id || '')
  const [clearTarget, setClearTarget] = useState(null)

  const visibleUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return users.filter((user) => !normalized
      || user.full_name.toLowerCase().includes(normalized)
      || user.email.toLowerCase().includes(normalized))
  }, [query, users])

  useEffect(() => {
    if (!users.some((user) => user.id === selectedUserId)) setSelectedUserId(users[0]?.id || '')
  }, [selectedUserId, users])

  const selectedUser = users.find((user) => user.id === selectedUserId) || null
  const selectedRecords = records.filter((record) => record.user_id === selectedUserId && record.work_date.startsWith(month))
  const totalMs = selectedRecords.reduce((sum, record) => sum + recordDuration(record, activeNow), 0)
  const totalHours = millisecondsFmt(totalMs)
  const activeRecord = records.find((record) => record.user_id === selectedUserId && !record.check_out) || null
  const dailyGroups = Object.entries(selectedRecords.reduce((groups, record) => ({
    ...groups,
    [record.work_date]: [...(groups[record.work_date] || []), record],
  }), {})).sort(([dateA], [dateB]) => dateB.localeCompare(dateA))

  const confirmClear = async () => {
    if (!clearTarget) return
    const cleared = await onClearAttendance(selectedUserId, clearTarget)
    if (cleared) setClearTarget(null)
  }

  return (
    <div className="reports-shell">
      <div className="panel report-directory">
        <span className="eyebrow">EMPLOYEES</span>
        <h2>Attendance reports</h2>
        <p>Select one user to view their complete monthly activity.</p>
        <div className="search report-search"><Search /><input placeholder="Search users" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="report-user-list">
          {visibleUsers.map((user) => (
            <button key={user.id} className={selectedUserId === user.id ? 'selected' : ''} onClick={() => setSelectedUserId(user.id)} aria-pressed={selectedUserId === user.id}>
              <div className="avatar">{user.full_name?.[0]?.toUpperCase() || 'U'}</div>
              <span><b>{user.full_name}</b><small>{user.email}</small></span>
              <ChevronRight />
            </button>
          ))}
          {!visibleUsers.length && <Empty title="No matching users" message="Try another name or email." />}
        </div>
      </div>

      <div className="panel report-detail">
        <div className="report-detail-head">
          <div>
            <span className="eyebrow">MONTHLY DETAIL</span>
            <h2>{selectedUser?.full_name || 'Select a user'}</h2>
            <p>{selectedUser?.email || 'Choose a user from the list to view attendance.'}</p>
          </div>
          <label className="month-filter">Report month<input type="month" max={todayYM()} value={month} onChange={(event) => setMonth(event.target.value)} /></label>
        </div>

        {selectedUser && (
          <>
            <div className="report-stats">
              <Card title="Shift start dates" value={`${new Set(selectedRecords.map((record) => record.work_date)).size}`} icon={<CalendarDays />} />
              <Card title="Total active time" value={totalHours} icon={<Timer />} />
              <Card title="Current status" value={activeRecord ? 'Active now' : 'Checked out'} icon={<Clock3 />} />
            </div>
            <div className={`live-profile-status ${activeRecord ? 'is-active' : ''}`}>
              <div className="live-profile-icon">{activeRecord ? <UserRoundCheck /> : <Coffee />}</div>
              <div>
                <span>{activeRecord ? 'LIVE NOW' : 'CURRENT STATUS'}</span>
                <b>{activeRecord ? `${selectedUser.full_name} is actively working` : `${selectedUser.full_name} is not checked in`}</b>
                <p>{activeRecord
                  ? `Checked in at ${timeFmt(new Date(activeRecord.check_in))} · active for ${durationFmt(activeRecord.check_in, activeNow, true)}`
                  : 'Their next check-in will start a new attendance session.'}</p>
              </div>
            </div>
            <div className="report-table-title"><h3>Shift timeline</h3><span>{selectedRecords.length} session(s)</span></div>
            <div className="attendance-days">
              {dailyGroups.map(([workDate, sessions]) => (
                <AttendanceDayTimeline
                  key={workDate}
                  workDate={workDate}
                  sessions={sessions}
                  activeNow={activeNow}
                  clearing={busy === `clear-${selectedUserId}-${workDate}`}
                  onClear={() => setClearTarget(workDate)}
                />
              ))}
            </div>
            {!selectedRecords.length && <Empty title="No attendance this month" message="No check-in record exists for the selected month." />}
          </>
        )}
      </div>
      <ConfirmDialog
        open={Boolean(clearTarget)}
        title="Clear this shift?"
        message={`${selectedUser?.full_name || 'This employee'}’s sessions and break timeline starting ${clearTarget ? workDateFmt(clearTarget) : 'this date'} will be permanently removed.`}
        confirmLabel="Clear shift"
        tone="danger"
        busy={Boolean(clearTarget && busy === `clear-${selectedUserId}-${clearTarget}`)}
        onCancel={() => setClearTarget(null)}
        onConfirm={confirmClear}
      />
    </div>
  )
}

function AttendanceDayTimeline({ workDate, sessions, activeNow, clearing, onClear }) {
  const ordered = sortSessions(sessions)
  const totalMs = ordered.reduce((sum, record) => sum + recordDuration(record, activeNow), 0)

  return (
    <article className="attendance-day-card">
      <header className="attendance-day-head">
        <div><b>{workDateFmt(workDate)}</b><span>{ordered.length} work session{ordered.length === 1 ? '' : 's'} · {millisecondsFmt(totalMs)} active</span></div>
        <button className="clear-day-button" onClick={onClear} disabled={clearing}><RotateCcw />{clearing ? 'Clearing...' : 'Clear shift'}</button>
      </header>
      <div className="session-timeline">
        {ordered.map((record, index) => {
          const previous = ordered[index - 1]
          const breakMs = previous?.check_out ? durationMs(previous.check_out, record.check_in) : 0
          return (
            <React.Fragment key={record.id}>
              {index > 0 && (
                <div className="break-row"><Coffee /><span>Break</span><b>{millisecondsFmt(breakMs, true)}</b><small>{timeFmt(new Date(previous.check_out))}–{timeFmt(new Date(record.check_in))}</small></div>
              )}
              <div className={`session-row ${!record.check_out ? 'active-session' : ''}`}>
                <div className="session-index">{index + 1}</div>
                <div><span>Session {index + 1}</span><b>{timeFmt(new Date(record.check_in))} → {record.check_out ? timeFmt(new Date(record.check_out)) : 'Active now'}</b></div>
                <strong>{millisecondsFmt(recordDuration(record, activeNow), !record.check_out)}</strong>
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </article>
  )
}

function ConfirmDialog({ open, title, message, confirmLabel, tone = 'primary', busy = false, onCancel, onConfirm }) {
  if (!open) return null
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className={`dialog-icon ${tone}`}><AlertTriangle /></div>
        <h3 id="confirm-title">{title}</h3>
        <p>{message}</p>
        <div className="dialog-actions">
          <button className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={`confirm-button ${tone}`} onClick={onConfirm} disabled={busy}>
            {busy ? <><LoaderCircle className="spin" />Please wait...</> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function Empty({ title = 'No records found', message = 'Your data will appear here.', icon = <ClipboardList /> }) {
  return <div className="empty">{icon}<b>{title}</b><span>{message}</span></div>
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      {supabaseConfig.isConfigured ? <App /> : <ConfigurationScreen />}
    </AppErrorBoundary>
  </React.StrictMode>,
)
