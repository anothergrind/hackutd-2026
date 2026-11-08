import {
  Activity, ArrowLeft, ArrowRight, BadgeCheck, Bot, Brain, Building2, CalendarClock, Check, CircleSlash, Clock, Gauge, History, Inbox,
  Mail, Moon, Pencil, Play, Plus, Radar, RotateCcw, Scale, ShieldCheck, SlidersHorizontal, Sparkles, Sun, Ticket, Trash2, Truck, Users, Wrench, X, Zap,
  type LucideProps,
} from "lucide-react";

const icons = {
  activity: Activity, "arrow-left": ArrowLeft, "arrow-right": ArrowRight, badge: BadgeCheck, bot: Bot, brain: Brain, building: Building2,
  calendar: CalendarClock, check: Check, slash: CircleSlash, clock: Clock, gauge: Gauge, history: History, inbox: Inbox, mail: Mail,
  moon: Moon, pencil: Pencil, play: Play, plus: Plus, radar: Radar, reset: RotateCcw, scale: Scale, shield: ShieldCheck,
  sliders: SlidersHorizontal, sparkles: Sparkles, sun: Sun, ticket: Ticket, trash: Trash2, truck: Truck, users: Users, wrench: Wrench, x: X, zap: Zap,
};

export type IconName = keyof typeof icons;

export default function Icon({ name, size = 16, ...rest }: { name: IconName } & LucideProps) {
  const C = icons[name];
  return <C size={size} strokeWidth={1.6} aria-hidden {...rest} />;
}
