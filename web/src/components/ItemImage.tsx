import { cx } from './ui';

export function getImageUrl(name: string, type: 'product' | 'store' | 'user' | 'task' | 'listing' | 'event' | 'hero'): string {
  const n = name.toLowerCase();
  
  if (type === 'product') {
    if (n.includes('dosa')) return 'https://images.unsplash.com/photo-1589301760014-d929f39ce9b1?w=400&q=80';
    if (n.includes('coffee')) return 'https://images.unsplash.com/photo-1461023058943-0708e52c80cf?w=400&q=80';
    if (n.includes('rice') || n.includes('bowl')) return 'https://images.unsplash.com/photo-1548943487-a2e4b43b4850?w=400&q=80';
    if (n.includes('sandwich')) return 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&q=80';
    if (n.includes('drawing') || n.includes('kit')) return 'https://images.unsplash.com/photo-1585250069004-f6b8b08fa176?w=400&q=80';
    if (n.includes('record') || n.includes('book')) return 'https://images.unsplash.com/photo-1532153975070-2e9ab71f1b14?w=400&q=80';
    if (n.includes('calculator')) return 'https://images.unsplash.com/photo-1587145820266-a5951ee6f620?w=400&q=80';
    return 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80'; // generic product
  }
  
  if (type === 'store') {
    if (n.includes('bites')) return 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&q=80';
    if (n.includes('green')) return 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80';
    if (n.includes('xerox')) return 'https://images.unsplash.com/photo-1562564055-71e051d33c19?w=400&q=80';
    if (n.includes('scholar')) return 'https://images.unsplash.com/photo-1517702145080-e4a4d91435bb?w=400&q=80';
    return 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&q=80'; // generic store
  }
  
  if (type === 'user') {
    if (n.includes('alex')) return 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80';
    if (n.includes('riya')) return 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80';
    if (n.includes('nikhil')) return 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100&q=80';
    if (n.includes('meera')) return 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&q=80';
    if (n.includes('dean')) return 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&q=80';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=123F36&color=E8DCC4`; // fallback avatar
  }

  if (type === 'listing') {
    if (n.includes('textbook') || n.includes('structure')) return 'https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400&q=80';
    if (n.includes('cycle') || n.includes('bike')) return 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=400&q=80';
    if (n.includes('calculator')) return 'https://images.unsplash.com/photo-1587145820266-a5951ee6f620?w=400&q=80';
    return 'https://images.unsplash.com/photo-1493723843671-1d655e66ac1c?w=400&q=80';
  }

  if (type === 'event') {
    if (n.includes('hack')) return 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400&q=80';
    if (n.includes('design')) return 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=400&q=80';
    if (n.includes('founder')) return 'https://images.unsplash.com/photo-1475721028070-2051152a5127?w=400&q=80';
    if (n.includes('mic') || n.includes('music')) return 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&q=80';
    return 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=400&q=80';
  }

  if (type === 'task') {
    if (n.includes('digital') || n.includes('design')) return 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=400&q=80';
    if (n.includes('academic') || n.includes('proofread') || n.includes('tutor')) return 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=400&q=80';
    if (n.includes('pickup') || n.includes('delivery')) return 'https://images.unsplash.com/photo-1518281361980-b26bfd556770?w=400&q=80';
    return 'https://images.unsplash.com/photo-1484480974693-6ca0a78f11ec?w=400&q=80';
  }

  if (type === 'hero') {
    return 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&q=80'; // collaborative students
  }

  return 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80';
}

export function ItemImage({ 
  name, type, className, icon 
}: { 
  name: string; type: 'product' | 'store' | 'user' | 'task' | 'listing' | 'event' | 'hero'; className?: string; icon?: string 
}) {
  const url = getImageUrl(name, type);
  return (
    <div className={cx('relative overflow-hidden bg-brand-100', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      {icon && (
        <div className="absolute inset-0 flex items-center justify-center bg-brand-950/20 backdrop-blur-[2px] opacity-0 hover:opacity-100 transition-opacity">
          <span className="text-4xl drop-shadow-md" aria-hidden>{icon}</span>
        </div>
      )}
    </div>
  );
}
