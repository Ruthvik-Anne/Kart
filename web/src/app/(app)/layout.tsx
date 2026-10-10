import { Shell } from '@/components/Shell';
import { CartProvider } from '@/components/CartProvider';
import { CartModal } from '@/components/CartModal';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <CartProvider><Shell>{children}<CartModal /></Shell></CartProvider>;
}
