'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { backend, setCsrfToken, type LiveSession } from '@/lib/backend';

type Task = { id: string; title: string; description: string; category: string; budget: number; status: string; urgency: string; poster_id?: string; poster_alias?: string; assignee_id?: string; agreed_amount?: number; source_order?: { id: string; status: string; store_name: string } };
type Bid = { id: string; bidder_id: string; amount: number; eta_minutes: number; note: string };
type Recommendations = { estimate_minutes: { low: number; high: number } | null; confidence: string; ranked: { bid_id: string; score: number; feasible: boolean; reason: string }[] };
type Chat = { id: string; sender_id: string; body: string; created_at: number };
type Store = { id: string; name: string; type: string };
type Product = { id: string; store_id: string; store_name: string; name: string; price: number; stock: number };
type Order = { id: string; store_id: string; amount: number; status: string; pickup_code?: string; items: { name: string; quantity: number }[] };
type PrintJob = { id: string; store_id: string; file_name: string; pages: number; copies: number; amount: number; status: string; pickup_code?: string };
type Listing = { id: string; title: string; amount: number; kind: 'sale' | 'rental'; deposit?: number; max_days?: number; status: string; seller_id: string; buyer_id?: string };
type Rental = { id: string; listing_id: string; renter_id: string; seller_id: string; status: string; fee: number; deposit: number; due_at: number };
type Service = { id: string; title: string; amount: number; provider_id: string };
type Booking = { id: string; service_id: string; status: string; provider_id: string; buyer_id: string };
type Event = { id: string; title: string; price: number; capacity: number; reserved_seats: number; starts_at: number };
type Ticket = { id: string; event_id: string; title: string; status: string; code: string };
type Org = { id: string; name: string; type: string; store_id?: string; store_type?: string };
type Tab = 'tasks' | 'shops' | 'print' | 'market' | 'services' | 'events' | 'wallet';

const sections: { id: Tab; label: string }[] = [
  { id: 'tasks', label: 'Tasks' }, { id: 'shops', label: 'Campus shops' }, { id: 'print', label: 'Xerox' },
  { id: 'market', label: 'Student market' }, { id: 'services', label: 'Services' },
  { id: 'events', label: 'Events' }, { id: 'wallet', label: 'KC & orders' },
];

const field = (form: HTMLFormElement, name: string) => String(new FormData(form).get(name) ?? '').trim();
const numeric = (form: HTMLFormElement, name: string) => Number(field(form, name));
const dateSeconds = (form: HTMLFormElement, name: string) => Math.floor(new Date(field(form, name)).getTime() / 1000);
const inputClass = 'w-full rounded-lg border border-[#d7e2d6] bg-white px-3 py-2 text-sm text-brand-950';
const buttonClass = 'rounded-lg bg-brand-900 px-3 py-2 text-xs font-bold text-white hover:bg-brand-950 disabled:opacity-50';

