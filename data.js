/* KART — seed catalogue and reference data (classic script, shared global scope) */

const DAY = 86400000;
const isoNow = () => new Date().toISOString();
const isoIn = (days, hour = 10, minute = 0) => {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
const isoHours = hours => new Date(Date.now() + hours * 3600000).toISOString();

const CAMPUS_AREAS = ['Main Campus', 'North Block', 'Hostel Zone', 'Sports Complex'];

const MODULES = [
  ['food', '🍽️', 'Canteen & Food', 'Order meals for pickup'],
  ['xerox', '🖨️', 'Xerox & Print', 'Documents made easy'],
  ['stationery', '📐', 'Academic Supplies', 'Everything for class'],
  ['tasks', '⚡', 'Task Marketplace', 'Earn and get help'],
  ['resale', '🔄', 'Buy / Sell / Rent', 'Campus-to-campus deals'],
  ['events', '🎟️', 'Events & Tickets', 'See what’s happening'],
  ['merch', '👕', 'Custom Merchandise', 'Make it yours'],
  ['services', '✨', 'Student Services', 'Skills from peers']
];

const PROMOS = {
  KART10: { kind: 'percent', value: 10, cap: 200, min: 150, label: '10% off, up to 200 KC' },
  NEW50: { kind: 'flat', value: 50, min: 300, label: '50 KC off orders over 300 KC' },
  LATE: { kind: 'percent', value: 15, cap: 120, min: 90, label: '15% off late-night orders' }
};

const SEED_PRODUCTS = [
  { id: 'f1', type: 'food', name: 'Masala Dosa Combo', vendor: 'Campus Bites', price: 85, mrp: 110, icon: '🥘', desc: 'Crisp dosa, coconut chutney and filter coffee on the side.', tag: 'Popular', stock: 24, rating: 4.7, ratingCount: 214, eta: 12, area: 'Main Campus', options: [] },
  { id: 'f2', type: 'food', name: 'Paneer Rice Bowl', vendor: 'Green Plate', price: 120, mrp: 140, icon: '🍛', desc: 'A filling lunch between classes with salad and curd.', tag: 'Fresh today', stock: 18, rating: 4.5, ratingCount: 132, eta: 15, area: 'North Block', options: [] },
  { id: 'f3', type: 'food', name: 'Cold Coffee', vendor: 'Campus Bites', price: 65, mrp: 75, icon: '🥤', desc: 'Made to order, ready in ten minutes.', tag: 'Quick pickup', stock: 40, rating: 4.8, ratingCount: 96, eta: 8, area: 'Main Campus', options: [{ name: 'Style', choices: ['Regular', 'Blended', 'With scoop'] }] },
  { id: 'f4', type: 'food', name: 'Veg Sandwich + Fries', vendor: 'Snack Junction', price: 95, mrp: 120, icon: '🥪', desc: 'Grilled sandwich, crispy fries and a dip.', tag: 'Best value', stock: 15, rating: 4.3, ratingCount: 77, eta: 14, area: 'Hostel Zone', options: [] },
  { id: 'f5', type: 'food', name: 'Masala Chai (4 cups)', vendor: 'Chai Point', price: 60, mrp: 80, icon: '🍵', desc: 'Four piping hot cups delivered to your block.', tag: 'Group pack', stock: 0, rating: 4.6, ratingCount: 58, eta: 10, area: 'Hostel Zone', options: [] },
  { id: 's1', type: 'stationery', name: 'Engineering Drawing Kit', vendor: 'Scholars Store', price: 340, mrp: 399, icon: '📐', desc: 'Tools for your first year drawing lab.', tag: 'In stock', stock: 9, rating: 4.4, ratingCount: 41, eta: 30, area: 'Main Campus', options: [] },
  { id: 's2', type: 'stationery', name: 'A4 Lab Record Bundle', vendor: 'Scholars Store', price: 180, mrp: 210, icon: '📚', desc: 'Three lab records and a graph notebook.', tag: 'Course bundle', stock: 26, rating: 4.6, ratingCount: 88, eta: 25, area: 'Main Campus', options: [] },
  { id: 's3', type: 'stationery', name: 'Scientific Calculator', vendor: 'Campus Supplies', price: 790, mrp: 899, icon: '🧮', desc: 'Non-programmable exam-approved model.', tag: 'Only 8 left', stock: 8, rating: 4.9, ratingCount: 151, eta: 35, area: 'North Block', options: [] },
  { id: 's4', type: 'stationery', name: 'Highlighter Set of 6', vendor: 'Campus Supplies', price: 145, mrp: 175, icon: '🖍️', desc: 'Six colours that do not bleed through paper.', tag: 'Restocked', stock: 32, rating: 4.2, ratingCount: 64, eta: 25, area: 'North Block', options: [] },
  { id: 's5', type: 'stationery', name: 'Assignment File Folder', vendor: 'Scholars Store', price: 70, mrp: 90, icon: '🗂️', desc: 'Sturdy folder that survives a full semester.', tag: 'Everyday', stock: 45, rating: 4.1, ratingCount: 33, eta: 20, area: 'Main Campus', options: [] },
  { id: 'm1', type: 'merch', name: 'KART Campus Hoodie', vendor: 'Print House', price: 699, mrp: 899, icon: '👕', desc: 'Custom colours and sizes, printed on order.', tag: 'Customizable', stock: 20, rating: 4.7, ratingCount: 74, eta: 120, area: 'Main Campus', options: [{ name: 'Colour', choices: ['Forest green', 'Black', 'White', 'College blue'] }, { name: 'Size', choices: ['Small', 'Medium', 'Large', 'Extra large'] }] },
  { id: 'm2', type: 'merch', name: 'Club Event Badges', vendor: 'Print House', price: 150, mrp: 180, icon: '🏷️', desc: 'Set of ten personalised badges for your club.', tag: 'Bulk friendly', stock: 60, rating: 4.5, ratingCount: 29, eta: 90, area: 'Main Campus', options: [{ name: 'Finish', choices: ['Matte', 'Glossy', 'Metallic'] }] },
  { id: 'm3', type: 'merch', name: 'Department Tee', vendor: 'Print House', price: 399, mrp: 499, icon: '🎽', desc: 'Lightweight tee with your department artwork.', tag: 'New', stock: 30, rating: 4.4, ratingCount: 52, eta: 120, area: 'Main Campus', options: [{ name: 'Size', choices: ['Small', 'Medium', 'Large', 'Extra large'] }] },
  { id: 'm4', type: 'merch', name: 'Sticker Pack (20 pcs)', vendor: 'Print House', price: 99, mrp: 120, icon: '✨', desc: 'Twenty die-cut stickers for laptops and bottles.', tag: 'Under 100', stock: 80, rating: 4.8, ratingCount: 118, eta: 45, area: 'Main Campus', options: [] },
  { id: 'r1', type: 'resale', name: 'Data Structures Textbook', vendor: 'Ananya R.', price: 420, mrp: 650, icon: '📕', desc: 'Second year edition, very good condition with solved examples.', tag: 'Pre-loved', stock: 1, rating: 4.6, ratingCount: 12, eta: 60, area: 'Hostel Zone', options: [] },
  { id: 'r2', type: 'resale', name: 'Cycle for Rent', vendor: 'Aditya S.', price: 100, mrp: 150, icon: '🚲', desc: 'Daily rental near the main gate, helmet included.', tag: 'Rental / day', stock: 3, rating: 4.5, ratingCount: 21, eta: 20, area: 'Main Campus', rental: true, options: [] },
  { id: 'r3', type: 'resale', name: 'Desk Lamp', vendor: 'Kabir M.', price: 210, mrp: 320, icon: '💡', desc: 'Warm LED lamp with three brightness levels.', tag: 'Like new', stock: 1, rating: 4.3, ratingCount: 7, eta: 45, area: 'Hostel Zone', options: [] },
  { id: 'r4', type: 'resale', name: 'Scientific Calculator (used)', vendor: 'Sneha T.', price: 480, mrp: 790, icon: '🧮', desc: 'Same exam-approved model, one semester of use.', tag: 'Used', stock: 1, rating: 4.0, ratingCount: 5, eta: 40, area: 'North Block', options: [] }
];

const SEED_EVENTS = [
  { id: 'e1', name: 'Hack the Campus', host: 'Coding Club', icon: '💻', date: isoIn(9, 9, 30), place: 'Innovation Hall', price: 120, seats: 48, taken: 31, category: 'Technology', desc: 'A one-day build sprint for practical campus ideas. Mentors, demos and prizes.', status: 'Published' },
  { id: 'e2', name: 'Design After Dark', host: 'Design Society', icon: '🎨', date: isoIn(15, 18, 0), place: 'Auditorium B', price: 0, seats: 120, taken: 64, category: 'Design', desc: 'Talks, portfolio reviews and hands-on design exercises after hours.', status: 'Published' },
  { id: 'e3', name: 'Founders Friday', host: 'Entrepreneurship Cell', icon: '🎤', date: isoIn(22, 16, 0), place: 'Seminar Room 2', price: 80, seats: 75, taken: 40, category: 'Business', desc: 'Student founders share what they learned building products on campus.', status: 'Published' },
  { id: 'e4', name: 'Sunset Sports Meet', host: 'Athletics Council', icon: '🏃', date: isoIn(4, 16, 30), place: 'Sports Complex', price: 0, seats: 200, taken: 118, category: 'Sports', desc: 'Inter-department relays, tug of war and a live results board.', status: 'Published' },
  { id: 'e5', name: 'Open Mic Night', host: 'Literary Society', icon: '🎙️', date: isoIn(6, 19, 0), place: 'Amphitheatre', price: 40, seats: 90, taken: 87, category: 'Culture', desc: 'Poetry, stand-up and acoustic sets from students across campus.', status: 'Published' },
  { id: 'e6', name: 'Resume Clinic', host: 'Placement Cell', icon: '📄', date: isoIn(2, 11, 0), place: 'Training Hall', price: 0, seats: 60, taken: 22, category: 'Career', desc: 'One-on-one resume reviews with seniors who cleared summer internships.', status: 'Published' }
];

const SEED_SERVICES = [
  { id: 'v1', name: 'Math & Physics Tutoring', provider: 'Riya M.', price: 250, unit: 'hour', icon: '📖', rating: 4.9, ratingCount: 64, desc: 'One-on-one help for first year courses, weekend batches available.', tags: ['Academic', 'First year'] },
  { id: 'v2', name: 'Poster & Slide Design', provider: 'Nikhil K.', price: 400, unit: 'project', icon: '🎨', rating: 4.8, ratingCount: 47, desc: 'Clean posters and presentations for campus events and clubs.', tags: ['Creative', 'Design'] },
  { id: 'v3', name: 'Event Photography', provider: 'Tara S.', price: 600, unit: 'hour', icon: '📸', rating: 5.0, ratingCount: 38, desc: 'Photos for clubs, talks and celebrations, edited within 48 hours.', tags: ['Creative', 'Events'] },
  { id: 'v4', name: 'Laundry Pickup & Fold', provider: 'Hostel Care', price: 120, unit: 'load', icon: '🧺', rating: 4.6, ratingCount: 91, desc: 'Doorstep pickup, washed and folded back to your block.', tags: ['Errand', 'Hostel'] },
  { id: 'v5', name: 'Resume & Interview Prep', provider: 'Aman G.', price: 300, unit: 'session', icon: '💼', rating: 4.7, ratingCount: 52, desc: 'Mock interviews, resume structure and referral guidance.', tags: ['Career'] },
  { id: 'v6', name: 'Bike Repair at Your Gate', provider: 'Workshop Wale', price: 200, unit: 'visit', icon: '🔧', rating: 4.5, ratingCount: 73, desc: 'Puncture, brake and gear fixes at the hostel gate.', tags: ['Repair', 'Errand'] }
];

const SEED_LISTINGS = [
  { id: 'L-3001', name: 'Scientific Calculator (like new)', price: 520, condition: 'Like new', desc: 'Barely used, original case included.', icon: '🧮', seller: 'Meera P.', status: 'live', rental: false, at: isoIn(-2), area: 'Hostel Zone' },
  { id: 'L-3002', name: 'Hostel Study Table Fan', price: 260, condition: 'Good', desc: 'Quiet table fan, works perfectly.', icon: '🌬️', seller: 'Rahul V.', status: 'live', rental: false, at: isoIn(-4), area: 'Hostel Zone' },
  { id: 'L-3003', name: 'DSLR for weekend rental', price: 450, condition: 'For rent', desc: 'Per day, includes 18-55mm lens and bag.', icon: '📷', seller: 'Tara S.', status: 'live', rental: true, at: isoIn(-1), area: 'Main Campus' },
  { id: 'L-3004', name: 'College Jacket (Large)', price: 550, condition: 'Used', desc: 'Warm jacket, size large, worn one winter.', icon: '🧥', seller: 'Imran S.', status: 'live', rental: false, at: isoIn(-6), area: 'North Block' },
  { id: 'L-3005', name: 'Desk Organiser + Pen Stand', price: 130, condition: 'Like new', desc: 'Wooden organiser, great for a small desk.', icon: '🗄️', seller: 'Ananya R.', status: 'sold', rental: false, at: isoIn(-9), area: 'Hostel Zone' },
  { id: 'L-3006', name: 'Bluetooth Speaker', price: 690, condition: 'Good', desc: 'Loud enough for a room, charges over USB-C.', icon: '🔊', seller: 'Kabir M.', status: 'live', rental: false, at: isoIn(-3), area: 'North Block' }
];

const SEED_REVIEWS = {
  f1: [
    { id: 'RV-1', user: 'Priya S.', rating: 5, text: 'Reached exactly at pickup time and it was still hot. Chutney is the best on campus.', at: isoIn(-3) },
    { id: 'RV-2', user: 'Devan J.', rating: 4, text: 'Good portion for the price. Coffee could be stronger.', at: isoIn(-7) }
  ],
  f2: [{ id: 'RV-3', user: 'Sneha T.', rating: 5, text: 'Paneer was fresh and the bowl is genuinely filling.', at: isoIn(-5) }],
  s3: [
    { id: 'RV-4', user: 'Arjun K.', rating: 5, text: 'Approved in my end semester exam, keys feel solid.', at: isoIn(-11) },
    { id: 'RV-5', user: 'Meera P.', rating: 4, text: 'Came with batteries. Slightly tight to press.', at: isoIn(-20) }
  ],
  m1: [{ id: 'RV-6', user: 'Riya M.', rating: 5, text: 'Colour matched the preview and the print has survived four washes.', at: isoIn(-8) }],
  r1: [{ id: 'RV-7', user: 'Devan J.', rating: 4, text: 'Pages clean, no markings. Seller was easy to reach.', at: isoIn(-13) }]
};

const SEED_USERS = [
  { id: 'U-1001', name: 'Alex Sharma', role: 'Student', hostel: 'Hostel C', joined: isoIn(-240), status: 'Active', kc: 2315 },
  { id: 'U-1002', name: 'Ananya Rao', role: 'Student', hostel: 'Day Scholar', joined: isoIn(-180), status: 'Active', kc: 1440 },
  { id: 'U-1003', name: 'Campus Bites', role: 'Vendor', hostel: 'Food Court', joined: isoIn(-320), status: 'Active', kc: 18420 },
  { id: 'U-1004', name: 'Print House', role: 'Vendor', hostel: 'Block A', joined: isoIn(-290), status: 'Active', kc: 9310 },
  { id: 'U-1005', name: 'Coding Club', role: 'Organizer', hostel: 'Innovation Hall', joined: isoIn(-150), status: 'Active', kc: 4100 },
  { id: 'U-1006', name: 'Riya Menon', role: 'Student', hostel: 'Hostel A', joined: isoIn(-95), status: 'Active', kc: 2760 },
  { id: 'U-1007', name: 'Hostel Care', role: 'Organizer', hostel: 'Hostel Zone', joined: isoIn(-60), status: 'Review', kc: 1180 },
  { id: 'U-1008', name: 'Kabir Mehta', role: 'Student', hostel: 'Hostel D', joined: isoIn(-21), status: 'Suspended', kc: 320 }
];

const SEED_NOTIFICATIONS = [
  { id: 'N-1', type: 'order', title: 'Masala Dosa Combo is ready for pickup', body: 'Show order KRT-1042 at the Campus Bites counter.', at: isoHours(-2), read: false, link: '#/orders' },
  { id: 'N-2', type: 'task', title: 'New bid on a task you follow', body: 'Riya M. bid 340 KC on “Help format a lab presentation”.', at: isoHours(-5), read: false, link: '#/tasks' },
  { id: 'N-3', type: 'event', title: 'Open Mic Night is 87% full', body: 'Grab your ticket before the amphitheatre fills up.', at: isoHours(-20), read: true, link: '#/events' }
];

const PRINT_SHOPS = ['Library Xerox', 'Print House', 'Dept. Copy Centre'];
const PICKUP_SLOTS = ['As soon as ready', '12:30 PM – 1:00 PM', '1:00 PM – 1:30 PM', '4:00 PM – 4:30 PM', '6:00 PM – 6:30 PM'];
const TASK_CATEGORIES = ['Pickup', 'Delivery', 'Digital', 'Academic help', 'Other'];
const ORDER_STATUSES = ['Placed', 'Preparing', 'Ready for pickup', 'Picked up', 'Cancelled'];