function Card({ children, title }: { children: ReactNode; title?: string }) {
  return <section className="rounded-2xl border border-[#dfe8df] bg-white p-5 shadow-sm">
    {title && <h2 className="mb-3 font-display text-lg font-bold text-brand-950">{title}</h2>}{children}
  </section>;
}
function Button({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button className={buttonClass} onClick={onClick} disabled={disabled}>{children}</button>;
}
function FormButton({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  return <button type="submit" disabled={disabled} className={buttonClass}>{children}</button>;
}

export default function LiveWorkspace() {
  const [session, setSession] = useState<LiveSession | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [demoMode, setDemoMode] = useState<boolean | null>(null);
  const [campusUsers, setCampusUsers] = useState<{ id: string; name: string; verified: number }[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [tab, setTab] = useState<Tab>('tasks');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [balance, setBalance] = useState({ available: 0, reserved: 0 });
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendations | null>(null);
  const [messages, setMessages] = useState<Chat[]>([]);
  const [bidderThread, setBidderThread] = useState('');

  const refresh = useCallback(async (token?: string) => {
    const [t, s, p, o, pj, l, rentalsData, sv, b, e, tk, org, w] = await Promise.all([
      backend<Task[]>('v1/tasks', token), backend<Store[]>('v1/stores', token),
      backend<Product[]>('v1/catalog', token), backend<Order[]>('v1/orders', token),
      backend<PrintJob[]>('v1/print-jobs', token),
      backend<Listing[]>('v1/listings', token), backend<Rental[]>('v1/rentals', token), backend<Service[]>('v1/services', token),
      backend<Booking[]>('v1/bookings', token), backend<Event[]>('v1/events', token),
      backend<Ticket[]>('v1/tickets', token), backend<Org[]>('v1/organizations/mine', token),
      backend<{ available: number; reserved: number }>('v1/wallet', token),
    ]);
    setTasks(t); setStores(s); setProducts(p); setOrders(o); setPrintJobs(pj); setListings(l); setRentals(rentalsData);
    setServices(sv); setBookings(b); setEvents(e); setTickets(tk); setOrgs(org); setBalance(w);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const health = await backend<{ demo_mode: boolean }>('health');
        if (!active) return;
        setDemoMode(health.demo_mode);
        if (health.demo_mode) {
          const saved = localStorage.getItem('kart-live-session');
          if (saved) {
            try {
              const value = JSON.parse(saved) as LiveSession;
              setSession(value);
              await refresh(value.token ?? '');
            } catch { localStorage.removeItem('kart-live-session'); }
          }
        } else {
          localStorage.removeItem('kart-live-session');
          try {
            const value = await backend<LiveSession>('auth/session');
            if (!active) return;
            setCsrfToken(value.csrf ?? '');
            setSession(value);
            await refresh('');
          } catch { /* Visitor can start campus sign-in below. */ }
        }
      } catch (error) { if (active) setNotice(error instanceof Error ? error.message : 'Backend unavailable'); }
      finally { if (active) setLoaded(true); }
    })();
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    let active = true;
    if (session?.role === 'campus_admin' || session?.role === 'platform_admin') {
      void backend<{ id: string; name: string; verified: number }[]>(`v1/admin/users?q=${encodeURIComponent(userQuery)}`, session.token)
        .then(users => { if (active) setCampusUsers(users); }).catch(() => { if (active) setCampusUsers([]); });
    }
    return () => { active = false; };
  }, [session, userQuery]);

  async function run<T>(path: string, input: unknown, success = 'Saved'): Promise<T | undefined> {
    if (!session || pending) return;
    setPending(true);
    try {
      const result = await backend<T>(path, session.token, input);
      await refresh(session.token);
      setNotice(success);
      return result;
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Request failed'); }
    finally { setPending(false); }
  }

  function submit<T>(path: string, build: (form: HTMLFormElement) => unknown, success?: string) {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      void run<T>(path, build(form), success).then(result => { if (result) form.reset(); });
    };
  }

  async function openTask(task: Task) {
    if (!session) return;
    setSelectedTask(task.id); setBids([]); setRecommendations(null); setMessages([]); setBidderThread('');
    if (task.poster_id === session.id) {
      try { setBids(await backend<Bid[]>(`v1/tasks/${task.id}/bids`, session.token)); } catch { /* no bids yet */ }
      try { setRecommendations(await backend<Recommendations>(`v1/tasks/${task.id}/recommendations`, session.token)); } catch { /* no ranking yet */ }
    }
    if (task.status !== 'open') {
      try { setMessages(await backend<Chat[]>(`v1/tasks/${task.id}/messages`, session.token)); } catch { /* not a participant */ }
    }
  }

  async function loadThread(taskId: string, bidderId: string) {
    if (!session) return;
    setBidderThread(bidderId);
    try { setMessages(await backend<Chat[]>(`v1/tasks/${taskId}/messages?bidder_id=${encodeURIComponent(bidderId)}`, session.token)); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Thread unavailable'); }
  }

  if (!loaded) return null;
  if (!session) return <main className="mx-auto max-w-xl px-5 py-16">
    {demoMode && <a href="/login" className="text-sm text-brand-900">← Existing prototype</a>}
    <h1 className="mt-8 font-display text-4xl font-extrabold">KART connected workspace</h1>
    <p className="mt-3 text-sm text-muted">Persistent campus workflows through the FastAPI backend. Demo identities and KC have no monetary value.</p>
    {demoMode === false && <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
      <p className="mb-4 text-sm">Sign in using your verified campus account.</p>
      <a className={buttonClass} href="/api/backend/auth/start">Sign in with campus</a>
      {notice && <p role="status" className="mt-4 text-sm text-red-700">{notice}</p>}
    </div>}
    {demoMode !== false &&
    <form className="mt-8 grid gap-3 rounded-2xl bg-white p-6 shadow-sm" onSubmit={async event => {
      event.preventDefault(); setPending(true);
      try {
        const form = event.currentTarget;
        const name = field(form, 'name'), campus = field(form, 'campus');
        const created = await backend<{ id: string; token: string }>('dev/users', undefined, { name, campus_id: campus });
        const next = { id: created.id, name, campus, token: created.token };
        localStorage.setItem('kart-live-session', JSON.stringify(next));
        setSession(next);
        await backend('dev/kc-grants', next.token, { amount: 1000, key: crypto.randomUUID() });
        await refresh(next.token);
      } catch (error) { setNotice(error instanceof Error ? error.message : 'Backend unavailable'); }
      finally { setPending(false); }
    }}>
      <label className="text-xs font-bold">Your name<input className={inputClass} name="name" minLength={2} required /></label>
      <label className="text-xs font-bold">Campus code<input className={inputClass} name="campus" defaultValue="vr-siddhartha" required /></label>
      <button className={buttonClass} disabled={pending}>Enter demo workspace</button>
      {notice && <p role="status" className="text-sm text-red-700">{notice}</p>}
    </form>}
  </main>;

  const mine = (task: Task) => task.poster_id === session.id;
  const current = tasks.find(task => task.id === selectedTask);
  const myStores = orgs.filter(org => org.store_id);
  const clubs = orgs.filter(org => org.type === 'club');
  const downloadPrint = async (job: PrintJob) => {
    const response = await fetch(`/api/backend/v1/print-jobs/${job.id}/file`, {
      headers: session.token ? { Authorization: `Bearer ${session.token}` } : {},
    });
    if (!response.ok) { setNotice('Could not open this document'); return; }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = job.file_name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>{demoMode && <a href="/login" className="text-xs text-brand-700">← Prototype</a>}
        <h1 className="font-display text-3xl font-extrabold tracking-tight">KART · Live workspace</h1>
        <p className="text-xs text-muted">{session.name} · {session.campus} · demo KC only</p></div>
      <div className="flex items-center gap-3"><strong className="rounded-xl bg-brand-50 px-4 py-2 text-sm">{balance.available} KC</strong>
        <button className="text-xs underline" onClick={() => {
          if (!demoMode) void backend('auth/logout', undefined, {}).catch(() => setNotice('Sign out failed; retry.'));
          localStorage.removeItem('kart-live-session'); setCsrfToken(''); setSession(null);
        }}>{demoMode ? 'Switch identity' : 'Sign out'}</button></div>
    </header>
    {!demoMode && <p role="status" className="mt-5 rounded-xl bg-[#fff2d7] px-4 py-3 text-sm">
      Campus sign-in is active. KC transfers and paid actions are disabled until the payment integration is approved.
    </p>}
    <nav className="my-7 flex flex-wrap gap-2" aria-label="Workspace sections">{sections.map(section =>
      <button key={section.id} className={`rounded-full px-4 py-2 text-xs font-bold ${tab === section.id ? 'bg-brand-900 text-white' : 'bg-white text-brand-900'}`}
        onClick={() => setTab(section.id)}>{section.label}</button>)}</nav>
    {notice && <p role="status" className="mb-5 rounded-xl bg-[#fff2d7] px-4 py-3 text-sm">{notice}</p>}

    {tab === 'tasks' && <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
      <div className="grid content-start gap-5">
        <Card title="Post a task"><form className="grid gap-3" onSubmit={submit('v1/tasks', form => ({
          title: field(form, 'title'), description: field(form, 'description'), category: field(form, 'category'),
          budget: numeric(form, 'budget'), deadline: dateSeconds(form, 'deadline'),
          anonymous: new FormData(form).has('anonymous'), urgency: field(form, 'urgency'), pricing: field(form, 'pricing'),
          order_id: field(form, 'source').startsWith('order:') ? field(form, 'source').slice(6) : null,
          print_job_id: field(form, 'source').startsWith('print:') ? field(form, 'source').slice(6) : null,
        }), 'Task published')}>
          <input className={inputClass} name="title" placeholder="What needs doing?" required minLength={3} />
          <textarea className={inputClass} name="description" placeholder="Scope and handover details" required minLength={3} />
          <div className="grid grid-cols-2 gap-2"><input className={inputClass} name="category" defaultValue="errand" required />
            <input className={inputClass} name="budget" type="number" min="1" placeholder="Max KC" required /></div>
          <label className="text-xs">Deadline<input className={inputClass} name="deadline" type="datetime-local" required /></label>
          <div className="grid grid-cols-2 gap-2"><select className={inputClass} name="urgency"><option value="urgent">Urgent</option><option value="scheduled">Scheduled</option><option value="long_term">Long term</option></select>
            <select className={inputClass} name="pricing"><option value="bidding">Bidding</option><option value="fixed">Fixed reward</option></select></div>
          <select className={inputClass} name="source" defaultValue=""><option value="">Independent task</option>
            {orders.filter(o => o.status !== 'cancelled').map(o => <option value={`order:${o.id}`} key={o.id}>Pickup · {o.items.map(i => i.name).join(', ')} · {o.status}</option>)}
            {printJobs.filter(j => j.status !== 'cancelled').map(j => <option value={`print:${j.id}`} key={j.id}>Collect print · {j.file_name} · {j.status}</option>)}
          </select>
          <label className="text-xs"><input type="checkbox" name="anonymous" /> Post anonymously</label><FormButton>Publish task</FormButton>
        </form></Card>
        <Card title="Campus task board"><div className="grid gap-2">{tasks.map(task =>
          <button key={task.id} className="rounded-xl border border-line p-3 text-left hover:bg-brand-50" onClick={() => void openTask(task)}>
            <div className="flex justify-between gap-2"><strong>{task.title}</strong><span className="text-sm font-bold">{task.budget} KC</span></div>
            <p className="text-xs text-muted">{task.poster_alias ?? (mine(task) ? 'Your task' : 'Campus student')} · {task.urgency} · {task.status}</p>
          </button>)}{!tasks.length && <p className="text-sm text-muted">No tasks yet.</p>}</div></Card>
      </div>
      <div className="grid content-start gap-5">{current ? <Card title={current.title}>
        <p className="mb-2 text-sm">{current.description}</p>
        <p className="mb-4 text-xs text-muted">{current.status} · Budget {current.budget} KC {current.source_order && `· ${current.source_order.store_name} order ${current.source_order.status}`}</p>
        {current.status === 'open' && !mine(current) && <form className="flex flex-wrap gap-2" onSubmit={submit(`v1/tasks/${current.id}/bids`, form => ({
          amount: numeric(form, 'amount'), eta_minutes: numeric(form, 'eta'), note: field(form, 'note'),
        }), 'Bid submitted')}><input className={inputClass} name="amount" type="number" min="1" max={current.budget} placeholder="Bid KC" required />
          <input className={inputClass} name="eta" type="number" min="1" placeholder="ETA in minutes" required />
          <input className={inputClass} name="note" placeholder="Proposal" /><FormButton>Bid</FormButton></form>}
        {mine(current) && current.status === 'open' && <div><h3 className="mb-2 text-sm font-bold">Bids</h3>
          {recommendations?.estimate_minutes && <p className="mb-3 text-xs text-muted">Estimated duration {recommendations.estimate_minutes.low}–{recommendations.estimate_minutes.high} min · {recommendations.confidence} confidence. Ranking is advisory.</p>}
          {bids.map(bid =>
          <div key={bid.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 p-3 text-xs">
            <span>{bid.bidder_id.slice(0, 8)} · {bid.amount} KC · {bid.eta_minutes} min · {bid.note}
              {recommendations?.ranked.find(r => r.bid_id === bid.id) && ` · Score ${recommendations.ranked.find(r => r.bid_id === bid.id)?.score} (${recommendations.ranked.find(r => r.bid_id === bid.id)?.reason})`}</span>
            <Button disabled={!demoMode} onClick={() => void run(`v1/tasks/${current.id}/bids/${bid.id}/accept`, {}, 'Worker assigned').then(() => void openTask(current))}>Accept</Button>
            <Button onClick={() => void loadThread(current.id, bid.bidder_id)}>Private chat</Button>
          </div>)}<Button onClick={() => void openTask(current)}>Refresh bids</Button></div>}
        {current.status === 'open' && !mine(current) && <Button onClick={() => void loadThread(current.id, session.id)}>My proposal chat</Button>}
        <div className="mt-3 flex flex-wrap gap-2">
          {current.assignee_id === session.id && current.status === 'assigned' && <Button onClick={() => void run(`v1/tasks/${current.id}/actions/start`, {}, 'Work started')}>Start work</Button>}
          {current.assignee_id === session.id && current.status === 'in_progress' && <Button onClick={() => void run(`v1/tasks/${current.id}/actions/submit`, {}, 'Submitted for review')}>Submit work</Button>}
          {mine(current) && current.status === 'review' && <Button onClick={() => void run(`v1/tasks/${current.id}/actions/approve`, {}, 'Payment released')}>Approve</Button>}
          {mine(current) && current.status === 'open' && <Button onClick={() => void run(`v1/tasks/${current.id}/actions/cancel`, {}, 'Task cancelled')}>Cancel</Button>}
          {current.assignee_id === session.id && current.source_order?.status === 'ready' && <Button onClick={() => void backend<{ pickup_code: string }>(`v1/tasks/${current.id}/pickup`, session.token).then(r => setNotice(`Pickup code: ${r.pickup_code}`)).catch(e => setNotice(e.message))}>Pickup credential</Button>}
          {current.status !== 'open' && <Button onClick={() => void openTask(current)}>Refresh conversation</Button>}
        </div>
        {(messages.length > 0 || current.status !== 'open' || bidderThread) && <div className="mt-6 border-t border-line pt-4">
          <h3 className="font-bold">Private conversation</h3>
          <div className="my-3 max-h-64 space-y-2 overflow-auto">{messages.map(m => <p key={m.id} className="rounded-lg bg-brand-50 p-2 text-sm"><strong className="mr-2 text-xs">{m.sender_id === session.id ? 'You' : m.sender_id === 'anonymous-poster' ? 'Anonymous poster' : 'Participant'}</strong>{m.body}</p>)}</div>
          <form className="flex gap-2" onSubmit={event => { event.preventDefault(); const form = event.currentTarget;
            void run(`v1/tasks/${current.id}/messages`, { body: field(form, 'body'), bidder_id: bidderThread || null }, 'Message sent')
              .then(() => { form.reset(); if (bidderThread) void loadThread(current.id, bidderThread); else void openTask(current); }); }}>
            <input className={inputClass} name="body" required placeholder="Message this participant" /><FormButton>Send</FormButton>
          </form></div>}
      </Card> : <Card title="Task details"><p className="text-sm text-muted">Choose a task to see its workflow.</p></Card>}</div>
    </div>}

    {tab === 'print' && <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
      <Card title="Submit a private PDF"><form className="grid gap-3" onSubmit={async event => {
        event.preventDefault(); const form = event.currentTarget;
        const file = (form.elements.namedItem('pdf') as HTMLInputElement).files?.[0];
        if (!file || file.size > 5_000_000) { setNotice('Choose a PDF under 5 MB'); return; }
        const encoded = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(new Error('Could not read PDF')); reader.readAsDataURL(file);
        });
        const result = await run('v1/print-jobs', { store_id: field(form, 'store'), file_name: file.name,
          pdf_base64: encoded, pages: numeric(form, 'pages'), copies: numeric(form, 'copies'),
          color: new FormData(form).has('color'), duplex: new FormData(form).has('duplex'), spiral: new FormData(form).has('spiral'),
        }, 'Print job queued');
        if (result) form.reset();
      }}>
        <select className={inputClass} name="store" required><option value="">Choose Xerox shop</option>
          {stores.filter(store => store.type === 'xerox').map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select>
        <input className={inputClass} name="pdf" type="file" accept="application/pdf,.pdf" required />
        <div className="grid grid-cols-2 gap-2"><label className="text-xs">Pages<input className={inputClass} name="pages" type="number" min="1" max="500" required /></label>
          <label className="text-xs">Copies<input className={inputClass} name="copies" type="number" min="1" max="20" defaultValue="1" required /></label></div>
        <div className="flex gap-4 text-xs"><label><input type="checkbox" name="color" /> Colour</label>
          <label><input type="checkbox" name="duplex" /> Duplex</label><label><input type="checkbox" name="spiral" /> Spiral binding</label></div>
        <p className="text-xs text-muted">The PDF is stored privately by the backend and available only to you and the chosen shop.</p>
        <FormButton disabled={!demoMode}>Submit print job</FormButton>
      </form></Card>
      <div className="grid content-start gap-5"><Card title="Your print jobs"><div className="grid gap-2">{printJobs.map(job =>
        <div key={job.id} className="rounded-xl border border-line p-3 text-sm"><strong>{job.file_name}</strong>
          <p className="text-xs text-muted">{job.pages} pages × {job.copies} · {job.amount} KC · {job.status}</p>
          <div className="mt-2 flex gap-2"><Button onClick={() => void downloadPrint(job)}>Download PDF</Button>
            {job.status === 'placed' && <Button onClick={() => void run(`v1/print-jobs/${job.id}/cancel`, {}, 'Print job refunded')}>Cancel</Button>}</div>
          {job.status === 'ready' && <p className="mt-2 break-all text-xs">Pickup code: {job.pickup_code}</p>}
        </div>)}{!printJobs.length && <p className="text-sm text-muted">No print jobs yet.</p>}</div></Card>
        {myStores.filter(org => org.store_type === 'xerox').map(org => <Card key={org.id} title={`${org.name} print queue`}>
          <PrintQueue storeId={org.store_id!} token={session.token} run={run} /></Card>)}
      </div>
    </div>}

    {tab === 'shops' && <div className="grid gap-5 lg:grid-cols-2">
      <div className="grid content-start gap-5">
        <Card title="Canteen, Xerox, stationery & merchandise"><p className="mb-3 text-xs text-muted">Each purchase is recorded by the backend. Pickup requires the buyer's code.</p>
          {stores.map(store => <div key={store.id} className="mb-4 rounded-xl border border-line p-3">
            <h3 className="mb-2 font-bold">{store.name} <span className="text-xs font-normal text-muted">{store.type}</span></h3>
            {products.filter(product => product.store_id === store.id).map(product =>
              <div key={product.id} className="flex items-center justify-between gap-2 border-t border-line py-2 text-sm">
                <span>{product.name} · {product.price} KC · {product.stock} left</span>
                <Button disabled={!demoMode || product.stock < 1 || pending} onClick={() => void run('v1/orders', {
                  store_id: store.id, items: [{ product_id: product.id, quantity: 1 }], request_key: crypto.randomUUID(),
                }, 'Order placed')}>Buy one</Button>
              </div>)}
            {!products.some(p => p.store_id === store.id) && <p className="text-xs text-muted">No items listed yet.</p>}
          </div>)}{!stores.length && <p className="text-sm text-muted">No campus shops yet.</p>}
        </Card>
        {demoMode && <Card title="Create a demo campus shop"><form className="grid gap-2" onSubmit={submit('dev/organizations', form => ({
          name: field(form, 'name'), type: 'vendor', store_type: field(form, 'type'),
        }), 'Shop created')}>
          <input className={inputClass} name="name" placeholder="Shop name" minLength={2} required />
          <select className={inputClass} name="type"><option value="canteen">Canteen</option><option value="xerox">Xerox</option><option value="stationery">Stationery</option><option value="merch">Custom merchandise</option></select>
          <FormButton>Create shop</FormButton></form></Card>}
        {!demoMode && ['campus_admin', 'platform_admin'].includes(session.role ?? '') &&
          <Card title="Approve a campus shop"><input className={inputClass} value={userQuery}
            onChange={event => setUserQuery(event.target.value)} placeholder="Search verified students by name" aria-label="Search campus students" />
            <form className="mt-2 grid gap-2" onSubmit={submit('v1/admin/organizations', form => ({
            owner_id: field(form, 'owner'), name: field(form, 'name'), type: 'vendor', store_type: field(form, 'type'),
          }), 'Shop approved')}>
            <select className={inputClass} name="owner" required><option value="">Select verified student owner</option>
              {campusUsers.filter(user => user.verified).map(user => <option key={user.id} value={user.id}>{user.name} · {user.id.slice(0, 8)}</option>)}</select>
            <input className={inputClass} name="name" placeholder="Shop name" minLength={2} required />
            <select className={inputClass} name="type"><option value="canteen">Canteen</option><option value="xerox">Xerox</option><option value="stationery">Stationery</option><option value="merch">Custom merchandise</option></select>
            <FormButton>Approve shop</FormButton></form></Card>}
        {!demoMode && ['campus_admin', 'platform_admin'].includes(session.role ?? '') &&
          <Card title="Campus account review"><div className="grid gap-2">{campusUsers.map(user =>
            <div key={user.id} className="flex items-center justify-between gap-2 rounded-lg border border-line p-2 text-xs">
              <span>{user.name} · {user.id.slice(0, 8)} · {user.verified ? 'active' : 'suspended'}</span>
              <Button onClick={() => void run(`v1/admin/users/${user.id}/suspension`, { suspended: Boolean(user.verified) },
                user.verified ? 'Account suspended' : 'Account reinstated').then(result => {
                  if (result) setCampusUsers(current => current.map(item => item.id === user.id ? { ...item, verified: user.verified ? 0 : 1 } : item));
                })}>{user.verified ? 'Suspend' : 'Reinstate'}</Button>
            </div>)}{!campusUsers.length && <p className="text-xs text-muted">No student accounts yet.</p>}</div></Card>}
      </div>
      <div className="grid content-start gap-5"><Card title="Your shop management">
        {myStores.map(org => <div key={org.id} className="mb-4 rounded-xl bg-brand-50 p-3">
          <strong>{org.name}</strong><p className="mb-2 text-xs text-muted">{org.store_type} · Store ID {org.store_id}</p>
          <form className="grid gap-2" onSubmit={submit(`v1/stores/${org.store_id}/products`, form => ({
            name: field(form, 'name'), description: field(form, 'description'),
            price: numeric(form, 'price'), stock: numeric(form, 'stock'),
          }), 'Product added')}>
            <input className={inputClass} name="name" placeholder="Product name" minLength={2} required />
            <input className={inputClass} name="description" placeholder="Description" />
            <div className="grid grid-cols-2 gap-2"><input className={inputClass} name="price" type="number" min="1" placeholder="KC price" required />
              <input className={inputClass} name="stock" type="number" min="0" placeholder="Stock" required /></div>
            <FormButton>Add product</FormButton></form>
          <h4 className="mt-4 text-xs font-bold">Order queue</h4>
          <ShopOrders storeId={org.store_id!} token={session.token} run={run} />
        </div>)}{!myStores.length && <p className="text-sm text-muted">Create a shop to manage a real order queue.</p>}
      </Card></div>
    </div>}

    {tab === 'market' && <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
      <Card title="Sell or rent an item"><form className="grid gap-2" onSubmit={submit('v1/listings', form => ({
        title: field(form, 'title'), description: field(form, 'description'), amount: numeric(form, 'amount'),
        kind: field(form, 'kind'), deposit: numeric(form, 'deposit'), max_days: numeric(form, 'max_days'),
      }), 'Listing published')}>
        <input className={inputClass} name="title" placeholder="Textbook, calculator, bicycle…" minLength={3} required />
        <textarea className={inputClass} name="description" placeholder="Condition and handover details" minLength={3} required />
        <select className={inputClass} name="kind"><option value="sale">Sell</option><option value="rental">Rent out</option></select>
        <input className={inputClass} name="amount" type="number" min="1" placeholder="Sale price or rental fee per day (KC)" required />
        <input className={inputClass} name="deposit" type="number" min="0" defaultValue="0" placeholder="Rental deposit KC" />
        <input className={inputClass} name="max_days" type="number" min="0" max="30" defaultValue="0" placeholder="Maximum rental days (set 1–30 for rentals)" />
        <FormButton>Publish listing</FormButton></form></Card>
      <div className="grid gap-5"><Card title="Student listings"><div className="grid gap-3 sm:grid-cols-2">{listings.map(listing =>
        <div key={listing.id} className="rounded-xl border border-line p-4">
          <h3 className="font-bold">{listing.title}</h3><p className="text-xs text-muted">{listing.amount} KC · {listing.status}</p>
          {listing.kind === 'rental' && <p className="text-xs text-muted">Per day · deposit {listing.deposit} KC · up to {listing.max_days} days</p>}
          <div className="mt-3 flex gap-2">{listing.kind === 'sale' && listing.status === 'active' && listing.seller_id !== session.id &&
            <Button disabled={!demoMode} onClick={() => void run(`v1/listings/${listing.id}/reserve`, {}, 'KC reserved')}>Reserve</Button>}
          {listing.kind === 'rental' && listing.status === 'active' && listing.seller_id !== session.id &&
            <form className="flex gap-2" onSubmit={submit(`v1/listings/${listing.id}/rent`, form => ({ days: numeric(form, 'days') }), 'Rental reserved')}>
              <input className={inputClass} name="days" type="number" min="1" max={listing.max_days} defaultValue="1" required /><FormButton disabled={!demoMode}>Rent</FormButton></form>}
          {listing.kind === 'sale' && listing.status === 'reserved' && listing.buyer_id === session.id &&
            <Button onClick={() => void run(`v1/listings/${listing.id}/actions/confirm`, {}, 'Handover confirmed')}>Confirm handover</Button>}
          {listing.kind === 'sale' && listing.status === 'reserved' && listing.buyer_id === session.id &&
            <Button onClick={() => void run(`v1/listings/${listing.id}/actions/cancel`, {}, 'Reservation refunded')}>Cancel</Button>}
          {listing.status === 'active' && listing.seller_id === session.id &&
            <Button onClick={() => void run(`v1/listings/${listing.id}/actions/withdraw`, {}, 'Listing withdrawn')}>Withdraw</Button>}</div>
        </div>)}{!listings.length && <p className="text-sm text-muted">No student listings yet.</p>}</div></Card>
        <Card title="Your rentals"><div className="grid gap-2">{rentals.map(rental => <div key={rental.id} className="rounded-xl bg-brand-50 p-3 text-sm">
          <strong>{listings.find(l => l.id === rental.listing_id)?.title ?? 'Rental'}</strong> · {rental.status}
          <p className="text-xs text-muted">Fee {rental.fee} KC · deposit {rental.deposit} KC {rental.due_at > 0 && `· return ${new Date(rental.due_at * 1000).toLocaleDateString()}`}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {rental.seller_id === session.id && rental.status === 'reserved' && <Button onClick={() => void run(`v1/rentals/${rental.id}/actions/handover`, {}, 'Rental started')}>Confirm handover</Button>}
            {rental.renter_id === session.id && rental.status === 'reserved' && <Button onClick={() => void run(`v1/rentals/${rental.id}/actions/cancel`, {}, 'Rental refunded')}>Cancel</Button>}
            {rental.renter_id === session.id && rental.status === 'active' && <Button onClick={() => void run(`v1/rentals/${rental.id}/actions/return`, {}, 'Return requested')}>Request return</Button>}
            {rental.seller_id === session.id && rental.status === 'return_pending' && <Button onClick={() => void run(`v1/rentals/${rental.id}/actions/confirm_return`, {}, 'Deposit returned')}>Confirm return</Button>}
            {rental.status === 'return_pending' && <Button onClick={() => void run(`v1/rentals/${rental.id}/actions/dispute`, {}, 'Dispute opened')}>Dispute</Button>}
          </div>
        </div>)}{!rentals.length && <p className="text-sm text-muted">No rentals yet.</p>}</div></Card></div>
    </div>}

    {tab === 'services' && <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
      <Card title="Offer a student service"><form className="grid gap-2" onSubmit={submit('v1/services', form => ({
        title: field(form, 'title'), description: field(form, 'description'), amount: numeric(form, 'amount'),
      }), 'Service published')}>
        <input className={inputClass} name="title" placeholder="Design, editing, photography…" minLength={3} required />
        <textarea className={inputClass} name="description" minLength={3} placeholder="What is included?" required />
        <input className={inputClass} name="amount" type="number" min="1" placeholder="Price in KC" required />
        <FormButton>Publish service</FormButton></form></Card>
      <div className="grid gap-5"><Card title="Available services"><div className="grid gap-2 sm:grid-cols-2">{services.map(s =>
        <div key={s.id} className="rounded-xl border border-line p-3"><strong>{s.title}</strong>
          <p className="text-xs text-muted">{s.amount} KC · provider {s.provider_id.slice(0, 8)}</p>
          {s.provider_id !== session.id && <div className="mt-2"><Button disabled={!demoMode} onClick={() => void run(`v1/services/${s.id}/book`, {}, 'Booking requested and KC reserved')}>Book service</Button></div>}
        </div>)}{!services.length && <p className="text-sm text-muted">No services yet.</p>}</div></Card>
        <Card title="Bookings"><div className="grid gap-2">{bookings.map(booking =>
          <div key={booking.id} className="rounded-xl bg-brand-50 p-3 text-sm">
            <strong>{services.find(s => s.id === booking.service_id)?.title ?? 'Service'}</strong> · {booking.status}
            <div className="mt-2 flex flex-wrap gap-2">
              {booking.provider_id === session.id && booking.status === 'requested' && <Button onClick={() => void run(`v1/bookings/${booking.id}/actions/start`, {}, 'Work started')}>Start</Button>}
              {booking.provider_id === session.id && booking.status === 'in_progress' && <Button onClick={() => void run(`v1/bookings/${booking.id}/actions/submit`, {}, 'Submitted')}>Submit</Button>}
              {booking.buyer_id === session.id && booking.status === 'requested' && <Button onClick={() => void run(`v1/bookings/${booking.id}/actions/cancel`, {}, 'Refunded')}>Cancel</Button>}
              {booking.buyer_id === session.id && booking.status === 'submitted' && <Button onClick={() => void run(`v1/bookings/${booking.id}/actions/approve`, {}, 'Provider paid in demo KC')}>Approve</Button>}
              {booking.status === 'submitted' && <Button onClick={() => void run(`v1/bookings/${booking.id}/actions/dispute`, {}, 'Dispute opened')}>Dispute</Button>}
            </div>
          </div>)}{!bookings.length && <p className="text-sm text-muted">No bookings yet.</p>}</div></Card></div>
    </div>}

    {tab === 'events' && <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
      <div className="grid content-start gap-5"><Card title="Organize an event">
        {demoMode && <form className="mb-4 flex gap-2" onSubmit={submit('dev/organizations', form => ({
          name: field(form, 'name'), type: 'club', store_type: null,
        }), 'Club created')}><input className={inputClass} name="name" minLength={2} placeholder="Club name" required /><FormButton>Create club</FormButton></form>}
        {!demoMode && ['campus_admin', 'platform_admin'].includes(session.role ?? '') &&
          <form className="mb-4 grid gap-2" onSubmit={submit('v1/admin/organizations', form => ({
            owner_id: field(form, 'owner'), name: field(form, 'name'), type: 'club', store_type: null,
          }), 'Club approved')}><select className={inputClass} name="owner" required><option value="">Select verified organizer</option>
            {campusUsers.filter(user => user.verified).map(user => <option key={user.id} value={user.id}>{user.name} · {user.id.slice(0, 8)}</option>)}</select>
            <input className={inputClass} name="name" minLength={2} placeholder="Club name" required /><FormButton>Approve club</FormButton></form>}
        {clubs.map(club => <form key={club.id} className="mb-4 grid gap-2 border-t border-line pt-3" onSubmit={submit(`v1/organizations/${club.id}/events`, form => ({
          title: field(form, 'title'), description: field(form, 'description'),
          starts_at: dateSeconds(form, 'starts'), capacity: numeric(form, 'capacity'), price: numeric(form, 'price'),
        }), 'Event published')}>
          <h3 className="text-sm font-bold">{club.name}</h3><input className={inputClass} name="title" minLength={3} placeholder="Event name" required />
          <textarea className={inputClass} name="description" minLength={3} placeholder="What to expect" required />
          <label className="text-xs">Starts<input className={inputClass} name="starts" type="datetime-local" required /></label>
          <div className="grid grid-cols-2 gap-2"><input className={inputClass} name="capacity" type="number" min="1" placeholder="Capacity" required />
            <input className={inputClass} name="price" type="number" min="0" placeholder="Ticket KC (0 = free)" required /></div>
          <FormButton>Publish event</FormButton></form>)}
      </Card></div>
      <div className="grid content-start gap-5"><Card title="Campus events"><div className="grid gap-3 sm:grid-cols-2">{events.map(event =>
        <div key={event.id} className="rounded-xl border border-line p-4"><h3 className="font-bold">{event.title}</h3>
          <p className="my-2 text-xs text-muted">{new Date(event.starts_at * 1000).toLocaleString()} · {event.price} KC · {event.reserved_seats}/{event.capacity} seats</p>
          <Button disabled={event.reserved_seats >= event.capacity || (!demoMode && event.price > 0)} onClick={() => void run(`v1/events/${event.id}/register`, {}, 'Ticket issued')}>Register</Button>
        </div>)}{!events.length && <p className="text-sm text-muted">No events published yet.</p>}</div></Card>
        <Card title="Your tickets"><div className="grid gap-2">{tickets.map(ticket => <div key={ticket.id} className="rounded-lg bg-brand-50 p-3 text-sm">
          <strong>{ticket.title}</strong> · {ticket.status}<p className="mt-1 break-all font-mono text-xs">Ticket {ticket.id} · code {ticket.code}</p>
        </div>)}{!tickets.length && <p className="text-sm text-muted">No tickets yet.</p>}</div></Card>
        {clubs.length > 0 && <Card title="Event gate"><form className="grid gap-2" onSubmit={event => {
          event.preventDefault(); const form = event.currentTarget;
          void run(`v1/tickets/${field(form, 'ticket')}/check-in`, { code: field(form, 'code') }, 'Ticket checked in');
        }}>
          <p className="text-xs text-muted">Validate a ticket for a club you manage. Check-in is one time.</p>
          <input className={inputClass} name="ticket" placeholder="Ticket ID" required />
          <input className={inputClass} name="code" placeholder="Ticket code" required />
          <FormButton>Check in</FormButton>
        </form></Card>}
      </div>
    </div>}

    {tab === 'wallet' && <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
      <div className="grid content-start gap-5"><Card title="KC simulation">
        <p className="text-3xl font-extrabold">{balance.available} <span className="text-base">KC available</span></p>
        <p className="mt-1 text-sm text-muted">{balance.reserved} KC committed to your tasks</p>
        <p className="mt-4 text-xs text-muted">This is test data. No rupees, bank funds, wallet authorization, or payouts are attached.</p>
        {demoMode && <div className="mt-4"><Button onClick={() => void run('dev/kc-grants', { amount: 500, key: crypto.randomUUID() }, '500 test KC added')}>Add 500 demo KC</Button></div>}
      </Card></div>
      <Card title="Your orders"><div className="grid gap-3">{orders.map(order => <div key={order.id} className="rounded-xl border border-line p-4">
        <div className="flex justify-between gap-3"><strong>{order.items.map(item => `${item.name} ×${item.quantity}`).join(', ')}</strong><span>{order.amount} KC</span></div>
        <p className="mt-1 text-xs text-muted">{order.status} · {order.id}</p>
        {order.status === 'ready' && <p className="mt-2 break-all text-xs">Pickup credential: <code>{order.pickup_code}</code></p>}
        {order.status === 'placed' && <div className="mt-2"><Button onClick={() => void run(`v1/orders/${order.id}/cancel`, {}, 'Order refunded')}>Cancel order</Button></div>}
      </div>)}{!orders.length && <p className="text-sm text-muted">No orders yet.</p>}</div></Card>
    </div>}
    <footer className="mt-10 border-t border-line pt-5 text-xs text-muted">{demoMode ? 'Connected demo backend' : 'Verified campus identity'} · KC and payments remain simulation only</footer>
  </main>;
}

function ShopOrders({ storeId, token, run }: {
  storeId: string; token?: string;
  run: (path: string, input: unknown, success?: string) => Promise<unknown>;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const load = useCallback(() => { void backend<Order[]>(`v1/orders?store_id=${storeId}`, token).then(setOrders).catch(() => setOrders([])); }, [storeId, token]);
  useEffect(() => { load(); }, [load]);
  return <div className="mt-2 grid gap-2">{orders.map(order => <div key={order.id} className="rounded-lg bg-white p-2 text-xs">
    <div>{order.items.map(item => item.name).join(', ')} · {order.status}</div>
    {['placed', 'preparing', 'ready'].includes(order.status) && <form className="mt-2 flex flex-wrap gap-2" onSubmit={event => {
      event.preventDefault(); const form = event.currentTarget;
      void run(`v1/orders/${order.id}/advance`, { code: order.status === 'ready' ? field(form, 'code') : null }, 'Order updated').then(load);
    }}>{order.status === 'ready' && <input className={inputClass} name="code" placeholder="Buyer pickup code" required />}
      <FormButton>{order.status === 'ready' ? 'Confirm pickup' : 'Advance order'}</FormButton></form>}
  </div>)}{!orders.length && <p className="text-xs text-muted">No orders. Refresh this page after a purchase.</p>}
  <button className="text-left text-xs underline" onClick={load}>Refresh queue</button></div>;
}

function PrintQueue({ storeId, token, run }: {
  storeId: string; token?: string; run: (path: string, input: unknown, success?: string) => Promise<unknown>;
}) {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const load = useCallback(() => { void backend<PrintJob[]>(`v1/print-jobs?store_id=${storeId}`, token).then(setJobs).catch(() => setJobs([])); }, [storeId, token]);
  useEffect(() => { load(); }, [load]);
  return <div className="grid gap-2">{jobs.map(job => <div key={job.id} className="rounded-lg bg-brand-50 p-3 text-sm">
    <strong>{job.file_name}</strong> · {job.status}
    {['placed', 'preparing', 'ready'].includes(job.status) && <form className="mt-2 flex gap-2" onSubmit={event => {
      event.preventDefault(); const form = event.currentTarget;
      void run(`v1/print-jobs/${job.id}/advance`, { code: job.status === 'ready' ? field(form, 'code') : null }, 'Print job updated').then(load);
    }}>{job.status === 'ready' && <input className={inputClass} name="code" placeholder="Pickup code" required />}
      <FormButton>{job.status === 'ready' ? 'Confirm collection' : 'Advance job'}</FormButton></form>}
  </div>)}<button className="text-left text-xs underline" onClick={load}>Refresh print queue</button></div>;
}
